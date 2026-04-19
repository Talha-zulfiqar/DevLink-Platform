const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const Withdrawal = require('../models/Withdrawal');
const Payment = require('../models/Payment');
const User = require('../models/User');

// POST /api/withdrawals - Request a cash withdrawal
router.post(
  '/',
  protect,
  [
    body('amount').isFloat({ min: 10 }).withMessage('Minimum withdrawal is $10'),
    body('bankDetails.accountHolderName').isString().trim().notEmpty().withMessage('Account holder name is required'),
    body('bankDetails.bankName').isString().trim().notEmpty().withMessage('Bank name is required'),
    body('bankDetails.accountNumber').isString().trim().notEmpty().withMessage('Account number is required'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user._id;
      const userRole = req.user.role;
      const { amount, bankDetails } = req.body;

      // Verify user is a mentor or admin
      if (userRole !== 'mentor' && userRole !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only mentors and admins can request withdrawals' });
      }

      // Calculate available balance based on role
      let totalEarnings = 0;
      
      if (userRole === 'mentor') {
        // Mentors earn 85% of booking payments
        const payments = await Payment.find({
          booking: { $exists: true },
          status: 'succeeded',
        }).populate('booking');

        for (const payment of payments) {
          if (payment.booking && payment.booking.mentor && String(payment.booking.mentor) === String(userId)) {
            totalEarnings += (payment.amount * 0.85);
          }
        }
      } else if (userRole === 'admin') {
        // Admins can withdraw from admin revenue (15% of all payments)
        const payments = await Payment.find({
          booking: { $exists: true },
          status: 'succeeded',
        });
        
        // Admin gets 15% of all payments
        totalEarnings = payments.reduce((sum, p) => sum + (p.amount * 0.15), 0);
      }

      // Get previous withdrawals (include pending to prevent over-withdrawals)
      const previousWithdrawals = await Withdrawal.find({
        mentor: userId,
        status: { $in: ['pending', 'completed', 'processing'] },
      });

      const totalWithdrawn = previousWithdrawals.reduce((sum, w) => sum + w.amount, 0);
      const availableBalance = totalEarnings - totalWithdrawn;

      // Check if sufficient balance (in cents)
      const amountInCents = Math.round(amount * 100);
      if (amountInCents > availableBalance) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient balance',
          data: { availableBalance: availableBalance / 100, requestedAmount: amount },
        });
      }

      // Create withdrawal request
      const withdrawal = new Withdrawal({
        mentor: userId,
        amount: amountInCents,
        bankDetails,
      });

      await withdrawal.save();

      res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted',
        data: {
          withdrawal,
          availableBalance: availableBalance / 100,
          requestedAmount: amount,
        },
      });
    } catch (err) {
      console.error('Withdrawal request error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/withdrawals/my - Get user's withdrawal history
router.get('/my', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    // Allow mentors and admins to get their withdrawals
    if (userRole !== 'mentor' && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only mentors and admins can view withdrawals' });
    }

    // Calculate available balance based on role
    let totalEarnings = 0;
    
    if (userRole === 'mentor') {
      // Mentors earn 85% of booking payments
      const payments = await Payment.find({
        booking: { $exists: true },
        status: 'succeeded',
      }).populate('booking');

      for (const payment of payments) {
        if (payment.booking && payment.booking.mentor && String(payment.booking.mentor) === String(userId)) {
          totalEarnings += (payment.amount * 0.85);
        }
      }
    } else if (userRole === 'admin') {
      // Admins earn 15% of all payments
      const payments = await Payment.find({
        booking: { $exists: true },
        status: 'succeeded',
      });
      
      totalEarnings = payments.reduce((sum, p) => sum + (p.amount * 0.15), 0);
    }

    const previousWithdrawals = await Withdrawal.find({
      mentor: userId,
      status: { $in: ['pending', 'completed', 'processing'] },
    });

    const totalWithdrawn = previousWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const availableBalance = totalEarnings - totalWithdrawn;

    // Get all withdrawals for this user
    const withdrawals = await Withdrawal.find({ mentor: userId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        withdrawals,
        earnings: {
          totalEarnings: totalEarnings / 100,
          totalWithdrawn: totalWithdrawn / 100,
          availableBalance: availableBalance / 100,
        },
      },
    });
  } catch (err) {
    console.error('Fetch withdrawals error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/withdrawals/:withdrawalId - Get withdrawal details
router.get('/:withdrawalId', protect, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    }

    if (String(withdrawal.mentor) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    res.json({ success: true, data: { withdrawal } });
  } catch (err) {
    console.error('Fetch withdrawal error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/withdrawals/:withdrawalId - Admin endpoint to update withdrawal status
router.patch(
  '/:withdrawalId',
  protect,
  [
    body('status').isIn(['pending', 'processing', 'completed', 'failed', 'rejected']).withMessage('Invalid status'),
    body('failureReason').optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      // Only admin can update withdrawal status
      if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only admins can update withdrawal status' });
      }

      const { status, failureReason } = req.body;
      const withdrawal = await Withdrawal.findById(req.params.withdrawalId);

      if (!withdrawal) {
        return res.status(404).json({ success: false, message: 'Withdrawal not found' });
      }

      withdrawal.status = status;
      if (failureReason) withdrawal.failureReason = failureReason;
      
      if (status === 'completed') {
        withdrawal.completedAt = new Date();
      } else if (status === 'processing') {
        withdrawal.processedAt = new Date();
      }

      await withdrawal.save();

      res.json({ success: true, message: 'Withdrawal updated', data: { withdrawal } });
    } catch (err) {
      console.error('Update withdrawal error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// GET /api/withdrawals - Admin endpoint to get all withdrawals
router.get('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admins can view all withdrawals' });
    }

    const withdrawals = await Withdrawal.find()
      .populate('mentor', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { withdrawals } });
  } catch (err) {
    console.error('Fetch all withdrawals error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
