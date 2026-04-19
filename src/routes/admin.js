const express = require('express')
const router = express.Router()
const User = require('../models/User')

const ADMIN_USER = process.env.ADMIN_USER || 'admin@example.com'
const ADMIN_PASS = process.env.ADMIN_PASS || 'adminpass'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admintoken123'
const adminAuth = require('../middleware/adminAuth')

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ success: false, message: 'email/password required' })
    if (email === ADMIN_USER && password === ADMIN_PASS) {
      return res.json({ success: true, token: ADMIN_TOKEN })
    }
    return res.status(401).json({ success: false, message: 'Invalid admin credentials' })
  } catch (e) {
    console.error('/api/admin/login error', e)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Use centralized adminAuth middleware

// GET /api/admin/me
router.get('/me', adminAuth, async (req, res) => {
  return res.json({ success: true, data: { email: ADMIN_USER, role: 'admin' } })
})

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().lean().limit(200)
    return res.json({ success: true, data: users })
  } catch (e) {
    console.error('GET /api/admin/users error', e)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', adminAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body || {}
    if (!id || !role) return res.status(400).json({ success: false, message: 'id and role required' })
    const u = await User.findById(id)
    if (!u) return res.status(404).json({ success: false, message: 'User not found' })
    u.role = role
    await u.save()
    return res.json({ success: true, data: u })
  } catch (e) {
    console.error('PATCH /api/admin/users/:id/role error', e)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const Payment = require('../models/Payment')
    const Booking = require('../models/Booking')
    const MentorApplication = require('../models/MentorApplication')

    // Summary
    const usersCount = await User.countDocuments()
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000)
    const activeUsers = await User.countDocuments({ lastActive: { $gte: fifteenMinsAgo } })
    const activeSessions = await Booking.countDocuments({ status: 'active' })

    // Total revenue (succeeded payments)
    const revAgg = await Payment.aggregate([
      { $match: { status: 'succeeded' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
    const totalRevenueCents = (revAgg[0] && revAgg[0].total) || 0
    const totalRevenue = Number((totalRevenueCents / 100).toFixed(2))

    const totalMentors = await User.countDocuments({ $or: [{ role: 'mentor' }, { isMentor: true }] })
    const pendingApplications = await MentorApplication.countDocuments({ status: 'pending' })

    // Revenue trend - last 30 days (daily)
    const start30 = new Date()
    start30.setDate(start30.getDate() - 29)
    start30.setHours(0,0,0,0)
    const revenueTrend = await Payment.aggregate([
      { $match: { status: 'succeeded', createdAt: { $gte: start30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amount' }, sessions: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
    // normalize to last 30 days (fill missing dates)
    const revenueMap = {}
    revenueTrend.forEach(r => { revenueMap[r._id] = r })
    const revenueTrendFilled = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(start30);
      d.setDate(start30.getDate() + i)
      const key = d.toISOString().slice(0,10)
      const rec = revenueMap[key]
      revenueTrendFilled.push({ date: key, revenue: rec ? Number((rec.revenue/100).toFixed(2)) : 0, sessions: rec ? rec.sessions : 0 })
    }

    // User growth - last 6 months by month
    const now = new Date()
    const months = []
    for (let m = 5; m >= 0; m--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - m, 1)
      months.push({ year: dt.getFullYear(), month: dt.getMonth() + 1, label: dt.toLocaleString('default', { month: 'short' }) })
    }
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const userGrowthAgg = await User.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $project: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, role: 1 } },
      { $group: { _id: { year: '$year', month: '$month', role: '$role' }, count: { $sum: 1 } } }
    ])
    const userMap = {}
    userGrowthAgg.forEach(u => {
      const key = `${u._id.year}-${u._id.month}`
      userMap[key] = userMap[key] || { month: `${u._id.month}`, students: 0, mentors: 0 }
      if (u._id.role === 'mentor') userMap[key].mentors += u.count
      else userMap[key].students += u.count
    })
    const userGrowth = months.map(m => {
      const key = `${m.year}-${m.month}`
      const rec = userMap[key] || { students: 0, mentors: 0 }
      return { month: m.label, students: rec.students, mentors: rec.mentors }
    })

    // Platform metrics
    const bookingAgg = await Booking.aggregate([
      { $group: { _id: null, avgPrice: { $avg: '$price' }, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status','completed'] }, 1, 0] } } } }
    ])
    const avgSessionPrice = bookingAgg[0] ? Number(((bookingAgg[0].avgPrice || 0) / 100).toFixed(2)) : 0
    const completionRate = bookingAgg[0] && bookingAgg[0].total ? Math.round((bookingAgg[0].completed / bookingAgg[0].total) * 100) : 0
    const userRatingAgg = await User.aggregate([{ $group: { _id: null, avgRating: { $avg: '$rating' } } }])
    const satisfactionScore = userRatingAgg[0] ? Number((userRatingAgg[0].avgRating || 0).toFixed(2)) : 0

    // Recent activity - combine latest payments/bookings/users/applications
    // Populate payer and booking->mentor so frontend can show receiver information
    const payments = await Payment.find({}).sort({ createdAt: -1 }).limit(5)
      .populate('payer', 'firstName lastName email')
      .populate({ path: 'booking', populate: { path: 'mentor', select: 'firstName lastName email' } })
      .lean()
    const bookings = await Booking.find({}).sort({ createdAt: -1 }).limit(5).populate('student mentor', 'firstName lastName email').lean()
    const users = await User.find({}).sort({ createdAt: -1 }).limit(5).select('firstName lastName email role createdAt').lean()
    const apps = await MentorApplication.find({}).sort({ submittedAt: -1 }).limit(5).populate('userId', 'firstName lastName email').lean()

    const recent = []
    payments.forEach(p => recent.push({
      type: 'payment',
      timestamp: p.createdAt,
      user: p.payer || null,
      action: 'payment_succeeded',
      metadata: {
        amount: Number((p.amount/100).toFixed(2)),
        currency: p.currency || 'usd',
        paymentIntentId: p.stripePaymentIntentId || p.stripeChargeId || null,
        bookingId: p.booking ? String(p.booking._id) : null,
        mentor: p.booking && p.booking.mentor ? { _id: p.booking.mentor._id, firstName: p.booking.mentor.firstName, lastName: p.booking.mentor.lastName, email: p.booking.mentor.email } : null
      }
    }))
    bookings.forEach(b => recent.push({ type: 'booking', timestamp: b.createdAt, user: b.student || null, action: 'booking_created', metadata: { mentor: b.mentor, startTime: b.startTime } }))
    users.forEach(u => recent.push({ type: 'user', timestamp: u.createdAt, user: u, action: 'user_registered', metadata: {} }))
    apps.forEach(a => recent.push({ type: 'application', timestamp: a.submittedAt || a.createdAt, user: a.userId || null, action: 'mentor_application', metadata: { score: a.applicationScore } }))

    recent.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp))
    const recentActivity = recent.slice(0, 10)

    const out = {
      summary: {
        totalUsers: usersCount,
        activeUsers,
        totalRevenue,
        activeSessions,
        totalMentors,
        pendingApplications
      },
      revenueTrend: revenueTrendFilled,
      userGrowth,
      platformMetrics: {
        commissionRate: 15,
        avgSessionPrice,
        completionRate,
        satisfactionScore
      },
      recentActivity
    }

    return res.json({ success: true, data: out })
  } catch (e) {
    console.error('GET /api/admin/stats error', e)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Debug endpoints (admin-only)
router.get('/debug/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 }).limit(50);
    console.log('🔍 Debug users endpoint called:', { count: users.length });
    res.json({ success: true, data: { total: users.length, users: users.map(u => ({ id: u._id, email: u.email, role: u.role, name: u.name, createdAt: u.createdAt, isMentorVerified: u.isMentorVerified })) } });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
 
// POST /api/admin/announce - send announcement to all users (create notifications)
try {
  const emailService = require('../utils/emailService')
  const { notifyUser } = require('../socket')
  
  router.post('/announce', adminAuth, async (req, res) => {
    try {
      const { subject, message, sendTo } = req.body || {}
      if (!subject || !message) return res.status(400).json({ success: false, message: 'subject and message required' })

      const User = require('../models/User')
      // Get all users
      const users = await User.find({}).select('_id email firstName').lean()
      
      if (!users || users.length === 0) {
        return res.json({ success: true, message: 'No users to notify', recipients: 0 })
      }

      let notificationCount = 0
      let errorCount = 0

      // Create notification for each user using notifyUser (which calls NotificationService.create + emits socket event)
      for (const user of users) {
        try {
          await notifyUser(user._id, {
            type: 'system',
            title: subject,
            message: message,
            icon: '📢',
            actionUrl: '/app/dashboard',
            metadata: { announcedBy: req.user?._id || 'admin', announcedAt: new Date() }
          })

          notificationCount++
          
          // Log email announcement (for future email implementation)
          try {
            console.log('📢 ANNOUNCEMENT to', user.email, '| subject:', subject)
          } catch (e) {}
        } catch (err) {
          errorCount++
          console.error('Error creating notification for user', user._id, err)
        }
      }

      return res.json({ 
        success: true, 
        message: `Announcement sent to ${notificationCount} users${errorCount > 0 ? ` (${errorCount} errors)` : ''}`,
        recipients: notificationCount,
        errors: errorCount
      })
    } catch (err) {
      console.error('/api/admin/announce error', err)
      return res.status(500).json({ success: false, message: 'Server error', error: err.message })
    }
  })
} catch (e) {
  console.error('Failed to register /announce endpoint:', e)
  // ignore if dependencies not available
}

const MentorApplication = require('../models/MentorApplication');
router.get('/debug/applications', adminAuth, async (req, res) => {
  try {
    const applications = await MentorApplication.find({}).populate('userId', 'email name role').sort({ submittedAt: -1 });
    console.log('🔍 Debug applications:', { total: applications.length });
    res.json({ success: true, data: { total: applications.length, applications: applications.map(a => ({ id: a._id, userId: a.userId?._id, userEmail: a.userId?.email, userRole: a.userId?.role, title: a.title, status: a.status, score: a.applicationScore, requestedRate: a.requestedRate, submittedAt: a.submittedAt })) } });
  } catch (error) {
    console.error('Debug applications error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ADMIN RATING MANAGEMENT =====

// GET /api/admin/ratings - Get all ratings with filters
router.get('/ratings', adminAuth, async (req, res) => {
  try {
    const { mentorId, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const filter = mentorId ? { mentor: mentorId } : {};
    const sort = { [sortBy]: order === 'asc' ? 1 : -1 };

    const Rating = require('../models/Rating');
    
    const allRatings = await Rating.find(filter)
      .populate('reviewer', 'firstName lastName email avatar')
      .populate('mentor', 'firstName lastName email role rating')
      .populate('booking', 'startTime endTime')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Rating.countDocuments(filter);

    res.json({
      success: true,
      data: {
        ratings: allRatings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('GET /api/admin/ratings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/ratings/:ratingId - Get single rating details
router.get('/ratings/:ratingId', adminAuth, async (req, res) => {
  try {
    const { ratingId } = req.params;
    const Rating = require('../models/Rating');

    const rating = await Rating.findById(ratingId)
      .populate('reviewer', 'firstName lastName email avatar')
      .populate('mentor', 'firstName lastName email role rating')
      .populate('booking');

    if (!rating) {
      return res.status(404).json({ success: false, message: 'Rating not found' });
    }

    res.json({ success: true, data: { rating } });
  } catch (error) {
    console.error('GET /api/admin/ratings/:ratingId error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/admin/ratings/:ratingId - Update rating (admin only)
router.patch('/ratings/:ratingId', adminAuth, async (req, res) => {
  try {
    const { ratingId } = req.params;
    const { rating, comment, categories, reviewNotes } = req.body;
    const Rating = require('../models/Rating');

    console.log('Update rating request:', { ratingId, rating, comment, categories, reviewNotes });

    // Build update object with only the fields that are provided
    const updateObj = {};

    if (rating !== undefined && rating >= 1 && rating <= 5) {
      updateObj.rating = rating;
    }
    if (comment !== undefined) {
      updateObj.comment = comment;
    }
    if (categories !== undefined) {
      updateObj.categories = categories;
    }
    if (reviewNotes !== undefined) {
      updateObj.adminReviewNotes = reviewNotes;
      updateObj.adminReviewedAt = new Date();
    }

    // Mark as modified by admin
    if (Object.keys(updateObj).length > 0) {
      updateObj.isModifiedByAdmin = true;
    }

    console.log('Update object:', updateObj);

    // Use findByIdAndUpdate without running validators to avoid clearing required fields
    const updatedRating = await Rating.findByIdAndUpdate(
      ratingId,
      updateObj,
      { new: true, runValidators: false }
    ).populate('mentor reviewer booking');

    if (!updatedRating) {
      return res.status(404).json({ success: false, message: 'Rating not found' });
    }

    console.log('Updated rating successfully');

    // Recalculate mentor's average rating
    const mentorId = updatedRating.mentor?._id;
    console.log('Recalculating mentor rating for mentorId:', mentorId);
    
    if (mentorId) {
      const allRatings = await Rating.find({ mentor: mentorId });
      console.log(`Found ${allRatings.length} ratings for this mentor`);
      
      const avgRating = allRatings.length > 0
        ? allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
        : 0;

      const mentor = await User.findById(mentorId);
      if (mentor) {
        mentor.rating = Number(avgRating.toFixed(1));
        await mentor.save();
        console.log('Updated mentor rating to:', mentor.rating);
      }
    }

    return res.json({
      success: true,
      message: 'Rating updated successfully',
      data: { rating: updatedRating }
    });
  } catch (error) {
    console.error('PATCH /api/admin/ratings/:ratingId error:', error.message);
    console.error('Full error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error' 
    });
  }
});

// DELETE /api/admin/ratings/:ratingId - Delete rating (admin only)
router.delete('/ratings/:ratingId', adminAuth, async (req, res) => {
  try {
    const { ratingId } = req.params;
    const Rating = require('../models/Rating');

    const rating = await Rating.findById(ratingId);
    if (!rating) {
      return res.status(404).json({ success: false, message: 'Rating not found' });
    }

    const mentorId = rating.mentor;
    
    await Rating.deleteOne({ _id: ratingId });

    // Recalculate mentor's average rating
    const allRatings = await Rating.find({ mentor: mentorId });
    const avgRating = allRatings.length > 0
      ? allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
      : 0;

    const mentor = await User.findById(mentorId);
    if (mentor) {
      mentor.rating = Number(avgRating.toFixed(1));
      await mentor.save();
    }

    res.json({
      success: true,
      message: 'Rating deleted successfully'
    });
  } catch (error) {
    console.error('DELETE /api/admin/ratings/:ratingId error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/ratings/mentor/:mentorId/summary - Get mentor rating summary
router.get('/ratings/mentor/:mentorId/summary', adminAuth, async (req, res) => {
  try {
    const { mentorId } = req.params;
    const Rating = require('../models/Rating');

    const mentor = await User.findById(mentorId).select('firstName lastName email rating role');
    if (!mentor) {
      return res.status(404).json({ success: false, message: 'Mentor not found' });
    }

    const ratings = await Rating.find({ mentor: mentorId }).lean();
    
    const stats = {
      totalRatings: ratings.length,
      averageRating: ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1) : 0,
      ratingDistribution: {
        '5': ratings.filter(r => r.rating === 5).length,
        '4': ratings.filter(r => r.rating === 4).length,
        '3': ratings.filter(r => r.rating === 3).length,
        '2': ratings.filter(r => r.rating === 2).length,
        '1': ratings.filter(r => r.rating === 1).length,
      },
      categoryAverages: {
        communication: 0,
        expertise: 0,
        punctuality: 0,
        helpfulness: 0,
      }
    };

    // Calculate category averages
    ['communication', 'expertise', 'punctuality', 'helpfulness'].forEach(category => {
      const categoryRatings = ratings.filter(r => r.categories && r.categories[category]);
      if (categoryRatings.length > 0) {
        stats.categoryAverages[category] = (categoryRatings.reduce((sum, r) => sum + (r.categories[category] || 0), 0) / categoryRatings.length).toFixed(1);
      }
    });

    res.json({
      success: true,
      data: {
        mentor,
        stats,
        recentRatings: ratings.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('GET /api/admin/ratings/mentor/:mentorId/summary error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============= WITHDRAWAL MANAGEMENT =============

// GET /api/admin/withdrawals - Get all pending/processing withdrawals
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const Withdrawal = require('../models/Withdrawal');
    const { status } = req.query; // Optional filter by status
    
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    const withdrawals = await Withdrawal.find(filter)
      .populate('mentor', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        withdrawals,
        total: withdrawals.length
      }
    });
  } catch (error) {
    console.error('GET /api/admin/withdrawals error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/admin/withdrawals/:withdrawalId/approve - Approve pending withdrawal
router.patch('/withdrawals/:withdrawalId/approve', adminAuth, async (req, res) => {
  try {
    const Withdrawal = require('../models/Withdrawal');
    const { withdrawalId } = req.params;
    const { notes } = req.body || {};

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot approve withdrawal with status: ${withdrawal.status}` 
      });
    }

    withdrawal.status = 'processing';
    withdrawal.processedAt = new Date();
    if (notes) {
      withdrawal.notes = notes;
    }

    await withdrawal.save();

    res.json({
      success: true,
      message: 'Withdrawal approved',
      data: { withdrawal }
    });
  } catch (error) {
    console.error('PATCH /api/admin/withdrawals/:withdrawalId/approve error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/admin/withdrawals/:withdrawalId/reject - Reject pending withdrawal
router.patch('/withdrawals/:withdrawalId/reject', adminAuth, async (req, res) => {
  try {
    const Withdrawal = require('../models/Withdrawal');
    const { withdrawalId } = req.params;
    const { failureReason } = req.body || {};

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot reject withdrawal with status: ${withdrawal.status}` 
      });
    }

    withdrawal.status = 'rejected';
    withdrawal.failureReason = failureReason || 'Rejected by admin';

    await withdrawal.save();

    res.json({
      success: true,
      message: 'Withdrawal rejected',
      data: { withdrawal }
    });
  } catch (error) {
    console.error('PATCH /api/admin/withdrawals/:withdrawalId/reject error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/admin/withdrawals/:withdrawalId/complete - Mark withdrawal as completed
router.patch('/withdrawals/:withdrawalId/complete', adminAuth, async (req, res) => {
  try {
    const Withdrawal = require('../models/Withdrawal');
    const { withdrawalId } = req.params;
    const { transactionId } = req.body || {};

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (withdrawal.status !== 'processing') {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot complete withdrawal with status: ${withdrawal.status}` 
      });
    }

    withdrawal.status = 'completed';
    withdrawal.completedAt = new Date();
    if (transactionId) {
      withdrawal.transactionId = transactionId;
    }

    await withdrawal.save();

    res.json({
      success: true,
      message: 'Withdrawal completed',
      data: { withdrawal }
    });
  } catch (error) {
    console.error('PATCH /api/admin/withdrawals/:withdrawalId/complete error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router
