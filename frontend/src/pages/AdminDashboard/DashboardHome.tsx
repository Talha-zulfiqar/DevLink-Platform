import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from './AdminLayout'
import adminApi from '../../services/adminApi'
import { useToast } from '../../components/UX/ToastProvider'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
import { Users, DollarSign, Activity, TrendingUp, CheckCircle, Send, FileText, CreditCard } from 'lucide-react'

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white dark:bg-gray-800 rounded-lg shadow p-4 border ${className}`}>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3"></div>
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
    </div>
  )
}

export default function DashboardHome() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [activityModal, setActivityModal] = useState<any | null>(null)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceSubject, setAnnounceSubject] = useState('')
  const [announceMessage, setAnnounceMessage] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const navigate = useNavigate()
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.fetchAdminStats()
      if (res && res.success) setData(res.data)
      else setError('Failed to load dashboard data')
    } catch (e: any) {
      console.error('Dashboard load error', e)
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 60_000) // refresh every 60s
    return () => clearInterval(iv)
  }, [])

  const revenueTrend = useMemo(() => (data && data.revenueTrend) || [], [data])
  const userGrowth = useMemo(() => (data && data.userGrowth) || [], [data])

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Hero stats */}
        <section>
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="flex-1 bg-gradient-to-r from-sky-500 to-indigo-600 text-white rounded-lg shadow-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm opacity-90">Platform Overview</div>
                  <h2 className="text-3xl font-bold mt-2">{loading ? '—' : (data?.summary?.totalUsers ?? 0)} Users</h2>
                  <div className="mt-2">Active now: <span className="font-semibold">{loading ? '—' : (data?.summary?.activeUsers ?? 0)}</span></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-3 rounded-md">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-6">
                <div>
                  <div className="text-xs opacity-80">Revenue</div>
                  <div className="text-2xl font-semibold">${loading ? '—' : (data?.summary?.totalRevenue ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs opacity-80">Growth</div>
                  <div className="text-2xl font-semibold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-200" />12%</div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-96 grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border">
                <div className="text-sm text-gray-500">Total Users</div>
                <div className="text-2xl font-bold mt-2">{loading ? <span className="inline-block w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded"/> : data?.summary?.totalUsers}</div>
                <div className="text-xs text-gray-500 mt-1">+5 today • 121 total</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border">
                <div className="text-sm text-gray-500">Revenue</div>
                <div className="text-2xl font-bold mt-2">${loading ? <span className="inline-block w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded"/> : (data?.summary?.totalRevenue ?? 0).toFixed(2)}</div>
                <div className="text-xs text-gray-500 mt-1">${loading ? '—' : (data?.platformMetrics?.avgSessionPrice ?? 0)} avg • ${loading ? '—' : (data?.revenueTrend?.slice(-1)[0]?.revenue ?? 0)} today</div>
              </div>
            </div>
          </div>
        </section>

        {/* Metric cards */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Users</div>
                  <div className="text-xl font-bold mt-1">{loading ? '—' : data?.summary?.totalUsers}</div>
                  <div className="text-xs text-green-600 mt-1">+12% this month</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900 p-2 rounded">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Revenue</div>
                  <div className="text-xl font-bold mt-1">${loading ? '—' : (data?.summary?.totalRevenue ?? 0).toFixed(2)}</div>
                  <div className="text-xs text-green-600 mt-1">+15% from last month</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900 p-2 rounded">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Sessions</div>
                  <div className="text-xl font-bold mt-1">{loading ? '—' : (data?.summary?.activeSessions ?? 0)}</div>
                  <div className="text-xs text-gray-500 mt-1">5 live • 87% completion</div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900 p-2 rounded">
                  <Activity className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border hover:shadow-lg transition">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Mentors</div>
                  <div className="text-xl font-bold mt-1">{loading ? '—' : (data?.summary?.totalMentors ?? 0)}</div>
                  <div className="text-xs text-gray-500 mt-1">{loading ? '—' : (data?.summary?.pendingApplications ?? 0)} pending</div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900 p-2 rounded">
                  <TrendingUp className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Charts row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold">Revenue Trend (last 30 days)</h3>
              <div className="text-sm text-gray-500">Platform revenue • 15% commission</div>
            </div>
            <div style={{ height: 300 }}>
              {loading ? <div className="h-full"><div className="animate-pulse h-full bg-gray-100 dark:bg-gray-700" /></div> : (
                <ResponsiveContainer>
                  <LineChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(v:any) => [`$${v}`, 'Revenue']} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="sessions" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-md font-semibold">User Growth (6 months)</h3>
              <div className="text-sm text-gray-500">New users by month</div>
            </div>
            <div style={{ height: 300 }}>
              {loading ? <div className="h-full"><div className="animate-pulse h-full bg-gray-100 dark:bg-gray-700" /></div> : (
                <ResponsiveContainer>
                  <BarChart data={userGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="students" fill="#3b82f6" name="Students" />
                    <Bar dataKey="mentors" fill="#8b5cf6" name="Mentors" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>

        {/* Recent Activity & Quick Actions */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow p-4 border">
            <h3 className="text-lg font-semibold mb-3">Recent Activity</h3>
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            ) : (
              <div className="space-y-2">
                {(data?.recentActivity || []).map((a:any, idx:number) => (
                  <div key={idx} className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm">
                        {a.action === 'payment_succeeded' && (<span><strong>{a.user?.firstName || a.user?.email || 'Unknown'}</strong> payment received <span className="font-semibold">${a.metadata.amount}</span></span>)}
                        {a.action === 'booking_created' && (<span><strong>{a.user?.firstName || a.user?.email || 'Unknown'}</strong> booked a session with <strong>{(a.metadata.mentor && (a.metadata.mentor.firstName || a.metadata.mentor.email)) || 'mentor'}</strong></span>)}
                        {a.action === 'user_registered' && (<span><strong>{a.user?.firstName || a.user?.email || 'Unknown'}</strong> registered</span>)}
                        {a.action === 'mentor_application' && (<span><strong>{a.user?.firstName || a.user?.email || 'Unknown'}</strong> submitted a mentor application</span>)}
                      </div>
                      <div className="text-xs text-gray-500">{new Date(a.timestamp).toLocaleString()}</div>
                    </div>
                    <div>
                      <button onClick={() => setActivityModal(a)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">View</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border">
            <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
            <div className="space-y-3">
              <button onClick={() => navigate('/admin/approvals')} className="w-full flex items-center gap-3 px-3 py-2 bg-green-600 text-white rounded hover:opacity-95"><CheckCircle /> Approve Mentor <span className="ml-auto bg-white/20 px-2 py-0.5 rounded">{loading ? '—' : data?.summary?.pendingApplications ?? 0}</span></button>

              <button onClick={() => navigate('/admin/ratings')} className="w-full flex items-center gap-3 px-3 py-2 bg-purple-600 text-white rounded hover:opacity-95"><TrendingUp /> Manage Ratings</button>

              <button onClick={() => navigate('/admin/withdrawals')} className="w-full flex items-center gap-3 px-3 py-2 bg-indigo-600 text-white rounded hover:opacity-95"><CreditCard /> Manage Withdrawals</button>

              <button onClick={() => setAnnounceOpen(true)} className="w-full flex items-center gap-3 px-3 py-2 bg-blue-600 text-white rounded hover:opacity-95"><Send /> Send Announcement</button>

              <button onClick={() => {
                // Export CSV derived from dashboard data
                try {
                  const rows: string[] = []
                  // summary row
                  const s = data?.summary || {}
                  rows.push(['Metric','Value'].join(','))
                  rows.push(['Total Users', String(s.totalUsers || 0)].join(','))
                  rows.push(['Active Users', String(s.activeUsers || 0)].join(','))
                  rows.push(['Total Revenue', String(s.totalRevenue || 0)].join(','))
                  rows.push([] as any)
                  rows.push(['Date','Revenue','Sessions'].join(','))
                  ;(data?.revenueTrend || []).forEach((r:any) => rows.push([r.date, String(r.revenue), String(r.sessions)].join(',')))
                  const csv = rows.join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'dashboard_export.csv'
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  window.URL.revokeObjectURL(url)
                } catch (e) { console.error('Export failed', e); alert('Export failed') }
              }} className="w-full flex items-center gap-3 px-3 py-2 bg-gray-700 text-white rounded hover:opacity-95"><FileText /> Export Report</button>
            </div>
          </aside>
        </section>
        {/* Activity modal */}
        {activityModal && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg w-full max-w-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">Activity details</h4>
                <div className="flex items-center gap-2">
                  {activityModal.action === 'mentor_application' && (
                    <button onClick={() => navigate('/admin/approvals')} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Open Approvals</button>
                  )}
                  <button onClick={() => setActivityModal(null)} className="px-3 py-1 border rounded text-sm">Close</button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Render payment */}
                {activityModal.type === 'payment' && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="text-sm text-gray-500">Payment received</div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-gray-500">Payer</div>
                        <div className="text-lg font-semibold">{activityModal.user?.firstName ? `${activityModal.user.firstName} ${activityModal.user.lastName || ''}` : (activityModal.user?.email || 'Unknown')}</div>
                        <div className="text-xs text-gray-500 mt-1">{activityModal.user?._id ? `User: ${activityModal.user._id}` : ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Receiver</div>
                        <div className="text-lg font-semibold">{activityModal.metadata?.mentor ? `${activityModal.metadata.mentor.firstName || ''} ${activityModal.metadata.mentor.lastName || ''}` : 'Platform / Unknown'}</div>
                        <div className="text-xs text-gray-500 mt-1">{activityModal.metadata?.mentor?.email ? activityModal.metadata.mentor.email : activityModal.metadata?.bookingId ? `Booking: ${activityModal.metadata.bookingId}` : ''}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Amount</div>
                        <div className="text-xl font-bold">${activityModal.metadata?.amount ?? '0.00'} {activityModal.metadata?.currency ? activityModal.metadata.currency.toUpperCase() : ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Date</div>
                        <div className="text-xs text-gray-500">{activityModal.timestamp ? new Date(activityModal.timestamp).toLocaleString() : ''}</div>
                        <div className="text-xs text-gray-500 mt-1">{activityModal.metadata?.paymentIntentId ? `Payment ID: ${activityModal.metadata.paymentIntentId}` : ''}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Booking */}
                {activityModal.type === 'booking' && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="text-sm text-gray-500">New booking</div>
                    <div className="mt-2">
                      <div className="text-lg font-semibold">{activityModal.user?.firstName || activityModal.user?.email || 'Student'}</div>
                      <div className="text-sm text-gray-500">with <strong>{(activityModal.metadata?.mentor && (activityModal.metadata.mentor.firstName || activityModal.metadata.mentor.email)) || 'mentor'}</strong></div>
                      <div className="text-xs text-gray-500 mt-2">Start: {activityModal.metadata?.startTime ? new Date(activityModal.metadata.startTime).toLocaleString() : '—'}</div>
                    </div>
                  </div>
                )}

                {/* User registration */}
                {activityModal.type === 'user' && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="text-sm text-gray-500">New user registered</div>
                    <div className="mt-2">
                      <div className="text-lg font-semibold">{activityModal.user?.firstName ? `${activityModal.user.firstName} ${activityModal.user.lastName || ''}` : activityModal.user?.email}</div>
                      <div className="text-xs text-gray-500">Role: {activityModal.user?.role || 'student'} • Joined: {new Date(activityModal.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                )}

                {/* Mentor application */}
                {activityModal.type === 'application' && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
                    <div className="text-sm text-gray-500">Mentor application</div>
                    <div className="mt-2">
                      <div className="text-lg font-semibold">{activityModal.user?.firstName || activityModal.user?.email || 'Applicant'}</div>
                      <div className="text-sm text-gray-500 mt-1">Score: {activityModal.metadata?.score ?? '—'}</div>
                      <div className="mt-3 text-sm">{activityModal.metadata?.summary || ''}</div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => navigate('/admin/approvals')} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Open Approvals</button>
                    </div>
                  </div>
                )}

                {/* Fallback - simple key/value list */}
                {['payment','booking','user','application'].indexOf(activityModal.type) === -1 && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <h5 className="text-sm text-gray-500 mb-2">Details</h5>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {Object.keys(activityModal || {}).map((k:any) => (
                        <div key={k} className="break-words"><strong>{k}</strong>: {String((activityModal as any)[k])}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Announce modal */}
        {announceOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg w-11/12 md:w-2/3 lg:w-1/2 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-lg font-semibold">Send Announcement</h4>
                <button onClick={() => setAnnounceOpen(false)} className="text-sm text-gray-600">Close</button>
              </div>
              <div className="space-y-2">
                <input className="w-full p-2 border rounded bg-transparent" placeholder="Subject" value={announceSubject} onChange={e => setAnnounceSubject(e.target.value)} />
                <textarea className="w-full p-2 border rounded bg-transparent" placeholder="Message" value={announceMessage} onChange={e => setAnnounceMessage(e.target.value)} rows={6} />
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => setAnnounceOpen(false)} className="px-3 py-1 border rounded">Cancel</button>
                  <button onClick={async () => {
                    try {
                      setActionLoading(true)
                      const res = await adminApi.announce(announceSubject, announceMessage)
                      if (res && res.success) {
                        toast.show(`Announcement sent to ${res.recipients} users!`, 'success')
                        setAnnounceOpen(false)
                        setAnnounceMessage('')
                        setAnnounceSubject('')
                      } else {
                        toast.show('Announcement failed', 'error')
                      }
                    } catch (e:any) { 
                      console.error(e)
                      toast.show(`Announcement failed: ${e?.message || 'Unknown error'}`, 'error')
                    }
                    finally { setActionLoading(false) }
                  }} className="px-4 py-2 bg-blue-600 text-white rounded">Send</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
