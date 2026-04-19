const mongoose = require('mongoose')

const NotificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['booking', 'payment', 'message', 'withdrawal', 'rating', 'system'],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId }, // Link to booking, payment, etc
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    icon: { type: String, default: 'Bell' }, // Icon name from lucide-react
    actionUrl: { type: String, default: null }, // URL to navigate to
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, // 30 days
  },
  { timestamps: true }
)

// Index for faster queries
NotificationSchema.index({ user: 1, isRead: 1, createdAt: -1 })
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // Auto-delete after expiry

module.exports = mongoose.model('Notification', NotificationSchema)
