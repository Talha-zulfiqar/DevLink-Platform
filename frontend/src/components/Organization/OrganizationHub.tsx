import React, { useEffect, useState, useRef } from 'react'
import TaskCard from './TaskCard'
import TaskDetailModal from './TaskDetailModal'

export default function OrganizationHub() {
  const [invites, setInvites] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<any | null>(null)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectDetails, setProjectDetails] = useState<any | null>(null)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectAnimate, setProjectAnimate] = useState(false)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

  function getHeaders() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('devlink_token') : null
    const h: Record<string,string> = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }

  async function loadAll() {
    setLoading(true)
    try {
      // fetch invitations and tasks (try organization-scoped tasks first, fall back to global)
      const riPromise = fetch(`${API_BASE}/organization/invitations/my`, { headers: getHeaders() })
  const rtOrgPromise = fetch(`${API_BASE}/organization/tasks/assigned-to-me`, { headers: getHeaders() })
  const [ri, rtOrg] = await Promise.all([riPromise, rtOrgPromise])
      // parse invitations response (accept raw array or { data: [...] } wrapper)
      try {
        if (ri.ok) {
          const ji = await ri.json()
          const invitesArr = Array.isArray(ji) ? ji : (Array.isArray(ji.data) ? ji.data : (ji.data || []))
          setInvites(invitesArr)
        } else {
          const txt = await ri.text().catch(() => '')
          console.debug('[OrganizationHub] invitations fetch not ok', ri.status, txt)
          setFetchError(`Invites fetch failed: ${ri.status}`)
        }
      } catch (e) { console.debug('[OrganizationHub] invitations parse error', e) }

      // parse tasks response robustly
      try {
        // use organization-scoped response
        if (rtOrg && rtOrg.ok) {
          const jt = await rtOrg.json()
          // support multiple shapes:
          // 1) { success: true, count: X, tasks: [...] }
          // 2) { success: true, data: [...] }
          // 3) direct array [...]
          let tasksArr: any[] = []
          if (Array.isArray(jt)) tasksArr = jt
          else if (Array.isArray(jt.tasks)) tasksArr = jt.tasks
          else if (Array.isArray(jt.data)) tasksArr = jt.data
          else if (Array.isArray(jt.results)) tasksArr = jt.results
          else if (Array.isArray(jt.data?.results)) tasksArr = jt.data.results
          else tasksArr = []
          // ensure we always set an array
          setTasks(tasksArr || [])
        } else {
          const txt = await (rtOrg ? rtOrg.text().catch(() => '') : Promise.resolve(''))
          const code = rtOrg ? rtOrg.status : 'no-response'
          console.debug('[OrganizationHub] tasks fetch not ok (org endpoint)', code, txt)
          setFetchError(`Tasks fetch failed (org): ${code}`)
          setTasks([])
        }
      } catch (e) { console.debug('[OrganizationHub] tasks parse error', e); setTasks([]) }
    } catch (e) {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  // close project modal on Escape (uses animated close)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && projectModalOpen) {
        setProjectModalOpen(false)
        setProjectDetails(null)
        setSelectedProject(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [projectModalOpen])

  const badge = (invites.length || 0) + (tasks.length || 0)

  async function acceptInvite(id: string) {
    try {
      const res = await fetch(`${API_BASE}/organization/invitations/${id}/accept`, { method: 'POST', headers: getHeaders() })
      if (res.ok) {
        setInvites(prev => prev.filter(i => String(i._id) !== String(id)))
        // notify other UI parts (dashboard) to refresh organization data
        try { window.dispatchEvent(new CustomEvent('org-invite-accepted', { detail: { inviteId: id } })) } catch (e) {}
      }
    } catch (e) {}
  }

  async function declineInvite(id: string) {
    try { const res = await fetch(`${API_BASE}/organization/invitations/${id}/reject`, { method: 'POST', headers: getHeaders() }); if (res.ok) setInvites(prev => prev.filter(i => String(i._id) !== String(id))) }
    catch (e) {}
  }

  async function updateProgress(taskId: string, progress: number) {
    try {
      // use organization-scoped endpoint
      const res = await fetch(`${API_BASE}/organization/tasks/${taskId}/progress`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ progress }) })
      if (res.ok) {
        const j = await res.json()
        // server may return data or task
        const payload = j.data || j.task || j.task || j
        setTasks(prev => prev.map(t => (String(t._id) === String(taskId) ? payload : t)))
      } else {
        const txt = await res.text().catch(() => '')
        console.debug('[OrganizationHub] updateProgress failed (org)', res.status, txt)
        setFetchError(`Update progress failed (org): ${res.status}`)
      }
    } catch (e) {
      console.debug('[OrganizationHub] updateProgress error', e)
      setFetchError('Update progress error')
    }
  }

  async function handleViewProject(projectId: string) {
    if (!projectId) return
    setProjectLoading(true)
    setProjectError(null)
    try {
      const res = await fetch(`${API_BASE}/organization/projects/${projectId}/details`, { headers: getHeaders() })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        setProjectError(`Failed to load project: ${res.status}`)
        console.error('Failed to fetch project details', res.status, txt)
        return
      }
      const j = await res.json()
      const payload = (j && (j.data || j.project)) ? (j.data || j.project) : j
      setProjectDetails(payload)
      setSelectedProject(projectId)
      setProjectModalOpen(true)
    } catch (e) {
      console.error('Error fetching project details', e)
      setProjectError('Error loading project details')
    } finally {
      setProjectLoading(false)
    }
  }

  function handleTaskClick(task: any) {
    setSelectedTask(task)
    setIsTaskModalOpen(true)
  }

  async function handleStatusUpdate(taskId: string, newStatus: string) {
    try {
      const res = await fetch(`${API_BASE}/organization/tasks/${taskId}/status`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status: newStatus }) })
      if (res.ok) {
        const j = await res.json()
        const payload = j.data || j.task || j
        console.log('[OrganizationHub] Status update response:', payload, 'Setting status to:', newStatus)
        // Update the task with the correct status
        setTasks(prev => prev.map(t => {
          if (String(t._id) === String(taskId)) {
            return { ...t, ...payload, status: newStatus }
          }
          return t
        }))
        // Also update selectedTask
        setSelectedTask(prev => {
          if (prev && String(prev._id) === String(taskId)) {
            return { ...prev, ...payload, status: newStatus }
          }
          return prev
        })
        // Notify dashboard about update
        try {
          window.dispatchEvent(new CustomEvent('org-task-updated', { detail: { ...payload, status: newStatus } }))
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to update status', e)
    }
  }

  async function handleProgressUpdate(taskId: string, newProgress: number) {
    try {
      const res = await fetch(`${API_BASE}/organization/tasks/${taskId}/progress`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ progress: newProgress }) })
      if (res.ok) {
        const j = await res.json()
        const payload = j.data || j.task || j
        console.log('[OrganizationHub] Progress update response:', payload, 'Setting progress to:', newProgress)
        // Update the task with the correct progress - spread payload FIRST, then override with newProgress
        setTasks(prev => prev.map(t => {
          if (String(t._id) === String(taskId)) {
            return { ...t, ...payload, progress: newProgress }
          }
          return t
        }))
        // Also update selectedTask
        setSelectedTask(prev => {
          if (prev && String(prev._id) === String(taskId)) {
            return { ...prev, ...payload, progress: newProgress }
          }
          return prev
        })
        // Notify dashboard about update
        try {
          window.dispatchEvent(new CustomEvent('org-task-updated', { detail: { ...payload, progress: newProgress } }))
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to update progress', e)
    }
  }

  async function handleMarkComplete(taskId: string) {
    try {
      const res = await fetch(`${API_BASE}/organization/tasks/${taskId}/progress`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ progress: 100 }) })
      if (res.ok) {
        setTasks(prev => prev.map(t => (String(t._id) === String(taskId) ? { ...t, progress: 100, status: 'completed' } : t)))
        setIsTaskModalOpen(false)
        // notify other UI parts (dashboard) about the updated task so they can refresh immediately
        try {
          const j = await res.json().catch(() => ({}))
          const payload = (j && (j.data || j.task)) ? (j.data || j.task) : j
          window.dispatchEvent(new CustomEvent('org-task-updated', { detail: payload }))
        } catch (e) {}
      } else {
        console.error('Failed to mark complete', await res.text().catch(() => ''))
      }
    } catch (e) { console.error('Error marking complete', e) }
  }

  async function handleRemoveTask(taskId: string) {
    try {
      const res = await fetch(`${API_BASE}/organization/tasks/${taskId}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
      if (res.ok) {
        setTasks(prev => prev.filter(t => String(t._id) !== String(taskId)))
        setIsTaskModalOpen(false)
        setSelectedTask(null)
        // notify other UI parts about the removal
        try {
          window.dispatchEvent(new CustomEvent('org-task-removed', { detail: { taskId } }))
        } catch (e) {}
      } else {
        console.error('Failed to remove task', await res.text().catch(() => ''))
      }
    } catch (e) { console.error('Error removing task', e) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(s => !s)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Organization hub"
        title="Organization hub"
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-white/30"
      >
        {/* professional building icon (inline SVG) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect x="3" y="4" width="6" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="15" y="7" width="6" height="13" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 10h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9 14h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center bg-[#0066FF] text-white text-[11px] font-semibold rounded-full px-1.5 py-0.5 leading-none shadow-sm ring-1 ring-white/20">{badge}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded shadow-lg border dark:border-gray-700 p-3 z-50">
          <h4 className="font-semibold">Organization Hub</h4>
          <div className="mt-2">
            <div className="text-sm font-medium">Invitations</div>
            {loading ? <div className="text-sm text-gray-500">Loading...</div> : null}
            {fetchError && <div className="text-xs text-red-600 mt-1">{fetchError}</div>}
            {invites.length === 0 && !loading ? <div className="text-xs text-gray-500">No pending invites</div> : invites.map(i => (
              <div key={i._id} className="mt-2 p-2 border rounded flex items-center justify-between bg-gray-50 dark:bg-gray-700">
                <div>
                  <div className="font-medium text-sm">{(i.organization && (i.organization.name || `${i.organization.firstName || ''} ${i.organization.lastName || ''}`)) || 'Organization'}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-300">Role: {i.role || 'member'}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => acceptInvite(i._id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Accept</button>
                  <button onClick={() => declineInvite(i._id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Decline</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="text-sm font-medium">Assigned Tasks</div>
            {tasks.length === 0 ? (
              <div className="text-xs text-gray-500">No tasks assigned</div>
            ) : (
              <div className="tasks-container" style={{ maxHeight: '360px', overflowY: 'auto', paddingRight: 8 }}>
                {tasks.map(t => (
                  <TaskCard key={t._id} task={t} onTaskClick={handleTaskClick} onViewProject={handleViewProject} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {projectModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50"
          onClick={(e) => { if (e.target === e.currentTarget) { setProjectModalOpen(false); setProjectDetails(null); setSelectedProject(null); } }}
        >
            <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded shadow-lg w-full max-w-2xl p-4 relative" style={{ maxHeight: '80vh', overflowY: 'auto', zIndex: 10000 }}>
            {/* Close X in top-right */}
            <button
              onClick={() => { setProjectModalOpen(false); setProjectDetails(null); setSelectedProject(null); }}
              aria-label="Close project details"
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <span className="text-lg">✕</span>
            </button>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Project Details</h3>
            </div>
            <div className="mt-4">
              {projectLoading ? <div className="text-sm">Loading...</div> : null}
              {projectError && <div className="text-sm text-red-600">{projectError}</div>}
              {projectDetails && projectDetails.project && (
                <div>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="font-bold text-xl">{projectDetails.project.title}</div>
                      <div className="text-sm text-gray-600 mt-1">{projectDetails.project.description || 'No description'}</div>
                      <div className="mt-2 text-xs text-gray-500">Organization: {projectDetails.project.organization?.name || `${projectDetails.project.organization?.firstName || ''} ${projectDetails.project.organization?.lastName || ''}`}</div>
                    </div>
                    <div className="text-sm text-right">
                      <div className="mb-1">Status: <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs">{projectDetails.project.status || 'active'}</span></div>
                      <div className="text-xs text-gray-500">Due: {projectDetails.project.deadline ? new Date(projectDetails.project.deadline).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="font-medium">Project Tasks</div>
                    {projectDetails.tasks && projectDetails.tasks.length ? (
                      <ul className="mt-2 space-y-2">
                        {projectDetails.tasks.map((pt: any) => (
                          <li key={pt._id} className="p-3 border rounded bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {/* Avatar or initials */}
                              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold">
                                {Array.isArray(pt.assignedTo) && pt.assignedTo[0] ? ((pt.assignedTo[0].firstName || pt.assignedTo[0].lastName) ? `${(pt.assignedTo[0].firstName||'').charAt(0)}${(pt.assignedTo[0].lastName||'').charAt(0)}` : (pt.assignedTo[0].email || '').charAt(0).toUpperCase()) : (pt.assignedTo && (pt.assignedTo.firstName || pt.assignedTo.lastName) ? `${(pt.assignedTo.firstName||'').charAt(0)}${(pt.assignedTo.lastName||'').charAt(0)}` : '?')}
                              </div>
                              <div>
                                <div className="font-medium">{pt.title}</div>
                                <div className="text-xs text-gray-500">Assigned: {Array.isArray(pt.assignedTo) ? pt.assignedTo.map((a:any)=> (a && (a.firstName || a.lastName) ? `${a.firstName||''} ${a.lastName||''}`.trim() : (a && a.email) || (a && a._id) )).filter(Boolean).join(', ') : (pt.assignedTo && (pt.assignedTo.firstName || pt.assignedTo.lastName) ? `${pt.assignedTo.firstName || ''} ${pt.assignedTo.lastName || ''}`.trim() : pt.assignedTo && (pt.assignedTo.email || pt.assignedTo._id) || '—')}</div>
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">{pt.status || '—'}</div>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="text-xs text-gray-500">No tasks</div>}
                  </div>

                  <div className="mt-4">
                    <div className="font-medium">Team Members</div>
                    {projectDetails.members && projectDetails.members.length ? (
                      <ul className="mt-2 grid grid-cols-2 gap-2">
                        {projectDetails.members.map((m: any) => (
                          <li key={m._id} className="p-2 border rounded bg-gray-50 dark:bg-gray-700 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold">{m.user ? `${(m.user.firstName||'').charAt(0)}${(m.user.lastName||'').charAt(0)}` : (m.email||'').charAt(0).toUpperCase()}</div>
                            <div>
                              <div className="font-medium">{m.user ? `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() : (m.name || m.email)}</div>
                              <div className="text-xs text-gray-500">{m.user?.email || '—'}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="text-xs text-gray-500">No members</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <TaskDetailModal task={selectedTask} isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} onMarkComplete={handleMarkComplete} onStatusChange={handleStatusUpdate} onProgressChange={handleProgressUpdate} onRemoveTask={handleRemoveTask} />
    </div>
  )
}
