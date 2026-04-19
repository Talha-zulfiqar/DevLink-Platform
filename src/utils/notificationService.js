const Notification = require('../models/Notification')

class NotificationService {
  // Create and send notification
  static async create(userId, { type, title, message, relatedId, icon, actionUrl, metadata }) {
    try {
      const notification = new Notification({
        user: userId,
        type,
        title,
        message,
        relatedId,
        icon,
        actionUrl,
        metadata,
      })

      await notification.save()
      return notification
    } catch (error) {
      console.error('Error creating notification:', error)
      return null
    }
  }

  // Get unread notifications for user
  static async getUnread(userId, limit = 10) {
    try {
      return await Notification.find({ user: userId, isRead: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
    } catch (error) {
      console.error('Error fetching unread notifications:', error)
      return []
    }
  }

  // Get all notifications for user
  static async getAll(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit
      const notifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()

      const total = await Notification.countDocuments({ user: userId })

      return {
        notifications,
        total,
        pages: Math.ceil(total / limit),
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      return { notifications: [], total: 0, pages: 0 }
    }
  }

  // Mark as read
  static async markAsRead(notificationId) {
    try {
      return await Notification.findByIdAndUpdate(
        notificationId,
        { isRead: true, readAt: new Date() },
        { new: true }
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
      return null
    }
  }

  // Mark all as read for user
  static async markAllAsRead(userId) {
    try {
      return await Notification.updateMany(
        { user: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      )
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
      return null
    }
  }

  // Delete notification
  static async delete(notificationId) {
    try {
      return await Notification.findByIdAndDelete(notificationId)
    } catch (error) {
      console.error('Error deleting notification:', error)
      return null
    }
  }

  // Clear old notifications (older than 30 days)
  static async clearOld() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      return await Notification.deleteMany({ createdAt: { $lt: thirtyDaysAgo } })
    } catch (error) {
      console.error('Error clearing old notifications:', error)
      return null
    }
  }
}

module.exports = NotificationService
