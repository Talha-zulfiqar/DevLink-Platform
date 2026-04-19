import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { initSocket, getSocket } from '../utils/socket'
import SessionBooking from '../components/SessionBooking'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import EmptyState from '../components/UX/EmptyState'
import Breadcrumbs from '../components/UX/Breadcrumbs'
import BackToTop from '../components/UX/BackToTop'
import { CalendarIcon, MessageSquare, Users, TrendingUp, Star } from 'lucide-react'
import { useToast } from '../components/UX/ToastProvider'
import ConfirmDialog from '../components/UX/ConfirmDialog'
import VideoCallButton from '../components/Video/VideoCallButton'
import SubmitRating from '../components/Ratings/SubmitRating'
// Charts removed in revert: visual-only changes undone

type Session = {
  id: string
  mentor: { name: string; avatar?: string }
  otherName?: string
  date: string
  time: string
  duration: number
  meetingType?: string
  status: 'upcoming' | 'completed' | 'cancelled' | string
  description?: string
  startMs?: number
  paymentPending?: boolean
}

function addDaysStr(d: Date, days: number) {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy.toISOString().slice(0, 10)
}

export default function Sessions() {
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const navigate = useNavigate()
  const toast = useToast()
  const { user: currentUser } = useAuth() || {}

  // Rating modal state
  const [ratingModalOpen, setRatingModalOpen] = useState(false)
  const [selectedBookingForRating, setSelectedBookingForRating] = useState<Session | null>(null)
  const [ratedBookings, setRatedBookings] = useState<Set<string>>(new Set())

  // manage sessions in state so we can update status on cancel
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [pastSessions, setPastSessions] = useState<Session[]>([])
  const [cancelledSessions, setCancelledSessions] = useState<Session[]>([])
  const [pendingSessions, setPendingSessions] = useState<Session[]>([])
  const [stats, setStats] = useState<{ upcoming: number; completed: number; cancelled: number }>({ upcoming: 0, completed: 0, cancelled: 0 })
  const [loading, setLoading] = useState(true)

  // --- Analytics derived from bookings (purely visual, non-destructive) ---
  const allBookings = useMemo(() => {
    return [...upcomingSessions, ...pastSessions, ...cancelledSessions, ...pendingSessions]
  }, [upcomingSessions, pastSessions, cancelledSessions, pendingSessions])

  // (Charts removed) keep lightweight derived stats for display
  const sessionsTrend = useMemo(() => [], [])
  const statusDistribution = useMemo(() => [], [pastSessions, pendingSessions, upcomingSessions, cancelledSessions])
  const mentorVsStudent = useMemo(() => [], [allBookings, currentUser])
  const peakHours = useMemo(() => [], [allBookings])
  const miniSpark = useMemo(() => [], [pastSessions])

  // Fetch real bookings from API and categorize them. Exposed as a stable function so socket events can trigger refresh
  const fetchSessions = useCallback(async () => {
    try {
      console.log('🔍 FETCHING SESSIONS DATA...')
      const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
      const token = localStorage.getItem('devlink_token') || undefined
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${API_BASE}/bookings/my`, { headers })
      if (!response.ok) {
        console.warn('Failed to load bookings, status', response.status)
        setUpcomingSessions([])
        setPastSessions([])
        setCancelledSessions([])
        setStats({ upcoming: 0, completed: 0, cancelled: 0 })
        setLoading(false)
        return
      }
      const data = await response.json()
      console.log('📊 RAW BOOKINGS DATA:', data)

      const bookings = (data && data.bookings && Array.isArray(data.bookings)) ? data.bookings : ((data && data.data && Array.isArray(data.data.results)) ? data.data.results : [])

      if (!Array.isArray(bookings) || bookings.length === 0) {
        setUpcomingSessions([])
        setPastSessions([])
        setCancelledSessions([])
        setStats({ upcoming: 0, completed: 0, cancelled: 0 })
        setLoading(false)
        return
      }

      const now = Date.now()

  const mappedBookings = bookings.map((booking: any) => {
        const start = booking.startTime ? new Date(booking.startTime) : (booking.date ? new Date(booking.date) : null)
        const startMs = start ? start.getTime() : null
        const end = booking.endTime ? new Date(booking.endTime) : (booking.startTime && booking.duration ? new Date(new Date(booking.startTime).getTime() + (Number(booking.duration) * 60000)) : null)
        const endMs = end ? end.getTime() : (booking.endTime ? new Date(booking.endTime).getTime() : null)
        const date = start ? start.toISOString().slice(0, 10) : (booking.date || '')
        const time = start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (booking.time || '')
        const duration = booking.duration || (booking.endTime && booking.startTime ? Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60000) : 0)
  // Display-only: default visible label uses 'Senior Developer' instead of 'Mentor'
  const mentorObj = booking.mentor ? { name: `${booking.mentor.firstName || ''} ${booking.mentor.lastName || ''}`.trim(), avatar: booking.mentor.avatar } : { name: 'Senior Developer', avatar: undefined }
        const studentName = booking.student ? `${booking.student.firstName || ''} ${booking.student.lastName || ''}`.trim() : '';
        const otherName = studentName || '';

        let normalizedStatus: 'upcoming' | 'completed' | 'cancelled' = 'upcoming'
        if (booking.status === 'cancelled') normalizedStatus = 'cancelled'
        else if (booking.status === 'completed') normalizedStatus = 'completed'
        else if (startMs !== null && startMs < now) normalizedStatus = 'completed'
        else normalizedStatus = 'upcoming'

        return {
          raw: booking,
          id: String(booking._id || booking.id),
          mentor: mentorObj,
          paymentPending: booking.status === 'pending' || false,
          mentorId: booking.mentor?._id || booking.mentor?.id || null,
          studentId: booking.student?._id || booking.student?.id || null,
          otherName: otherName,
          date,
          time,
          duration,
          meetingType: booking.meetingType,
          status: normalizedStatus,
          description: booking.description || '',
          startMs,
          endMs,
        }
      })

      // Separate pending payments from genuine upcoming sessions
      const pending = mappedBookings.filter((b: any) => b.paymentPending)
      const upcoming = mappedBookings.filter((b: any) => b.status === 'upcoming' && !b.paymentPending)
      const past = mappedBookings.filter((b: any) => b.status === 'completed')
      const cancelled = mappedBookings.filter((b: any) => b.status === 'cancelled')

      console.log('🎯 FILTERED SESSIONS:', { upcoming: upcoming.length, past: past.length, cancelled: cancelled.length })

  setUpcomingSessions(upcoming.map((b: any) => ({ id: b.id, mentor: b.mentor, mentorId: b.mentorId ?? null, studentId: b.studentId ?? null, otherName: b.otherName || '', date: b.date, time: b.time, duration: b.duration, meetingType: b.meetingType, status: b.status, paymentPending: b.paymentPending || false, description: b.description, startMs: b.startMs, endMs: b.endMs })))
  setPastSessions(past.map((b: any) => ({ id: b.id, mentor: b.mentor, mentorId: b.mentorId ?? null, studentId: b.studentId ?? null, otherName: b.otherName || '', date: b.date, time: b.time, duration: b.duration, meetingType: b.meetingType, status: b.status, paymentPending: b.paymentPending || false, description: b.description, startMs: b.startMs, endMs: b.endMs })))
  setCancelledSessions(cancelled.map((b: any) => ({ id: b.id, mentor: b.mentor, mentorId: b.mentorId ?? null, studentId: b.studentId ?? null, otherName: b.otherName || '', date: b.date, time: b.time, duration: b.duration, meetingType: b.meetingType, status: b.status, paymentPending: b.paymentPending || false, description: b.description, startMs: b.startMs, endMs: b.endMs })))
  setPendingSessions(pending.map((b: any) => ({ id: b.id, mentor: b.mentor, mentorId: b.mentorId ?? null, studentId: b.studentId ?? null, otherName: b.otherName || '', date: b.date, time: b.time, duration: b.duration, meetingType: b.meetingType, status: b.status, paymentPending: true, description: b.description, startMs: b.startMs, endMs: b.endMs })))
    setStats({ upcoming: upcoming.length, completed: past.length, cancelled: cancelled.length })
      setLoading(false)

      // Fetch ratings after bookings are loaded to check which ones are already rated
      await fetchUserRatings(API_BASE, token)
    } catch (error) {
      console.error('❌ FETCH SESSIONS ERROR:', error)
      setUpcomingSessions([])
      setPastSessions([])
      setCancelledSessions([])
      setStats({ upcoming: 0, completed: 0, cancelled: 0 })
      setLoading(false)
    }
  }, [])

  // Fetch user's own ratings to see which bookings they've already rated
  const fetchUserRatings = useCallback(async (API_BASE: string, token?: string) => {
    try {
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`${API_BASE}/ratings/my`, { headers })
      if (!response.ok) {
        console.warn('Failed to fetch user ratings, status', response.status)
        return
      }
      const data = await response.json()
      const ratings = (data && data.ratings && Array.isArray(data.ratings)) ? data.ratings : []
      
      // Create a set of booking IDs that user has already rated
      const ratedIds = new Set(ratings.map((r: any) => String(r.booking)))
      setRatedBookings(ratedIds)
      console.log('✅ User ratings loaded:', ratedIds)
    } catch (error) {
      console.error('Failed to fetch user ratings:', error)
    }
  }, [])

  // mount: fetch sessions and wire socket listeners for real-time booking updates
  useEffect(() => {
    let mounted = true
    fetchSessions()

    try {
      const token = localStorage.getItem('devlink_token') || undefined
      const s = initSocket(token)
      try { /* socket initialization */ } catch (e) {}
      const onCreated = (payload: any) => {
        console.log('socket booking-created received', payload)
        // refresh sessions list when new booking created
        fetchSessions()
      }
      const onUpdated = (payload: any) => {
        console.log('socket booking-updated received', payload)
        fetchSessions()
      }
      s && s.on && s.on('booking-created', onCreated)
      try { /* listeners ready */ } catch (e) {}
      s && s.on && s.on('booking-updated', onUpdated)
      try { /* listeners ready */ } catch (e) {}

      return () => {
        try {
          const so = getSocket()
          so && so.off && so.off('booking-created', onCreated)
          so && so.off && so.off('booking-updated', onUpdated)
        } catch (e) {}
        mounted = false
      }
    } catch (e) {
      console.warn('Failed to init socket for sessions page', e)
    }
  }, [fetchSessions])

  // Listen for booking:paid events dispatched after a successful payment so we can refresh sessions immediately
  useEffect(() => {
    const handler = (e: any) => {
      try {
        console.log('[EVENT] booking:paid received', e && e.detail)
        setLoading(true)
        fetchSessions().then(() => {
          setLoading(false)
          try { toast.show('Payment confirmed — sessions updated', 'success') } catch (err) {}
        }).catch((err) => {
          console.warn('fetchSessions failed after booking:paid', err)
          setLoading(false)
        })
      } catch (err) { console.warn('booking:paid handler failed', err) }
    }
    window.addEventListener('booking:paid', handler as EventListener)
    return () => { window.removeEventListener('booking:paid', handler as EventListener) }
  }, [fetchSessions, toast])

  // Listen for meeting_started events so students see Join immediately when mentor starts
  useEffect(() => {
    try {
      const socket = getSocket()
      if (!socket) return

      const handleMeetingStarted = (data: any) => {
        try {
          console.log('🎯 Meeting started notification:', data)
          const bid = data && data.bookingId ? String(data.bookingId) : null
          const startedAt = data && data.startedAt ? String(data.startedAt) : null

          if (!bid) return

          // Update upcoming sessions to reflect active status / adjust start time so showJoin becomes true
          setUpcomingSessions(prev => prev.map(session => {
            if (String(session.id) !== bid) return session
            const updated: any = { ...session, status: 'active' }
            try {
              if (startedAt) {
                const ms = new Date(startedAt).getTime()
                if (!isNaN(ms)) updated.startMs = ms
              }
            } catch (e) {}
            return updated
          }))

          // Ensure past list also updated if necessary
          setPastSessions(prev => prev.map(session => (String(session.id) === bid ? { ...session, status: 'active' } : session)))

        // Show a toast to notify the user (if toast provider present)
      try { toast.show(`${data.mentorName || 'Senior Developer'} started the meeting. You can join now.`, 'success') } catch (e) { console.log('toast not available', e) }
        } catch (e) { console.warn('handleMeetingStarted failed', e) }
      }

      try { /* meeting listener registered */ } catch (e) {}
      socket.on('meeting_started', (data: any) => {
        try { /* event received */ } catch (e) {}
        try { /* handler ready */ } catch (e) {}
        handleMeetingStarted(data)
      })
      return () => { try { socket.off && socket.off('meeting_started', handleMeetingStarted); } catch (e) {} }
    } catch (e) { console.warn('meeting_started listener failed to attach', e) }
  }, [setUpcomingSessions, setPastSessions, toast])

  // Listen for meeting_ended events to move a session from upcoming -> past
  useEffect(() => {
    try {
      const socket = getSocket()
      if (!socket) return

      const handleMeetingEnded = (data: any) => {
        try {
          /* event: meeting ended */
          const bid = data && data.bookingId ? String(data.bookingId) : null
          if (!bid) return

          setUpcomingSessions(prev => {
            const found = prev.find(s => String(s.id) === bid)
            if (!found) return prev

            // move to past
            setPastSessions(p => [{ ...found, status: 'completed', endMs: data && data.endedAt ? new Date(data.endedAt).getTime() : Date.now() }, ...p])
            return prev.filter(s => String(s.id) !== bid)
          })

          setStats(s => ({ ...s, upcoming: Math.max(0, s.upcoming - 1), completed: s.completed + 1 }))
          try { toast.show('Meeting has ended', 'info') } catch (e) { console.log('Toast not available', e) }
        } catch (e) {
          console.warn('handleMeetingEnded failed', e)
        }
      }

      socket.on('meeting_ended', handleMeetingEnded)
      return () => { try { socket.off && socket.off('meeting_ended', handleMeetingEnded) } catch (e) {} }
    } catch (e) { console.warn('meeting_ended listener attach failed', e) }
  }, [setUpcomingSessions, setPastSessions, setStats, toast])

  

  // Hook to join booking rooms for real-time updates (students)
  useEffect(() => {
    try {
      const socket = getSocket()
      if (!socket || !upcomingSessions.length) {
        /* no rooms to join */
        return
      }

      /* joining booking rooms */

      // Join rooms for all upcoming sessions
      upcomingSessions.forEach((session) => {
        const bookingId = session.id
        const userId = (currentUser as any)?._id

        if (bookingId && userId) {
          try {
            /* room join emitted */
            socket.emit('join-room', { bookingId, userId })
          } catch (e) {
            console.warn('[ERROR] Failed to emit join-room for', bookingId, e)
          }
        }
      })

      return () => {
        try {
          const so = getSocket()
          if (so) {
            /* cleanup: rooms left */
            upcomingSessions.forEach((session) => {
              const bookingId = session.id
              const userId = (currentUser as any)?._id
              if (bookingId && userId) {
                try { so.emit('leave-room', { bookingId, userId }) } catch (e) {}
              }
            })
          }
        } catch (e) {
          console.warn('[ERROR] Room cleanup failed', e)
        }
      }
    } catch (error) {
      console.warn('[ERROR] Failed to join booking rooms:', error)
    }
  }, [upcomingSessions, currentUser?._id])

  const upcoming = upcomingSessions
  const past = pastSessions
  const cancelled = cancelledSessions

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toCancel, setToCancel] = useState<Session | null>(null)

  function handleBook() {
    setBookingOpen(true)
  }

  function handleConfirm(payload: any) {
    setBookingOpen(false)
    navigate('/app/sessions/confirmation', { state: { booking: payload } })
    toast.show('Meeting booked', 'success')
  }

  function promptCancel(s: Session) {
    setToCancel(s)
    setConfirmOpen(true)
  }

  function doCancel() {
    if (!toCancel) return
    const id = toCancel.id
    // optimistic UI update: move from upcoming -> cancelled locally, then persist
    const found = upcomingSessions.find((x) => x.id === id)
    const prevUpcoming = upcomingSessions
    const prevCancelled = cancelledSessions

    if (found) {
      setUpcomingSessions((prev) => prev.filter((x) => x.id !== id))
      setCancelledSessions((prev) => [{ ...found, status: 'cancelled' }, ...prev])
    } else {
      // if not in upcoming, ensure it's present in cancelled list
      setCancelledSessions((prev) => (prev.find((x) => x.id === id) ? prev : [{ ...(toCancel as Session), status: 'cancelled' }, ...prev]))
    }

    setConfirmOpen(false)

    const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
    const token = localStorage.getItem('devlink_token') || undefined
    const headers: Record<string,string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    // allow undo by moving from cancelled back to upcoming (also attempt server-side revert)
    const undo = async () => {
      try {
        // optimistic revert UI
        setCancelledSessions((prev) => prev.filter((x) => x.id !== id))
        // put back into upcoming at top
        const cancelledItem = (prevCancelled.find((x) => x.id === id) || found || toCancel) as Session | undefined
        if (cancelledItem) setUpcomingSessions((prev) => [{ ...cancelledItem, status: 'upcoming' }, ...prev])

        // try server revert to 'pending'
        await fetch(`${API_BASE}/bookings/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'pending' }) }).then(r => { if (!r.ok) throw new Error('Failed to revert status') })
        toast.show('Undo successful', 'success')
      } catch (e) {
        console.warn('Undo cancel failed', e)
        toast.show('Failed to undo cancellation', 'error')
      }
    }

    // show toast with undo action
    toast.show('Session cancelled', 'success', { action: { label: 'Undo', onClick: () => { void undo() } }, duration: 6000 })
    setToCancel(null)

    // persist cancellation on server
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/bookings/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'cancelled' }) })
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`)
        }
        // refresh sessions to ensure server state reflected
        await fetchSessions()
      } catch (e) {
        console.error('Failed to cancel booking on server', e)
        // revert optimistic UI
        setUpcomingSessions(prevUpcoming)
        setCancelledSessions(prevCancelled)
        toast.show('Failed to cancel session on server', 'error')
      }
    })()
  }

  // Allow mentors to manually mark a meeting as completed (safe, optimistic update)
  const markAsCompleted = async (bookingId: string) => {
    try {
      console.log(`Marking meeting ${bookingId} as completed`)

      // 1. Find the session
      const sessionToComplete = upcomingSessions.find(s => s.id === bookingId)
      if (!sessionToComplete) return

      // 2. Update locally immediately (optimistic update)
      setUpcomingSessions(prev => prev.filter(s => s.id !== bookingId))
      setPastSessions(prev => [{ ...sessionToComplete, status: 'completed', active: false }, ...prev])

      // 3. Update backend
      const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
      const token = localStorage.getItem('devlink_token') || undefined
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      await fetch(`${API_BASE}/bookings/${encodeURIComponent(bookingId)}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'completed',
          endedAt: new Date().toISOString()
        })
      })

      // 4. Update stats
      setStats(prev => ({
        upcoming: Math.max(0, prev.upcoming - 1),
        completed: prev.completed + 1,
        cancelled: prev.cancelled
      }))

      // 5. Show success message
      try { toast.show('Meeting marked as completed', 'success') } catch (e) { console.log('Toast not available', e) }
    } catch (error) {
      console.error('Failed to mark meeting as completed:', error)
      try { toast.show('Failed to update meeting status', 'error') } catch (e) { console.log('Toast not available', e) }
      // Revert optimistic update by refreshing
      try { await fetchSessions() } catch (e) { console.warn('fetchSessions failed during revert', e) }
    }
  }

  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Sessions</h1>
            <p className="text-sm mt-1 text-gray-600 dark:text-gray-300 max-w-2xl">Manage your upcoming and past sessions here. Use the action buttons to join, pay, or cancel.</p>
          </div>
          <div className="hidden sm:flex items-center gap-3 w-full sm:w-auto">
            {/* Intentionally left empty — page actions are available next to each session */}
          </div>
        </header>

        {/* KPI cards removed — Sessions page is a focused operational page, not a dashboard */}
        {/* Analytics removed in revert: simplified layout retained */}

        {/* Charts removed to revert visual changes */}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Breadcrumbs items={[{ to: '/sessions', label: 'Meetings' }]} />
          <div className="lg:col-span-2 space-y-6">
      {/* Pending payments section (separate from Upcoming) */}
      {pendingSessions.length > 0 && (
        <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border border-gray-200/10 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pending payments</h2>
          <div className="space-y-3">
            {pendingSessions.map((s) => (
              <div key={s.id} className="p-3 rounded-lg flex items-center justify-between bg-gray-50 dark:bg-gray-700">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{s.mentor?.name}{s.otherName ? ` • ${s.otherName}` : ''}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">{s.date} • {s.time} • {s.duration} min</div>
                  <div className="text-xs text-gray-500 mt-1">Start: {s.startMs ? new Date(s.startMs).toLocaleString() : '—'}</div>
                  <div className="inline-block mt-2 px-2 py-1 rounded text-xs font-medium text-yellow-800 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200">Pending payment</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => navigate(`/app/checkout?bookingId=${encodeURIComponent(String(s.id))}`)} className="px-4 py-2 rounded-md bg-yellow-600 text-white hover:bg-yellow-700">Pay now</button>
                  <button onClick={() => promptCancel(s)} className="px-3 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">Cancel</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border border-gray-200/10 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upcoming meetings</h2>
                {loading ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">Loading sessions…</div>
                ) : (upcoming.length + past.length + cancelled.length + pendingSessions.length) === 0 ? (
                  <EmptyState title="No upcoming sessions" subtitle="You have no scheduled meetings. Book your first session to get started." Icon={CalendarIcon} actions={[{ label: 'Book your first session', onClick: handleBook, variant: 'primary' }]} />
                ) : upcoming.length === 0 ? (
                  <div className="text-sm text-gray-600 dark:text-gray-300">No upcoming meetings. Book your first meeting.</div>
                ) : (
                  <div className="space-y-3">
                    {upcoming.map((s) => {
                      const now = Date.now()
                      const safetyMarginMs = 60 * 1000 // 60s safety margin to match activate-booking behavior
                      const startMs = (s as any).startMs || null
                      const endMs = (s as any).endMs || (startMs ? (startMs + (Number(s.duration || 0) * 60000)) : null)

                      // Determine activity either via socket (status === 'active') or time window
                      const isActiveBySocket = (s as any).status === 'active'
                      const isActiveByTime = startMs && endMs ? ((now + safetyMarginMs) >= startMs && (now - safetyMarginMs) <= endMs) : false
                      const showJoin = Boolean(isActiveBySocket || isActiveByTime)

                      // Role check: mentor users or the assigned mentor can start the meeting early
                      const isMentor = (currentUser && ((currentUser as any).role === 'mentor')) || (String((s as any).mentorId || '') === String((currentUser && (currentUser as any)._id) || ''))

                      // Debug logs: timing and visibility
                      console.log(`Session ${s.id} timings: start=${startMs} end=${endMs} now=${now} socketActive=${isActiveBySocket} timeActive=${isActiveByTime} showJoin=${showJoin}`)

                      return (
                        <div key={s.id} className="p-3 rounded-lg flex items-center justify-between bg-gray-50 dark:bg-gray-700">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{s.mentor?.name}{s.otherName ? ` • ${s.otherName}` : ''}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-300">{s.date} • {s.time} • {s.duration} min</div>
                            <div className="text-xs text-gray-500 mt-1">Start: {startMs ? new Date(startMs).toLocaleString() : '—'} | End: {endMs ? new Date(endMs).toLocaleString() : '—'}</div>
                            {s.paymentPending && (
                              <div className="inline-block mt-2 px-2 py-1 rounded text-xs font-medium text-yellow-800 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200">Pending payment</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {(() => {
                              // Role check handled above in outer scope
                              if (isMentor) {
                                return (
                                  <button onClick={() => navigate(`/app/video/${String(s.id)}`)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg">Start Meeting</button>
                                )
                              }

                              return showJoin ? <VideoCallButton bookingId={s.id} /> : <div className="text-xs text-gray-400">Not active</div>
                            })()}
                            <button onClick={() => promptCancel(s)} className="px-3 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">Cancel</button>

                            {/* Mark Completed button for mentors */}
                            {isMentor && (
                              <button
                                onClick={() => markAsCompleted(s.id)}
                                className="px-3 py-1 rounded-md bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm hover:bg-green-200 dark:hover:bg-green-800"
                                title="Mark this meeting as completed"
                              >
                                Mark Completed
                              </button>
                            )}

                            <div className="text-sm text-indigo-600 dark:text-indigo-300">{s.status}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border border-gray-200/10 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Past meetings</h2>
              {past.length === 0 ? (
                <EmptyState title="No past meetings" subtitle="Once you complete meetings they'll appear here." Icon={CalendarIcon} />
              ) : (
                <div className="space-y-3">
                  {past.map((s) => {
                    const hasRated = ratedBookings.has(s.id)
                    return (
                      <div key={s.id} className="p-3 rounded-lg flex items-center justify-between bg-gray-50 dark:bg-gray-700">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{s.mentor?.name}{s.otherName ? ` • ${s.otherName}` : ''}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">{s.date} • {s.time} • {s.duration} min</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {hasRated ? (
                            <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm">
                              <Star size={16} className="fill-current" />
                              <span>Rated</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedBookingForRating(s)
                                setRatingModalOpen(true)
                              }}
                              className="flex items-center gap-2 px-3 py-1 rounded-md bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-sm hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
                              title="Rate this mentor"
                            >
                              <Star size={16} />
                              <span>Rate mentor</span>
                            </button>
                          )}
                          <div className="text-sm text-gray-500 dark:text-gray-300">Completed</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border border-gray-200/10 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cancelled meetings</h2>
              {cancelled.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-gray-300">No cancelled meetings.</div>
              ) : (
                <div className="space-y-3">
                  {cancelled.map((s) => (
                    <div key={s.id} className="p-3 rounded-lg flex items-center justify-between bg-gray-50 dark:bg-gray-700">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{s.mentor?.name}{s.otherName ? ` • ${s.otherName}` : ''}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">{s.date} • {s.time} • {s.duration} min</div>
                      </div>
                      <div className="text-sm text-red-500 dark:text-red-400">Cancelled</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

  <SessionBooking open={bookingOpen} onClose={() => setBookingOpen(false)} onConfirm={handleConfirm} mentor={null} />
  <ConfirmDialog open={confirmOpen} title="Cancel meeting" message={`Cancel meeting with ${toCancel?.mentor?.name ?? ''}? This cannot be undone.`} onCancel={() => setConfirmOpen(false)} onConfirm={doCancel} />
  
  {/* Rating Modal */}
  {ratingModalOpen && selectedBookingForRating && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Rate {selectedBookingForRating.mentor?.name}</h2>
          <button
            onClick={() => {
              setRatingModalOpen(false)
              setSelectedBookingForRating(null)
            }}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
        <div className="p-6">
          <SubmitRating
            mentorId={selectedBookingForRating.mentorId || ''}
            bookingId={selectedBookingForRating.id}
            API_BASE={(import.meta.env.VITE_API_BASE as string) || '/api'}
            onSuccess={() => {
              setRatingModalOpen(false)
              setSelectedBookingForRating(null)
              // Mark as rated in local state
              setRatedBookings(prev => new Set([...prev, selectedBookingForRating.id]))
              try {
                toast.show('Thank you for rating!', 'success')
              } catch (e) {
                console.log('Toast not available', e)
              }
            }}
            onClose={() => {
              setRatingModalOpen(false)
              setSelectedBookingForRating(null)
            }}
          />
        </div>
      </div>
    </div>
  )}
      </div>
    </div>
  )
}

