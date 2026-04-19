import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, CheckCircle } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const { notifications, unreadCount, fetchUnread, markAsRead, markAllAsRead, deleteNotification } = useNotifications()

  // Fetch unread notifications on mount
  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [fetchUnread])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/20 text-white transition-all duration-200 hover:scale-110 group"
        title={`${unreadCount} unread notifications`}
      >
        <Bell size={18} />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden z-50 border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
              {unreadCount > 0 && <span className="ml-2 text-sm text-red-600">({unreadCount} new)</span>}
            </h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                  title="Mark all as read"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <Bell size={32} className="opacity-50 mb-2" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification._id}
                  className={`p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${getTypeBg(
                    notification.type
                  )}`}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white dark:bg-gray-800`}>
                      <Bell size={16} className={getIconColor(notification.type)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                        {new Date(notification.createdAt).toLocaleDateString()} at{' '}
                        {new Date(notification.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      {notification.actionUrl && (
                        <button
                          onClick={() => {
                            markAsRead(notification._id)
                            setIsOpen(false)
                            if (notification.actionUrl) {
                              navigate(notification.actionUrl)
                            }
                          }}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-xs font-medium whitespace-nowrap hover:underline transition-colors"
                          title="View"
                        >
                          View
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification._id)}
                        className="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                        title="Delete notification"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
              <button
                onClick={() => {
                  setIsOpen(false)
                  navigate('/app/notifications')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium hover:underline transition-colors"
              >
                View all notifications →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
