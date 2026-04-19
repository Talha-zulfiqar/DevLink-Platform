const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const User = require('../models/User');
const File = require('../models/File');

let ioInstance = null;

const RECENT_STATUS_HOURS = parseInt(process.env.STATUS_RECENT_HOURS || '24', 10);

// Presence and reminders (in-memory)
const presence = new Map(); // userId -> Set(socketId)
const reminderTimers = new Map();
const REMINDER_MINUTES = parseInt(process.env.REMINDER_MINUTES || '15', 10);

// presenceRooms: Map<roomId, Map<userId, { sockets: Set, name, color, joinedAt }>>
const presenceRooms = new Map();

// Recent signaling candidate cache (in-memory)
// Map: roomName -> [{ fromUserId, candidate, timestamp }]
const recentCandidates = new Map();
const CANDIDATE_BUFFER_LIMIT = parseInt(process.env.CANDIDATE_BUFFER_LIMIT || '200', 10);
const CANDIDATE_BUFFER_TTL_MS = parseInt(process.env.CANDIDATE_BUFFER_TTL_MS || String(30 * 1000), 10); // default 30s

function getIo() {
  return ioInstance;
}

function isUserOnline(userId) {
  try {
    return presence.has(String(userId)) && presence.get(String(userId)).size > 0;
  } catch (e) { return false }
}

function computeStatusFromDoc(m) {
  try {
    const readBy = Array.isArray(m.readBy) ? m.readBy : [];
    if (readBy.length) return 'read';
    if (m.status && ['sent', 'delivered', 'read'].includes(String(m.status))) return String(m.status);
    const created = m.createdAt ? new Date(m.createdAt).getTime() : 0;
    const now = Date.now();
    const recentMs = RECENT_STATUS_HOURS * 60 * 60 * 1000;
    if (created && (now - created) <= recentMs) return 'delivered';
    return 'sent';
  } catch (e) { return m.status || 'sent' }
}

function initSocket(server, options = {}) {
  if (ioInstance) return ioInstance;

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  // In development allow localhost origins (different ports) for Socket.IO; in production restrict to clientUrl
  const socketCors = (process.env.NODE_ENV === 'development')
    ? { origin: true, methods: ['GET', 'POST'], credentials: true }
    : { origin: clientUrl, methods: ['GET', 'POST'], credentials: true };

  const io = new Server(server, {
    cors: socketCors,
    ...options,
  });

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || (socket.handshake && socket.handshake.query && socket.handshake.query.token);
      if (!token) return next(new Error('Authentication error: token required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('Authentication error: user not found'));
      socket.user = user;
      return next();
    } catch (err) {
      console.error('Socket auth error:', err && err.message ? err.message : err);
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const uid = user._id.toString();
    console.log(`Socket connected: ${socket.id} user=${user.email}`);

    // Join personal room
    socket.join(`user_${uid}`);

    // Presence tracking
    if (!presence.has(uid)) presence.set(uid, new Set());
    presence.get(uid).add(socket.id);
    io.emit('user-online', { userId: uid });

    socket.on('join-room', async ({ bookingId } = {}, ack) => {
      try {
        if (!bookingId) {
          if (typeof ack === 'function') ack({ success: false, error: 'bookingId required' });
          return socket.emit('error', { message: 'bookingId required' });
        }

        // 🔧 Accept test booking IDs that start with TEST_
        if (typeof bookingId === 'string' && bookingId.startsWith('TEST_')) {
          const roomName = `booking_${bookingId}`;
          socket.join(roomName);
          socket.emit('joined', { room: roomName, success: true, testMode: true });
          if (typeof ack === 'function') ack({ success: true, room: roomName, testMode: true });
          console.log(`✅ TEST MODE: Socket ${socket.id} joined ${roomName}`);
          return;
        }

        // Validate ObjectId format for real booking IDs
        if (!mongoose.Types.ObjectId.isValid(bookingId)) {
          if (typeof ack === 'function') ack({ success: false, error: 'Invalid booking ID format' });
          return socket.emit('joined', { success: false, error: 'Invalid booking ID format' });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
          if (typeof ack === 'function') ack({ success: false, error: 'Booking not found' });
          return socket.emit('error', { message: 'Booking not found' });
        }

        // Verify the socket user is a participant (student/mentor) or admin
        const isParticipant = (booking.student && booking.student.equals(user._id)) || (booking.mentor && booking.mentor.equals(user._id)) || user.role === 'admin';
        if (!isParticipant) {
          if (typeof ack === 'function') ack({ success: false, error: 'Not authorized to join this room' });
          return socket.emit('error', { message: 'Not authorized to join this room' });
        }

        // SAFE ADDITION: If the joining user is the mentor, mark booking as active
        try {
          const uidStr = socket.user && socket.user._id ? String(socket.user._id) : null;
          // Treat role === 'mentor' as the mentor role; keep legacy isMentor flag
          const isMentor = !!(uidStr && ((booking.mentor && String(booking.mentor) === uidStr) || (socket.user && socket.user.role === 'mentor') || socket.user.isMentor));
          if (isMentor && booking.status !== 'active') {
            try {
              booking.status = 'active';
              booking.startedAt = new Date();
              await booking.save();
              console.log(`🎯 Mentor ${uidStr} started meeting ${bookingId}; booking marked active`);
              try {
                io.to(`booking_${bookingId}`).emit('meeting_started', {
                  bookingId,
                  mentorName: (socket.user && (socket.user.name || `${socket.user.firstName || ''} ${socket.user.lastName || ''}`.trim())) || 'Mentor',
                  startedAt: booking.startedAt
                });
              } catch (e) { console.warn('[SOCKET] emit meeting_started failed', e) }
            } catch (saveErr) {
              console.error('[SOCKET] Failed to mark booking active on join-room:', saveErr && saveErr.message ? saveErr.message : saveErr);
            }
          }
        } catch (dbError) {
          console.error('Database error in join-room activation:', dbError && dbError.message ? dbError.message : dbError);
          // Don't block join-room on DB errors
        }

        // Join the socket.io room and notify participants
        socket.join(`booking_${bookingId}`);
        // notify the joining socket that it successfully joined
        socket.emit('joined', { bookingId });
        // optional ack for callers
        if (typeof ack === 'function') ack({ success: true, room: `booking_${bookingId}` });
        // notify other participants in the booking room that a participant joined
        try { socket.to(`booking_${bookingId}`).emit('participant-joined', { userId: String(user._id), bookingId }); } catch (e) {}
      } catch (err) {
        console.error('join-room error:', err);
        try { if (typeof ack === 'function') ack({ success: false, error: err && err.message ? err.message : String(err) }); } catch (e) {}
        socket.emit('error', { message: 'Server error joining room' });
      }
    });

    socket.on('leave-room', ({ bookingId }) => {
      try {
        socket.leave(`booking_${bookingId}`);
        // notify other participants that this socket left
        try { socket.to(`booking_${bookingId}`).emit('participant-left', { userId: String(user._id), bookingId }); } catch (e) {}
      } catch (e) { console.warn('leave-room handler error', e) }
    });

    // Signaling with detailed diagnostics, room verification and ack responses
    socket.on('webrtc-offer', async ({ bookingId, offer } = {}, ack) => {
      const eventType = 'OFFER'
      const roomName = `booking_${bookingId}`
      try {
        const userId = socket.user && socket.user._id ? String(socket.user._id) : (socket.userId || 'unknown')
        console.log(`[${eventType}] from=${userId} booking=${bookingId} type=${offer && offer.type ? offer.type : 'unknown'}`)

        // Fetch sockets in room
        const socketsInRoom = await io.in(roomName).fetchSockets()
        const totalSockets = Array.isArray(socketsInRoom) ? socketsInRoom.length : 0
        const otherSockets = (socketsInRoom || []).filter(s => s.id !== socket.id)
        console.log(`[OFFER-FORWARD] Room ${roomName}: ${totalSockets} total, ${otherSockets.length} others`)

        if (otherSockets.length === 0) {
          console.log(`[WARNING] No other peers in room ${roomName}`)
          if (typeof ack === 'function') ack({ success: false, forwarded: 0, toUsers: [], roomName, timestamp: new Date().toISOString(), error: 'No other peers in room' })
          return
        }

        const toUsers = []
        let forwarded = 0
        for (const targetSocket of otherSockets) {
          try {
            const receiverUserId = targetSocket.user && targetSocket.user._id ? String(targetSocket.user._id) : (targetSocket.userId || 'unknown')
            console.log(`[OFFER-FORWARD] ${socket.id} -> ${targetSocket.id} (user: ${receiverUserId})`)
            targetSocket.emit('webrtc-offer', { from: userId, bookingId, offer, timestamp: new Date().toISOString() })
            toUsers.push(receiverUserId)
            forwarded++
          } catch (e) {
            console.warn('[OFFER-FORWARD] emit failed', e)
          }
        }
        console.log(`[OFFER-SUCCESS] Forwarded to ${forwarded} peers`)
        if (typeof ack === 'function') ack({ success: true, forwarded, toUsers, roomName, timestamp: new Date().toISOString() })
      } catch (error) {
        console.error(`[OFFER-ERROR]`, error)
        if (typeof ack === 'function') ack({ success: false, forwarded: 0, toUsers: [], roomName, timestamp: new Date().toISOString(), error: String(error) })
      }
    })

    socket.on('webrtc-answer', async ({ bookingId, answer } = {}, ack) => {
      const eventType = 'ANSWER'
      const roomName = `booking_${bookingId}`
      try {
        const userId = socket.user && socket.user._id ? String(socket.user._id) : (socket.userId || 'unknown')
        console.log(`[${eventType}] from=${userId} booking=${bookingId} type=${answer && answer.type ? answer.type : 'unknown'}`)

        const socketsInRoom = await io.in(roomName).fetchSockets()
        const totalSockets = Array.isArray(socketsInRoom) ? socketsInRoom.length : 0
        const otherSockets = (socketsInRoom || []).filter(s => s.id !== socket.id)
        console.log(`[ANSWER-FORWARD] Room ${roomName}: ${totalSockets} total, ${otherSockets.length} others`)

        if (otherSockets.length === 0) {
          console.log(`[WARNING] No other peers in room ${roomName}`)
          if (typeof ack === 'function') ack({ success: false, forwarded: 0, toUsers: [], roomName, timestamp: new Date().toISOString(), error: 'No other peers in room' })
          return
        }

        const toUsers = []
        let forwarded = 0
        for (const targetSocket of otherSockets) {
          try {
            const receiverUserId = targetSocket.user && targetSocket.user._id ? String(targetSocket.user._id) : (targetSocket.userId || 'unknown')
            console.log(`[ANSWER-FORWARD] ${socket.id} -> ${targetSocket.id} (user: ${receiverUserId})`)
            targetSocket.emit('webrtc-answer', { from: userId, bookingId, answer, timestamp: new Date().toISOString() })
            toUsers.push(receiverUserId)
            forwarded++
          } catch (e) {
            console.warn('[ANSWER-FORWARD] emit failed', e)
          }
        }
        console.log(`[ANSWER-SUCCESS] Forwarded to ${forwarded} peers`)
        if (typeof ack === 'function') ack({ success: true, forwarded, toUsers, roomName, timestamp: new Date().toISOString() })
      } catch (error) {
        console.error(`[ANSWER-ERROR]`, error)
        if (typeof ack === 'function') ack({ success: false, forwarded: 0, toUsers: [], roomName, timestamp: new Date().toISOString(), error: String(error) })
      }
    })

    socket.on('webrtc-candidate', async ({ bookingId, candidate } = {}, ack) => {
      const eventType = 'CANDIDATE'
      const roomName = `booking_${bookingId}`
      try {
        const userId = socket.user && socket.user._id ? String(socket.user._id) : (socket.userId || 'unknown')
        const preview = candidate && candidate.candidate ? candidate.candidate.substring(0, 80) : '[object]'
        console.log(`[${eventType}] from=${userId} booking=${bookingId} candidate=${preview}...`)

        const socketsInRoom = await io.in(roomName).fetchSockets()
        const totalSockets = Array.isArray(socketsInRoom) ? socketsInRoom.length : 0
        const otherSockets = (socketsInRoom || []).filter(s => s.id !== socket.id)
        console.log(`[CANDIDATE-FORWARD] Room ${roomName}: ${totalSockets} total, ${otherSockets.length} others`)

        if (otherSockets.length === 0) {
          console.log(`[WARNING] No other peers in room ${roomName}`)
          if (typeof ack === 'function') ack({ success: false, forwarded: 0, toUsers: [], roomName, timestamp: new Date().toISOString(), error: 'No other peers in room' })
          return
        }

        const toUsers = []
        let forwarded = 0
        for (const targetSocket of otherSockets) {
          try {
            const receiverUserId = targetSocket.user && targetSocket.user._id ? String(targetSocket.user._id) : (targetSocket.userId || 'unknown')
            console.log(`[CANDIDATE-FORWARD] ${socket.id} -> ${targetSocket.id} (user: ${receiverUserId})`)
            targetSocket.emit('webrtc-candidate', { from: userId, bookingId, candidate, timestamp: new Date().toISOString() })
            toUsers.push(receiverUserId)
            forwarded++
          } catch (e) {
            console.warn('[CANDIDATE-FORWARD] emit failed', e)
          }
        }
        // store candidate in recent buffer so peers that missed it can request
        try {
          const roomArr = recentCandidates.get(roomName) || [];
          roomArr.push({ from: userId, candidate, timestamp: Date.now() });
          // trim and store
          while (roomArr.length > CANDIDATE_BUFFER_LIMIT) roomArr.shift();
          recentCandidates.set(roomName, roomArr);
        } catch (e) {
          console.warn('Failed to store recent candidate', e);
        }
        console.log(`[CANDIDATE-SUCCESS] Forwarded to ${forwarded} peers`)
        if (typeof ack === 'function') ack({ success: true, forwarded, toUsers, roomName, timestamp: new Date().toISOString() })
      } catch (error) {
        console.error(`[CANDIDATE-ERROR]`, error)
        if (typeof ack === 'function') ack({ success: false, forwarded: 0, toUsers: [], roomName, timestamp: new Date().toISOString(), error: String(error) })
      }
    })

    // Allow a client to request recent candidates for a booking room
    // Useful when a peer joined late or missed some candidate events
    socket.on('webrtc-request-candidates', async ({ bookingId } = {}, ack) => {
      const roomName = `booking_${bookingId}`;
      try {
        const arr = (recentCandidates.get(roomName) || []).filter(item => (Date.now() - (item.timestamp || 0)) <= CANDIDATE_BUFFER_TTL_MS);
        // Optionally re-emit to the requesting socket directly so it receives the same event as live-forward
        for (const item of arr) {
          try {
            socket.emit('webrtc-candidate', { from: item.from, bookingId, candidate: item.candidate, timestamp: new Date(item.timestamp).toISOString(), replay: true });
          } catch (e) {
            console.warn('Failed to re-emit cached candidate to socket', e);
          }
        }
        if (typeof ack === 'function') ack({ success: true, count: arr.length, roomName, timestamp: new Date().toISOString() });
      } catch (e) {
        console.error('webrtc-request-candidates error', e);
        if (typeof ack === 'function') ack({ success: false, count: 0, roomName, timestamp: new Date().toISOString(), error: String(e) });
      }
    });

    // Yjs updates over socket: forward doc updates to the booking room
    socket.on('yjs-update', async (data = {}) => {
      try {
        const { bookingId, update, room } = data;
        if (!update) return;
        const roomName = room || (bookingId ? `booking_${bookingId}` : null);
        if (!roomName) return;
        try {
          console.debug(`[SOCKET] Forwarding Y.js update to ${roomName}`);
          console.log('🔧 [LIVE-CODING-FIX] Broadcasting to room:', roomName);
          io.to(roomName).emit('yjs-update', { bookingId, update, room: roomName });
        } catch (e) {
          console.warn('[SOCKET] Failed to forward yjs-update to room', e);
        }
      } catch (err) {
        console.error('[SOCKET] yjs-update handler error', err);
      }
    });

    // Initial state exchange: request/provide handlers to sync docs when a peer joins
    socket.on('request-initial-state', async (data = {}) => {
      try {
        const roomName = data && data.room ? String(data.room) : (data && data.bookingId ? `booking_${data.bookingId}` : null);
        if (!roomName) return;
        console.log(`[SOCKET] request-initial-state received for room ${roomName} from ${socket.id}`);
        // forward request to other members in the room
        try { socket.to(roomName).emit('request-initial-state', data); } catch (e) { console.warn('[SOCKET] failed to forward request-initial-state', e); }
      } catch (err) {
        console.error('[SOCKET] request-initial-state handler error', err);
      }
    });

    socket.on('provide-initial-state', async (data = {}) => {
      try {
        const roomName = data && data.room ? String(data.room) : (data && data.bookingId ? `booking_${data.bookingId}` : null);
        if (!roomName) return;
        console.log(`[SOCKET] provide-initial-state received for room ${roomName} from ${socket.id} — forwarding`);
        try { socket.to(roomName).emit('provide-initial-state', data); } catch (e) { console.warn('[SOCKET] failed to forward provide-initial-state', e); }
      } catch (err) {
        console.error('[SOCKET] provide-initial-state handler error', err);
      }
    });

    // Simple direct sync room (backup / optional lightweight mode)
    socket.on('join-simple-room', ({ bookingId } = {}, ack) => {
      try {
        if (!bookingId) return;
        const roomName = `booking_${bookingId}`;
        socket.join(roomName);
        try { socket.emit('joined-simple', { room: roomName, bookingId }) } catch (e) {}
        if (typeof ack === 'function') ack({ success: true, room: roomName });
        console.log(`[SOCKET] Socket ${socket.id} joined simple room ${roomName}`);
      } catch (e) { console.warn('[SOCKET] join-simple-room failed', e) }
    });

    socket.on('simple-code-update', (data = {}) => {
      try {
        const { bookingId, code, room } = data;
        const roomName = room || (bookingId ? `booking_${bookingId}` : null);
        if (!roomName) return;
        // Broadcast simple-code-update to everyone in the room (including sender to keep parity)
        try {
          io.to(roomName).emit('simple-code-update', { bookingId, code, room: roomName });
          // diagnostic
          console.debug(`[SOCKET] simple-code-update forwarded to ${roomName} (len=${(code||'').length})`);
        } catch (e) { console.warn('[SOCKET] Failed to forward simple-code-update', e) }
      } catch (err) { console.error('[SOCKET] simple-code-update handler error', err) }
    });

    // Typing
    socket.on('typing', ({ bookingId }) => socket.to(`booking_${bookingId}`).emit('typing', { userId: uid, bookingId }));
    socket.on('stop-typing', ({ bookingId }) => socket.to(`booking_${bookingId}`).emit('stop-typing', { userId: uid, bookingId }));

    // Chat
    socket.on('chat-message', async ({ bookingId, content, meta = {}, attachments = [] }) => {
      try {
        if (!bookingId || !content) return;
        // Validate that the sender is a participant of the booking to prevent spoofing
        const booking = await Booking.findById(bookingId).select('student mentor');
        if (!booking) return socket.emit('error', { message: 'Booking not found' });
        const isParticipant = (booking.student && booking.student.equals(user._id)) || (booking.mentor && booking.mentor.equals(user._id)) || user.role === 'admin';
        if (!isParticipant) return socket.emit('error', { message: 'Not authorized to send messages for this booking' });

        // If attachments provided, validate ownership and existence
        let attachedFiles = [];
        try {
          if (Array.isArray(attachments) && attachments.length) {
            const ids = (attachments || []).filter(a => a && typeof a === 'string' && mongoose.Types.ObjectId.isValid(String(a))).map(a => String(a));
            if (ids.length) {
              attachedFiles = await File.find({ _id: { $in: ids } }).lean();
              // ensure the sender owns all files (or is admin)
              const unauthorized = (attachedFiles || []).some(f => (!(f && String(f.uploadedBy) === String(user._id)) && user.role !== 'admin'));
              if (unauthorized) {
                try { socket.emit('error', { message: 'One or more attached files are not owned by you' }) } catch (e) {}
                return;
              }
            }
          }
        } catch (e) {
          console.warn('Failed to validate attachments for chat-message', e);
          attachedFiles = [];
        }

        const msg = await Message.create({ booking: bookingId, sender: user._id, content, meta, attachments: (attachedFiles || []).map(f => f._id) });
        const payload = {
          _id: msg._id,
          booking: bookingId,
          // include sender profile details so clients can show avatar/initials
          sender: { _id: String(user._id), firstName: user.firstName, lastName: user.lastName, avatar: user.avatar || null },
          content: msg.content,
          meta: msg.meta || {},
          attachments: (attachedFiles || []).map(f => ({ _id: String(f._id), originalName: f.originalName, mimeType: f.mimeType, size: f.size, path: f.path, uploadedBy: String(f.uploadedBy) })),
          readBy: Array.isArray(msg.readBy) ? msg.readBy.map(r => ({ userId: String(r.userId), readAt: r.readAt })) : [],
          reactions: Array.isArray(msg.reactions) ? msg.reactions.map(r => ({ emoji: r.emoji, users: Array.isArray(r.users) ? r.users.map(u => String(u)) : [], count: Number(r.count || (Array.isArray(r.users) ? r.users.length : 0)) })) : [],
          createdAt: msg.createdAt,
          status: computeStatusFromDoc(msg),
        };
        // Update booking meta: lastMessageAt and unread counts for recipients
        // Note: declare recipients in outer scope so it can be used later when deciding 'delivered' status
        let recipients = [];
        try {
          const bk = await Booking.findById(bookingId);
          if (bk) {
            bk.lastMessageAt = msg.createdAt;
            // Ensure unreadCount map exists
            if (!bk.unreadCount) bk.unreadCount = {};
            const senderIdStr = String(user._id);
            const studentId = bk.student ? String(bk.student) : null;
            const mentorId = bk.mentor ? String(bk.mentor) : null;
            recipients = [];
            if (studentId && studentId !== senderIdStr) recipients.push(studentId);
            if (mentorId && mentorId !== senderIdStr && mentorId !== studentId) recipients.push(mentorId);
            for (const r of recipients) {
              const prev = bk.unreadCount.get ? (bk.unreadCount.get(r) || 0) : (bk.unreadCount[r] || 0);
              const next = (Number(prev) || 0) + 1;
              if (bk.unreadCount.set) bk.unreadCount.set(r, next);
              else bk.unreadCount[r] = next;
            }
            await bk.save();
            // Check whether any recipient has blocked the sender; if so, prevent message send
            try {
              const blockedCount = await User.countDocuments({ _id: { $in: recipients }, blockedUsers: user._id });
              if (blockedCount && blockedCount > 0) {
                // At least one recipient has blocked this sender; abort and inform sender
                try { socket.emit('error', { message: 'Unable to send message: recipient has blocked you' }); } catch (e) {}
                return;
              }
            } catch (e) { /* ignore blocking check failures and continue */ }
            // emit conversation-updated so clients refresh their lists/badges
            try {
              const convPayload = { bookingId: bookingId, lastMessageAt: bk.lastMessageAt, unreadCount: bk.unreadCount && bk.unreadCount.toObject ? bk.unreadCount.toObject() : (bk.unreadCount || {}) };
              if (io) {
                if (studentId) io.to(`user_${studentId}`).emit('conversation-updated', convPayload);
                if (mentorId) io.to(`user_${mentorId}`).emit('conversation-updated', convPayload);
              }
            } catch (e) {
              console.warn('Failed to emit conversation-updated', e);
            }
          }
        } catch (e) {
          console.warn('Failed to update booking lastMessageAt/unreadCount', e);
        }
        // Emit to booking room (users who joined the room) so active chat windows receive it
        // To avoid duplicate delivery (same socket receiving the event twice via booking room and personal room),
        // fetch the user ids currently present in the booking room and only emit to personal user rooms for
        // recipients that are NOT currently in the booking room.
        try {
          const bookingRoomSockets = await io.in(`booking_${bookingId}`).fetchSockets();
          const usersInBooking = new Set((bookingRoomSockets || []).map(s => String((s.user && s.user._id) || '')));
          io.to(`booking_${bookingId}`).emit('chat-message', payload);

          const studentId = booking.student ? booking.student.toString() : null;
          const mentorId = booking.mentor ? booking.mentor.toString() : null;

          if (studentId && !usersInBooking.has(studentId)) {
            io.to(`user_${studentId}`).emit('chat-message', payload);
            try { const room = io.sockets.adapter.rooms.get(`user_${studentId}`); console.log(`Emitted chat-message to user_${studentId} (sockets=${room ? room.size : 0})`); } catch(e){}
          }
          if (mentorId && !usersInBooking.has(mentorId)) {
            io.to(`user_${mentorId}`).emit('chat-message', payload);
            try { const room = io.sockets.adapter.rooms.get(`user_${mentorId}`); console.log(`Emitted chat-message to user_${mentorId} (sockets=${room ? room.size : 0})`); } catch(e){}
          }
        } catch (emitErr) {
          console.error('Error emitting chat-message to rooms (dedup logic):', emitErr && emitErr.message ? emitErr.message : emitErr);
        }
        // Message status: mark as 'delivered' if any recipient is online (coarse-grained)
        try {
          const onlineRecipients = recipients.filter(rid => presence.has(String(rid)) && presence.get(String(rid)).size > 0);
          if (onlineRecipients.length) {
            msg.status = 'delivered';
            await msg.save();
            const statusPayload = { messageId: String(msg._id), status: 'delivered', bookingId };
            // notify booking room and participants
            io.to(`booking_${bookingId}`).emit('message-status-update', statusPayload);
            for (const rid of recipients) {
              try { io.to(`user_${rid}`).emit('message-status-update', statusPayload); } catch(e) {}
            }
          }
        } catch (e) {
          console.warn('Failed to set message status to delivered', e);
        }
      } catch (err) {
        console.error('chat-message error:', err && err.message ? err.message : err);
      }
    });

    // Typing indicators: typingStart / typingStop
    socket.on('typingStart', ({ bookingId } = {}) => {
      try {
        if (!bookingId) return;
        // broadcast to all sockets in booking room except sender
        socket.to(`booking_${bookingId}`).emit('typing-start', { bookingId, user: { _id: String(user._id), firstName: user.firstName, avatar: user.avatar || null } });
      } catch (e) { console.warn('typingStart handler error', e); }
    });

    socket.on('typingStop', ({ bookingId } = {}) => {
      try {
        if (!bookingId) return;
        socket.to(`booking_${bookingId}`).emit('typing-stop', { bookingId, user: { _id: String(user._id), firstName: user.firstName, avatar: user.avatar || null } });
      } catch (e) { console.warn('typingStop handler error', e); }
    });

    socket.on('get-chat-history', async ({ bookingId, limit = 50 }) => {
      try {
        const messages = await Message.find({ booking: bookingId })
          .sort({ createdAt: -1 })
          .limit(parseInt(limit, 10))
          .populate('sender', 'firstName lastName avatar')
          .populate('attachments');

        // Normalize messages into plain objects and ensure sender._id is a string
        const normalized = messages.reverse().map((m) => {
          const readBy = Array.isArray(m.readBy) ? m.readBy.map(r => ({ userId: String(r.userId), readAt: r.readAt })) : [];
          const reactions = Array.isArray(m.reactions) ? m.reactions.map(r => ({ emoji: r.emoji, users: Array.isArray(r.users) ? r.users.map(u => String(u)) : [], count: Number(r.count || (Array.isArray(r.users) ? r.users.length : 0)) })) : [];
          // compute a fallback status for older messages that may not have status field
          let status = 'sent';
          try {
            if (readBy.length) status = 'read';
            else if (m.status && ['sent', 'delivered', 'read'].includes(String(m.status))) status = String(m.status);
            else {
              const created = m.createdAt ? new Date(m.createdAt).getTime() : 0;
              const now = Date.now();
              const recentMs = RECENT_STATUS_HOURS * 60 * 60 * 1000;
              if (created && (now - created) <= recentMs) status = 'delivered';
              else status = 'sent';
            }
          } catch (e) { status = m.status || 'sent' }
          return {
            _id: m._id,
            booking: m.booking,
            content: m.content,
            meta: m.meta || {},
            createdAt: m.createdAt,
            readBy,
            reactions,
            status,
            sender: m.sender ? { _id: String(m.sender._id), firstName: m.sender.firstName, lastName: m.sender.lastName, avatar: m.sender.avatar || null } : null,
          };
        });

        socket.emit('chat-history', normalized);
      } catch (err) {
        console.error('get-chat-history error:', err && err.message ? err.message : err);
        socket.emit('error', { message: 'Unable to load chat history' });
      }
    });

    socket.on('disconnect', (reason) => {
      // Presence cleanup
      if (presence.has(uid)) {
        const s = presence.get(uid);
        s.delete(socket.id);
        if (s.size === 0) {
          presence.delete(uid);
          io.emit('user-offline', { userId: uid });
        }
      }
      console.log(`Socket disconnected: ${socket.id} reason=${reason}`);
    });
    
    // =================== AUTO-END CALL FUNCTIONALITY (ADDED) ===================
    // Listen for explicit call end from a client and notify other participants in the booking room
    socket.on('call-ended', (data = {}) => {
      try {
        const bookingId = data.bookingId || data.roomId || null;
        const endedBy = data.userId || (socket.user && socket.user._id) || socket.id;
        if (!bookingId) {
          console.warn('[SOCKET] call-ended received without bookingId', data);
          return;
        }
        const roomName = `booking_${bookingId}`;
        console.log(`[SOCKET] User ${endedBy} ended call in room ${roomName}`);

        // Notify other sockets in the booking room
        try {
          socket.to(roomName).emit('remote-call-ended', {
            bookingId,
            reason: 'other_party_ended',
            endedBy,
            timestamp: new Date().toISOString()
          });
        } catch (e) { console.warn('[SOCKET] failed to emit remote-call-ended', e) }

        // Confirm to the sender
        try {
          socket.emit('call-ended-confirmation', {
            message: 'Call ended successfully',
            bookingId
          });
        } catch (e) { console.warn('[SOCKET] failed to emit call-ended-confirmation', e) }

      } catch (error) {
        console.error('[SOCKET] Error handling call-ended:', error);
        try { socket.emit('error', { message: 'Failed to end call properly' }) } catch (e) {}
      }
    });

    // Handler for when video call ends (explicit end from client)
    socket.on('end-call', async (data = {}) => {
      try {
        console.log('[Socket] end-call event received:', data);
        const { bookingId, userId } = data;

        if (!bookingId) {
          console.warn('[Socket] end-call missing bookingId');
          return;
        }

        // Update booking status to completed
        try {
          const updatedBooking = await Booking.findByIdAndUpdate(
            bookingId,
            {
              $set: {
                active: false,
                status: 'completed',
                endedAt: new Date()
              }
            },
            { new: true }
          );

          if (!updatedBooking) {
            console.warn(`[Socket] Booking ${bookingId} not found`);
            return;
          }

          console.log(`✅ [Socket] Meeting ${bookingId} marked as completed`);

          // Notify all participants in the booking room
          const roomName = `booking_${bookingId}`;
          io.to(roomName).emit('meeting_ended', {
            bookingId,
            endedAt: new Date().toISOString(),
            status: 'completed',
            message: 'Meeting has ended',
            updatedBy: userId || 'system'
          });

          // Also emit to update booking lists for any listeners
          io.emit('booking-updated', {
            bookingId,
            status: 'completed',
            active: false,
            endedAt: new Date().toISOString()
          });
        } catch (err) {
          console.error('[Socket] Failed to update booking on end-call:', err);
        }
      } catch (error) {
        console.error('[Socket] Error in end-call handler:', error);
      }
    });

    // Optional: Also handle call timeout/auto-end
    socket.on('call-timeout', async (data = {}) => {
      try {
        const { bookingId } = data;
        if (!bookingId) return;

        await Booking.findByIdAndUpdate(bookingId, {
          $set: {
            active: false,
            status: 'completed',
            endedAt: new Date(),
            autoEnded: true
          }
        });

        const roomName = `booking_${bookingId}`;
        io.to(roomName).emit('meeting_ended', {
          bookingId,
          endedAt: new Date().toISOString(),
          status: 'completed',
          autoEnded: true,
          message: 'Meeting ended automatically'
        });
      } catch (error) {
        console.error('[Socket] Error in call-timeout:', error);
      }
    });

    // ====================
    // SAFE COLLAB HANDLERS - ADD BELOW EXISTING CODE
    // ====================
    // Track active collaboration rooms (per-connection memory is fine; server restart clears)
    const activeCollabRooms = new Map();

    // 1. Join collaboration room
    socket.on('join-collab-room', (roomId) => {
      try {
        console.log(`[Collab] ${socket.id} joining room: ${roomId}`);
        if (!roomId || typeof roomId !== 'string' || roomId.length > 200) return;
        socket.join(roomId);
        if (!activeCollabRooms.has(roomId)) activeCollabRooms.set(roomId, new Set());
        activeCollabRooms.get(roomId).add(socket.id);
        socket.emit('collab-joined', { roomId, participants: activeCollabRooms.get(roomId).size });
      } catch (error) {
        console.error('[Collab] join-collab-room error:', error);
      }
    });

    // 2. Handle code updates - broadcast to room except sender
    socket.on('collab-code-update', (data = {}) => {
      try {
        const { roomId, code } = data || {};
        if (!roomId || typeof roomId !== 'string') return;
        if (typeof code !== 'string') return;
        socket.to(roomId).emit('collab-code-update', { roomId, code, senderId: socket.id, timestamp: Date.now() });
      } catch (error) {
        console.error('[Collab] collab-code-update error:', error);
      }
    });

    // 3. Leave collaboration room
    socket.on('leave-collab-room', (roomId) => {
      try {
        if (!roomId || typeof roomId !== 'string') return;
        socket.leave(roomId);
        if (activeCollabRooms.has(roomId)) {
          activeCollabRooms.get(roomId).delete(socket.id);
          if (activeCollabRooms.get(roomId).size === 0) activeCollabRooms.delete(roomId);
        }
      } catch (error) {
        console.error('[Collab] leave-collab-room error:', error);
      }
    });

    // 4. Cleanup collab rooms for this socket on disconnect
    socket.on('disconnect', () => {
      try {
        for (const [roomId, sockets] of activeCollabRooms.entries()) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            if (sockets.size === 0) activeCollabRooms.delete(roomId);
          }
        }
      } catch (error) {
        console.error('[Collab] disconnect cleanup error:', error);
      }
    });

    // When a socket disconnects inform other room participants (non-destructive handler)
    socket.on('disconnect', () => {
      try {
        const rooms = Array.from(socket.rooms || []);
        rooms.forEach(roomId => {
          if (roomId && roomId !== socket.id) {
            try {
              socket.to(roomId).emit('user_left', {
                userId: (socket.user && String(socket.user._id)) || socket.id,
                roomId,
                reason: 'disconnected',
                timestamp: new Date().toISOString()
              });
            } catch (e) { console.warn('[SOCKET] failed to notify user_left for room', roomId, e) }
          }
        });
      } catch (error) {
        console.error('[SOCKET] Error in additional disconnect handler:', error);
      }
    });

  // ============= NEW PRESENCE HANDLERS (SAFE) =============
  // Isolated from collab-* events. Uses presence-* event names only.
  // Note: presenceRooms is module-level (shared) and declared above so all sockets see the same state.

    function pickColorForId(id) {
      try {
        const palette = ['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#10b981','#06b6d4','#3b82f6','#8b5cf6','#ec4899'];
        let h = 0;
        for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
        return palette[h % palette.length];
      } catch (e) { return '#6b7280' }
    }

    // presence-join: join presence tracking for a booking room
    socket.on('presence-join', (data = {}, ack) => {
      try {
        const roomId = data && data.roomId ? String(data.roomId) : null;
        const displayName = data && data.displayName ? String(data.displayName) : ((socket.user && (socket.user.firstName || socket.user.name)) || 'User');
        if (!roomId) return typeof ack === 'function' ? ack({ success: false, error: 'roomId required' }) : null;

        // Ensure the socket is joined to the booking room so broadcasts reach it
        try {
          socket.join(`booking_${roomId}`);
        } catch (e) {}

        if (!presenceRooms.has(roomId)) presenceRooms.set(roomId, new Map());
        const users = presenceRooms.get(roomId);
        const uid = String(socket.user && socket.user._id ? socket.user._id : socket.id);

        if (!users.has(uid)) {
          users.set(uid, { sockets: new Set(), name: displayName, color: pickColorForId(uid), joinedAt: new Date().toISOString() });
        }
        const record = users.get(uid);
        record.sockets.add(socket.id);

  // Broadcast to others in the booking room (separate event namespace)
  try { socket.to(`booking_${roomId}`).emit('presence-user-joined', { user: { userId: uid, name: record.name, color: record.color, joinedAt: record.joinedAt } }); } catch (e) {}

        if (typeof ack === 'function') ack({ success: true, user: { userId: uid, name: record.name, color: record.color, joinedAt: record.joinedAt } });
      } catch (e) {
        console.error('[PRESENCE] presence-join error', e);
        if (typeof ack === 'function') ack({ success: false, error: String(e) });
      }
    });

    // presence-leave: remove socket from presence tracking
    socket.on('presence-leave', (data = {}, ack) => {
      try {
        const roomId = data && data.roomId ? String(data.roomId) : null;
        if (!roomId) return typeof ack === 'function' ? ack({ success: false, error: 'roomId required' }) : null;
        if (!presenceRooms.has(roomId)) return typeof ack === 'function' ? ack({ success: true }) : null;
        const users = presenceRooms.get(roomId);
        const uid = String(socket.user && socket.user._id ? socket.user._id : socket.id);
        if (!users.has(uid)) return typeof ack === 'function' ? ack({ success: true }) : null;

        const record = users.get(uid);
        record.sockets.delete(socket.id);
        if (record.sockets.size === 0) {
          users.delete(uid);
          try { socket.to(`booking_${roomId}`).emit('presence-user-left', { user: { userId: uid, name: record.name } }); } catch (e) {}
        }

        if (typeof ack === 'function') ack({ success: true });
      } catch (e) {
        console.error('[PRESENCE] presence-leave error', e);
        if (typeof ack === 'function') ack({ success: false, error: String(e) });
      }
    });

    // presence-get-users: send current user list for a room to requester
    socket.on('presence-get-users', (data = {}, ack) => {
      try {
        const roomId = data && data.roomId ? String(data.roomId) : null;
        if (!roomId) return typeof ack === 'function' ? ack({ success: false, error: 'roomId required' }) : null;
        const users = presenceRooms.get(roomId) || new Map();
        const list = [];
        for (const [userId, rec] of users.entries()) {
          list.push({ userId, name: rec.name, color: rec.color, joinedAt: rec.joinedAt, sockets: Array.from(rec.sockets) });
        }
        // Send only to requester
        try { socket.emit('presence-room-users', { roomId, users: list }); } catch (e) {}
        if (typeof ack === 'function') ack({ success: true, roomId, users: list });
      } catch (e) {
        console.error('[PRESENCE] presence-get-users error', e);
        if (typeof ack === 'function') ack({ success: false, error: String(e) });
      }
    });

    // Cleanup presence on disconnect (ensure we emit left events)
    socket.on('disconnect', () => {
      try {
        for (const [roomId, users] of presenceRooms.entries()) {
          for (const [userId, rec] of users.entries()) {
            if (rec.sockets.has(socket.id)) {
              rec.sockets.delete(socket.id);
              if (rec.sockets.size === 0) {
                users.delete(userId);
                try { socket.to(`booking_${roomId}`).emit('presence-user-left', { user: { userId, name: rec.name } }); } catch (e) {}
              }
            }
          }
          if (users.size === 0) presenceRooms.delete(roomId);
        }
      } catch (e) { console.error('[PRESENCE] disconnect cleanup error', e) }
    });
    // ============= END PRESENCE HANDLERS =============
  });

  ioInstance = io;
  return io;
}

// Notification helpers
async function notifyBookingCreated(booking) {
  try {
    const bid = booking._id.toString();
    // ensure booking is populated with participant details before emitting
    let fullBooking = booking;
    try {
      fullBooking = await Booking.findById(bid).populate('student', 'firstName lastName email avatar').populate('mentor', 'firstName lastName email avatar title') || booking;
    } catch (e) {
      console.warn('notifyBookingCreated: failed to populate booking, emitting raw booking', e && e.message ? e.message : e);
      fullBooking = booking;
    }
    const payload = { booking: fullBooking };
    if (ioInstance) {
      ioInstance.to(`booking_${bid}`).emit('booking-created', payload);
      try { ioInstance.to(`user_${String(fullBooking.student)}`).emit('booking-created', payload); } catch(e){}
      try { ioInstance.to(`user_${String(fullBooking.mentor)}`).emit('booking-created', payload); } catch(e){}
    }
    scheduleReminder(booking);
  } catch (err) {
    console.error('notifyBookingCreated error:', err && err.message ? err.message : err);
  }
}

async function notifyBookingUpdated(booking) {
  try {
    const bid = booking._id.toString();
    let fullBooking = booking;
    try {
      fullBooking = await Booking.findById(bid).populate('student', 'firstName lastName email avatar').populate('mentor', 'firstName lastName email avatar title') || booking;
    } catch (e) {
      console.warn('notifyBookingUpdated: failed to populate booking, emitting raw booking', e && e.message ? e.message : e);
      fullBooking = booking;
    }
    const payload = { booking: fullBooking };
    if (ioInstance) {
      ioInstance.to(`booking_${bid}`).emit('booking-updated', payload);
      try { ioInstance.to(`user_${String(fullBooking.student)}`).emit('booking-updated', payload); } catch(e){}
      try { ioInstance.to(`user_${String(fullBooking.mentor)}`).emit('booking-updated', payload); } catch(e){}
    }
    scheduleReminder(booking);
  } catch (err) {
    console.error('notifyBookingUpdated error:', err && err.message ? err.message : err);
  }
}

function scheduleReminder(booking) {
  try {
    if (!booking || !booking.startTime) return;
    const bid = booking._id.toString();
    if (reminderTimers.has(bid)) {
      clearTimeout(reminderTimers.get(bid));
      reminderTimers.delete(bid);
    }
    const start = new Date(booking.startTime).getTime();
    const now = Date.now();
    const remindAt = start - REMINDER_MINUTES * 60 * 1000;
    const delay = remindAt - now;
    if (delay <= 0) return;
    const t = setTimeout(() => {
      try {
        const payload = { booking };
        if (ioInstance) {
          ioInstance.to(`booking_${bid}`).emit('session-reminder', payload);
          ioInstance.to(`user_${booking.student.toString()}`).emit('session-reminder', payload);
          ioInstance.to(`user_${booking.mentor.toString()}`).emit('session-reminder', payload);
        }
      } catch (err) {
        console.error('session reminder emit failed:', err && err.message ? err.message : err);
      }
    }, delay);
    reminderTimers.set(bid, t);
  } catch (err) {
    console.error('scheduleReminder error:', err && err.message ? err.message : err);
  }
}

function cancelReminder(bookingId) {
  try {
    const bid = bookingId.toString();
    if (reminderTimers.has(bid)) {
      clearTimeout(reminderTimers.get(bid));
      reminderTimers.delete(bid);
    }
  } catch (err) {
    console.error('cancelReminder error:', err && err.message ? err.message : err);
  }
}

// Notification handlers
const NotificationService = require('../utils/notificationService');

async function notifyUser(userId, notificationData) {
  try {
    // Create notification in DB
    const notification = await NotificationService.create(userId, notificationData);
    
    if (!notification) return;

    // Emit to user via socket if online
    if (ioInstance && presence.has(String(userId))) {
      const sockets = presence.get(String(userId));
      sockets.forEach(socketId => {
        ioInstance.to(socketId).emit('notification', {
          _id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          icon: notification.icon,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt,
        });
      });
    }

    return notification;
  } catch (error) {
    console.error('Error notifying user:', error);
  }
}

module.exports = {
  initSocket,
  getIo,
  getIO: getIo,
  notifyBookingCreated,
  notifyBookingUpdated,
  scheduleReminder,
  cancelReminder,
  notifyUser,
};
// also export presence helpers
module.exports.isUserOnline = isUserOnline;
module.exports.computeStatusFromDoc = computeStatusFromDoc;
