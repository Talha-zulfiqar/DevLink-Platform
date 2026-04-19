const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const Booking = require('../models/Booking');
const User = require('../models/User');
const Message = require('../models/Message');
const { protect, authorize } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
// Defer requiring socket helpers to runtime to avoid circular require problems

// Helper to detect time overlap
function timesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// Helper: create a system welcome message for a booking and emit socket events
async function createWelcomeMessage(booking) {
  try {
    console.log('💬 CREATING WELCOME MESSAGE FOR BOOKING:', booking._id);
    // Ensure booking has mentor/student populated or fetch them
    let mentor = booking.mentor;
    let student = booking.student;
    if (!mentor || !student || !mentor.firstName) {
      const full = await Booking.findById(booking._id).populate('mentor', 'firstName lastName').populate('student', 'firstName lastName');
      mentor = full.mentor || mentor;
      student = full.student || student;
    }

    const start = booking.startTime ? new Date(booking.startTime).toLocaleString() : (booking.date ? `${booking.date} ${booking.time || ''}` : 'the scheduled time');
    const content = `Hello! I've confirmed our session on ${start}. Looking forward to connecting with you!`;

    const msg = await Message.create({ booking: booking._id, sender: mentor._id || mentor, content, meta: { system: true, receiver: String(booking.student || student._id || booking.student) } });
    console.log('✅ WELCOME MESSAGE CREATED:', msg._id);

    try {
      const socketModule = require('../socket');
      const io = socketModule && typeof socketModule.getIo === 'function' ? socketModule.getIo() : null;
      const bid = booking._id.toString();
      const payload = {
        _id: msg._id,
        booking: booking._id,
        sender: { _id: String(mentor._id || mentor), firstName: (mentor && mentor.firstName) || '', lastName: (mentor && mentor.lastName) || '' },
        content: msg.content,
        meta: msg.meta || {},
        createdAt: msg.createdAt,
      };

      if (io) {
          try {
            // Fetch sockets currently in the booking room so we can avoid double-sending messages
            const socketsInRoom = await io.in(`booking_${bid}`).fetchSockets();
            const usersInRoom = new Set((socketsInRoom || []).map(s => String((s.user && s.user._id) || '')));

            // Emit to booking room (active chat windows)
            io.to(`booking_${bid}`).emit('chat-message', payload);

            // Emit to personal rooms only when the user is not already present in booking room
            const studentIdStr = String(booking.student);
            const mentorIdStr = String(booking.mentor);
            if (studentIdStr && !usersInRoom.has(studentIdStr)) io.to(`user_${studentIdStr}`).emit('chat-message', payload);
            if (mentorIdStr && !usersInRoom.has(mentorIdStr)) io.to(`user_${mentorIdStr}`).emit('chat-message', payload);

            const convPayload = { booking: bookingPayload, initialMessage: { id: String(msg._id), text: msg.content, sender: payload.sender, ts: msg.createdAt } };
            if (studentIdStr && !usersInRoom.has(studentIdStr)) io.to(`user_${studentIdStr}`).emit('conversation-created', convPayload);
            if (mentorIdStr && !usersInRoom.has(mentorIdStr)) io.to(`user_${mentorIdStr}`).emit('conversation-created', convPayload);

            console.log('🔌 SOCKET EVENTS EMITTED FOR NEW CONVERSATION (deduped)');
          } catch (e) {
            // Fallback: if fetchSockets fails, emit to both rooms (previous behavior)
            console.warn('Failed to fetch booking room sockets for dedup; falling back to broad emit', e && e.message ? e.message : e);
            io.to(`booking_${bid}`).emit('chat-message', payload);
            try { io.to(`user_${String(booking.student)}`).emit('chat-message', payload); } catch (e) {}
            try { io.to(`user_${String(booking.mentor)}`).emit('chat-message', payload); } catch (e) {}
            try { io.to(`user_${String(booking.student)}`).emit('conversation-created', convPayload); } catch (e) {}
            try { io.to(`user_${String(booking.mentor)}`).emit('conversation-created', convPayload); } catch (e) {}
          }

      // Emit a minimal, populated booking payload so clients don't rely on server-side
      // Mongoose docs (which may or may not be populated) and to avoid missing mentor data
      const bookingPayload = {
        _id: String(booking._id),
        startTime: booking.startTime || null,
        endTime: booking.endTime || null,
        meetingType: booking.meetingType || null,
        status: booking.status || null,
        mentor: booking.mentor && booking.mentor._id ? { _id: String(booking.mentor._id), firstName: booking.mentor.firstName || '', lastName: booking.mentor.lastName || '', avatar: booking.mentor.avatar || null } : (booking.mentor && booking.mentor.toString ? { _id: String(booking.mentor) } : null),
        student: booking.student && booking.student._id ? { _id: String(booking.student._id), firstName: booking.student.firstName || '', lastName: booking.student.lastName || '', avatar: booking.student.avatar || null } : (booking.student && booking.student.toString ? { _id: String(booking.student) } : null),
      };

  const convPayload = { booking: bookingPayload, initialMessage: { id: String(msg._id), text: msg.content, sender: payload.sender, ts: msg.createdAt } };
  io.to(`user_${String(booking.student)}`).emit('conversation-created', convPayload);
  io.to(`user_${String(booking.mentor)}`).emit('conversation-created', convPayload);
        console.log('🔌 SOCKET EVENTS EMITTED FOR NEW CONVERSATION');
      }
    } catch (e) {
      console.warn('Failed to emit chat-message/conversation-created after welcome message:', e && e.message ? e.message : e);
    }

    return msg;
  } catch (err) {
    console.error('❌ FAILED TO CREATE WELCOME MESSAGE:', err && err.message ? err.message : err);
    return null;
  }
}



// POST /api/bookings - create a booking (student books a mentor)
router.post('/', protect, async (req, res) => {
  try {
    console.log('📥 BOOKING REQUEST RECEIVED:', { body: req.body, headers: req.headers && { /* omit heavy */ }, user: { id: req.user && req.user._id, email: req.user && req.user.email } });

    const student = req.user;
    const { mentorId, mentor, startTime, endTime, date, time, duration, notes, timezone, meetingType } = req.body;

  // Validate required: mentorId (or mentor).
  // meetingType is optional and will default to 'video-call' if not provided.
    const missing = [];
    if (!mentorId && !mentor) missing.push('mentorId');
    // require either explicit start/end OR date+time+duration
    const hasExplicit = startTime && endTime;
    const hasParts = date && time && duration;
    if (!hasExplicit && !hasParts) {
      missing.push('startTime/endTime or date+time+duration');
    }

    if (missing.length) {
      console.log('❌ MISSING REQUIRED FIELDS:', missing);
      return res.status(422).json({ success: false, error: `Missing required fields: ${missing.join(', ')}`, missingFields: missing });
    }

    // Determine start/end
    let s = null;
    let e = null;
    if (hasExplicit) {
      s = new Date(startTime);
      e = new Date(endTime);
    } else if (hasParts) {
      s = new Date(`${date}T${time}:00`);
      if (!isNaN(s.getTime())) e = new Date(s.getTime() + Number(duration) * 60000);
    }

    if (!s || !e || isNaN(s) || isNaN(e) || s >= e) {
      console.log('❌ INVALID TIMES computed:', { startTime: startTime || `${date}T${time}`, endTime: endTime || (e ? e.toISOString() : null) });
      return res.status(422).json({ success: false, error: 'Invalid or missing start/end times. Provide startTime & endTime or date+time+duration.' });
    }

    // Prevent booking yourself
    const mentorIdFinal = mentorId || mentor;
    if (student._id.toString() === String(mentorIdFinal)) {
      console.log('❌ Attempt to book self by user', student._id.toString());
      return res.status(400).json({ success: false, message: 'Cannot book yourself' });
    }

    const mentorDoc = await User.findById(mentorIdFinal);
    // Support booking juniors who opted into mentoring as well as legacy mentors
    const isBookable = mentorDoc && mentorDoc.isActive && (
      mentorDoc.role === 'mentor' ||
      mentorDoc.isMentor === true ||
      mentorDoc.isMentorVerified === true ||
      (mentorDoc.role === 'junior' && mentorDoc.showInMentorList === true)
    );
    if (!isBookable) {
      console.log('❌ Mentor not found or not active/bookable:', mentorIdFinal, mentorDoc ? { id: mentorDoc._id.toString(), role: mentorDoc.role, isMentor: mentorDoc.isMentor, isMentorVerified: mentorDoc.isMentorVerified, showInMentorList: mentorDoc.showInMentorList } : null);
      return res.status(404).json({ success: false, message: 'Mentor not found or not available' });
    }

    // Check conflicts
    try {
      const conflict = await Booking.findOne({ 
        mentor: mentorIdFinal, 
        status: { $in: ['pending', 'confirmed'] }, 
        startTime: { $lt: e }, 
        endTime: { $gt: s } 
      });
      if (conflict) {
        console.log('❌ Mentor conflict for requested slot:', conflict._id.toString());
        return res.status(409).json({ success: false, message: 'Mentor is not available during requested time' });
      }

      const studentConflict = await Booking.findOne({ student: student._id, status: { $in: ['pending', 'confirmed'] }, $or: [{ startTime: { $lt: e }, endTime: { $gt: s } }] });
      if (studentConflict) {
        console.log('❌ Student has conflicting booking:', studentConflict._id.toString());
        return res.status(409).json({ success: false, message: 'You have another booking during this time' });
      }
    } catch (err) {
      console.warn('Conflict check failed:', err && err.message ? err.message : err);
    }

    // Compute price (approx by hours)
    const hours = (e - s) / (1000 * 60 * 60);
    const price = mentorDoc.hourlyRate ? Math.max(0, mentorDoc.hourlyRate * hours) : 0;

    const bookingData = {
      student: student._id,
      mentor: mentorIdFinal,
      startTime: s,
      endTime: e,
      notes: notes || '',
      timezone: timezone || '',
      price,
      status: req.body.status || 'pending',
      meetingType: meetingType || req.body.meetingType || 'video-call'
    };

    console.log('🔧 PROCESSED BOOKING DATA:', { mentor: mentorIdFinal, start: s.toISOString(), end: e.toISOString(), price });

    const booking = await Booking.create(bookingData);
    console.log('✅ BOOKING SAVED SUCCESS:', booking._id.toString());

    // Notify websocket clients
    try {
      const socketModule = require('../socket');
      if (socketModule && typeof socketModule.notifyBookingCreated === 'function') {
        await socketModule.notifyBookingCreated(booking);
      } else if (socketModule && typeof socketModule.getIo === 'function') {
        const io = socketModule.getIo();
        if (io) {
          const bid = booking._id.toString();
          const payload = { booking };
          io.to(`booking_${bid}`).emit('booking-created', payload);
          io.to(`user_${booking.student.toString()}`).emit('booking-created', payload);
          io.to(`user_${booking.mentor.toString()}`).emit('booking-created', payload);
        }
      }
    } catch (e) {
      console.warn('Failed to notify booking-created via socket:', e && e.message ? e.message : e);
    }

    // Send notifications to mentor and student
    try {
      const NotificationService = require('../utils/notificationService');
      const socketModule = require('../socket');
      
      // Notify mentor
      await NotificationService.create(booking.mentor, {
        type: 'booking',
        title: 'New Booking Request',
        message: `${student.firstName || student.email} wants to book a session with you`,
        relatedId: booking._id,
        icon: 'Calendar',
        actionUrl: `/bookings/${booking._id}`,
        metadata: { bookingId: booking._id, studentName: student.firstName },
      });

      // Notify via socket if mentor is online
      if (socketModule && typeof socketModule.notifyUser === 'function') {
        await socketModule.notifyUser(booking.mentor, {
          type: 'booking',
          title: 'New Booking Request',
          message: `${student.firstName || student.email} wants to book a session`,
          relatedId: booking._id,
          icon: 'Calendar',
          actionUrl: `/bookings/${booking._id}`,
        });
      }
    } catch (e) {
      console.warn('Failed to send booking notifications:', e && e.message ? e.message : e);
    }

    // Auto-create welcome message for new booking (send welcome message so conversation appears and participants are notified)
    try {
      await createWelcomeMessage(booking).catch((e) => console.warn('createWelcomeMessage failed in POST:', e && e.message ? e.message : e));
    } catch (e) {
      console.warn('createWelcomeMessage outer catch failed:', e && e.message ? e.message : e);
    }

    return res.status(201).json({ success: true, data: { booking } });
  } catch (err) {
    console.error('❌ BOOKING CREATION FAILED:', { error: err && err.message ? err.message : err, stack: err && err.stack ? err.stack : '' });
    return res.status(400).json({ success: false, error: err && err.message ? err.message : 'Booking creation failed', details: err && err.errors ? err.errors : undefined });
  }
});

// GET /api/bookings/my - Get current user's bookings
router.get('/my', protect, async (req, res) => {
  try {
    const userId = req.user && (req.user._id || req.user.id);
    console.log('📅 FETCHING BOOKINGS FOR USER:', userId);

    const bookings = await Booking.find({
      $or: [{ student: userId }, { mentor: userId }]
    })
      .populate('student', 'firstName lastName email avatar')
      .populate('mentor', 'firstName lastName email avatar title')
      .sort({ lastMessageAt: -1, startTime: 1 });

    console.log(`✅ FOUND ${bookings.length} BOOKINGS FOR USER ${userId}`);

    return res.json({ success: true, bookings, count: bookings.length });
  } catch (error) {
    console.error('❌ FETCH BOOKINGS ERROR:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

// GET /api/bookings/:id - return a single booking with participants
router.get('/:id', protect, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, message: 'Booking id required' });
    const booking = await Booking.findById(id).populate('student', 'firstName lastName email avatar').populate('mentor', 'firstName lastName email avatar title');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.json({ success: true, data: { booking } });
  } catch (err) {
    console.error('GET /bookings/:id error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/bookings/:id/read - mark conversation as read for current user (reset unread count)
router.put('/:id/read', protect, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user && (req.user._id || req.user.id);
    if (!bookingId) return res.status(400).json({ success: false, message: 'Booking id required' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Verify user is participant
    const isParticipant = (booking.student && String(booking.student) === String(userId)) || (booking.mentor && String(booking.mentor) === String(userId)) || req.user.role === 'admin';
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Not authorized' });

    // reset unread count for this user
    if (!booking.unreadCount) booking.unreadCount = {};
    if (booking.unreadCount.set) booking.unreadCount.set(String(userId), 0);
    else booking.unreadCount[String(userId)] = 0;
    await booking.save();

    // emit conversation-updated so UI can refresh badges
    try {
      const socketModule = require('../socket');
      const io = socketModule && typeof socketModule.getIo === 'function' ? socketModule.getIo() : null;
      const convPayload = { bookingId: bookingId, lastMessageAt: booking.lastMessageAt, unreadCount: booking.unreadCount && booking.unreadCount.toObject ? booking.unreadCount.toObject() : (booking.unreadCount || {}) };
      if (io) {
        // notify both participants
        try { if (booking.student) io.to(`user_${String(booking.student)}`).emit('conversation-updated', convPayload); } catch (e) {}
        try { if (booking.mentor) io.to(`user_${String(booking.mentor)}`).emit('conversation-updated', convPayload); } catch (e) {}
      }
    } catch (e) {
      console.warn('Failed to emit conversation-updated after marking read', e);
    }

    return res.json({ success: true, message: 'Marked conversation read', data: { bookingId, unreadCount: booking.unreadCount && booking.unreadCount.toObject ? booking.unreadCount.toObject() : (booking.unreadCount || {}) } });
  } catch (err) {
    console.error('PUT /bookings/:id/read error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});
// PATCH /api/bookings/:id/status - update booking status
router.patch(
  '/:id/status',
  protect,
  [param('id').isMongoId().withMessage('Invalid booking id'), body('status').isIn(['pending', 'confirmed', 'cancelled', 'completed'])],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { status } = req.body;
      const booking = await Booking.findById(req.params.id).populate('student mentor');
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

      const user = req.user;

      // Authorization rules
      if (status === 'confirmed') {
        if (!(user._id.equals(booking.mentor._id) || user.role === 'admin')) {
          return res.status(403).json({ success: false, message: 'Only the mentor or admin can confirm bookings' });
        }
      }

      if (status === 'cancelled') {
        const allowed = user._id.equals(booking.mentor._id) || user._id.equals(booking.student._id) || user.role === 'admin';
        if (!allowed) return res.status(403).json({ success: false, message: 'Only participant or admin can cancel' });
      }

      if (status === 'completed') {
        if (!(user._id.equals(booking.mentor._id) || user.role === 'admin')) {
          return res.status(403).json({ success: false, message: 'Only the mentor or admin can complete bookings' });
        }
      }

      if (booking.status === 'cancelled' && status !== 'cancelled') {
        return res.status(400).json({ success: false, message: 'Cannot change status of a cancelled booking' });
      }

      booking.status = status;
      await booking.save();

      // Notify websocket clients about update
      try {
        const socketModule = require('../socket');
        if (socketModule && typeof socketModule.notifyBookingUpdated === 'function') {
          await socketModule.notifyBookingUpdated(booking);
        } else if (socketModule && typeof socketModule.getIo === 'function') {
          const io = socketModule.getIo();
          if (io) {
            const bid = booking._id.toString();
            const payload = { booking };
            io.to(`booking_${bid}`).emit('booking-updated', payload);
            io.to(`user_${booking.student.toString()}`).emit('booking-updated', payload);
            io.to(`user_${booking.mentor.toString()}`).emit('booking-updated', payload);
          }
        }
      } catch (e) {
        console.warn('Failed to notify booking-updated via socket:', e && e.message ? e.message : e);
      }

      // When a booking is confirmed, create welcome message and emit events
      if (status === 'confirmed') {
        await createWelcomeMessage(booking).catch((e) => console.warn('createWelcomeMessage failed in PATCH:', e && e.message ? e.message : e));
      }

      // If cancelled, cancel any scheduled reminders
      if (status === 'cancelled') {
        try {
          const socketModule = require('../socket');
          if (socketModule && typeof socketModule.cancelReminder === 'function') socketModule.cancelReminder(booking._id);
        } catch (e) {
          console.warn('Failed to cancel reminder:', e && e.message ? e.message : e);
        }
      }

      return res.json({ success: true, message: 'Booking status updated', data: { booking } });
    } catch (err) {
      console.error('PATCH /bookings/:id/status error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
