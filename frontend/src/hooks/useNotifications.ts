import { useEffect, useState, useCallback, useRef } from 'react'
import { getSocket } from '../utils/socket'
import { useToast } from '../components/UX/ToastProvider'

interface Notification {
  _id: string
  type: 'booking' | 'payment' | 'message' | 'withdrawal' | 'rating' | 'system' | 'announcement'
  title: string
  message: string
  icon?: string
  actionUrl?: string
  createdAt: string
}

export const useNotifications = () => {
  const socket = getSocket()
  const toast = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const notificationSoundsRef = useRef(new Map())

  // Listen for real-time notifications via socket
  useEffect(() => {
    if (!socket) return

    const handleNotification = (notification: Notification) => {
      console.log('🔔 New notification received:', notification.title)

      // Add to notifications list
      setNotifications((prev) => [notification, ...prev])
      setUnreadCount((prev) => prev + 1)

      // Show toast
      toast.show(notification.title, 'info')

      // Play notification sound
      playNotificationSound()
    }

    socket.on('notification', handleNotification)

    return () => {
      socket.off('notification', handleNotification)
    }
  }, [socket, toast])

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
    } catch (error) {
      console.log('Could not play notification sound:', error)
    }
  }, [])

  // Fetch unread notifications
  const fetchUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const response = await fetch('/api/notifications/unread', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setNotifications(data.data.notifications)
        setUnreadCount(data.data.unreadCount)
      }
    } catch (error) {
      console.error('Error fetching unread notifications:', error)
    }
  }, [])

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }, [])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }, [])

  // Delete notification
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      setNotifications((prev) => prev.filter((n) => n._id !== notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }, [])

  return {
    notifications,
    unreadCount,
    fetchUnread,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  }
}
