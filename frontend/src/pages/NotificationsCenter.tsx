import React, { useEffect, useState } from 'react'
import { Bell, X, CheckCircle, Trash2, Archive } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'
import { useNavigate } from 'react-router-dom'

interface Notification {
  _id: string
  type: 'booking' | 'payment' | 'message' | 'withdrawal' | 'rating' | 'system' | 'announcement'
  title: string
  message: string
  icon?: string
  actionUrl?: string
  createdAt: string
  isRead?: boolean
}

export default function NotificationsCenter() {
  const navigate = useNavigate()
  const { notifications, fetchUnread, markAsRead, markAllAsRead, deleteNotification } = useNotifications()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchUnread().finally(() => setLoading(false))
  }, [fetchUnread])

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter((n: any) => !n.isRead)
    : notifications

  const getIconColor = (type: string) => {
    const colors: { [key: string]: string } = {
      booking: 'text-blue-500',
      payment: 'text-green-500',
      message: 'text-purple-500',
      withdrawal: 'text-amber-500',
      rating: 'text-yellow-500',
      system: 'text-red-500',
      announcement: 'text-red-500',
    }
    return colors[type] || 'text-gray-500'
  }

  const getTypeBg = (type: string) => {
    const colors: { [key: string]: string } = {
      booking: 'bg-blue-50 dark:bg-blue-900/20',
      payment: 'bg-green-50 dark:bg-green-900/20',
      message: 'bg-purple-50 dark:bg-purple-900/20',
      withdrawal: 'bg-amber-50 dark:bg-amber-900/20',
      rating: 'bg-yellow-50 dark:bg-yellow-900/20',
      system: 'bg-red-50 dark:bg-red-900/20',
      announcement: 'bg-red-50 dark:bg-red-900/20',
    }
    return colors[type] || 'bg-gray-50 dark:bg-gray-900/20'
  }

  const getTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      booking: '📅 Booking',
      payment: '💳 Payment',
      message: '💬 Message',
      withdrawal: '💰 Withdrawal',
      rating: '⭐ Rating',
      system: '📢 System',
      announcement: '📢 Announcement',
    }
    return labels[type] || type
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <Bell size={32} />
                Notifications Center
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {filteredNotifications.length} {filter === 'unread' ? 'unread' : 'total'} notification{filteredNotifications.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => navigate('/app/dashboard')}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
            >
              Unread
            </button>
          </div>

          {notifications.length > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-2"
            >
              <CheckCircle size={16} />
              Mark all as read
            </button>
          )}
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 bg-white dark:bg-gray-800 rounded-lg animate-pulse border border-gray-200 dark:border-gray-700"
              />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center border border-gray-200 dark:border-gray-700">
            <Bell size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {filter === 'unread'
                ? 'You are all caught up!'
                : 'When you get notifications, they will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <div
                key={notification._id}
                className={`p-4 rounded-lg border transition-colors ${getTypeBg(notification.type)} border-gray-200 dark:border-gray-700 hover:shadow-md`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white dark:bg-gray-800 ${getIconColor(notification.type)}`}>
                      <Bell size={20} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {notification.title}
                          </h3>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            notification.type === 'booking' ? 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                            notification.type === 'payment' ? 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200' :
                            notification.type === 'message' ? 'bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                            notification.type === 'system' || notification.type === 'announcement' ? 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' :
                            'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                          }`}>
                            {getTypeLabel(notification.type)}
                          </span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 mb-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(notification.createdAt).toLocaleDateString()} at{' '}
                          {new Date(notification.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex gap-2">
                    {notification.actionUrl && (
                      <button
                        onClick={() => {
                          markAsRead(notification._id)
                          if (notification.actionUrl) {
                            navigate(notification.actionUrl)
                          }
                        }}
                        className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="View"
                      >
                        View
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification._id)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Delete"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
