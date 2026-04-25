import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { CreateProjectModal, InviteMemberModal, TaskCreationModal, ResourceAllocationModal } from '../components/OrganizationModals'
import EditProjectModal from '../components/OrganizationModals/EditProjectModal'
import OrganizationDashboardMain from '../components/Dashboard/OrganizationDashboardMain'
import LlamaChatbot from '../components/AI/LlamaChatbot'

type Project = {
  _id: string
  title: string
  description?: string
  budget?: number
  deadline?: string
  skills?: string[]
  status?: string
  teamSize?: number
}

type Member = {
  _id: string
  name?: string
  email?: string
  role?: string
  status?: string
  invitedAt?: string
  joinedAt?: string
  user?: any
}

type Task = {
  _id: string
  title: string
  description?: string
  assignedTo?: Member | string
  status?: 'todo' | 'in-progress' | 'review' | 'completed' | string
  priority?: string
  deadline?: string
  progress?: number
}

export default function OrganizationDashboard() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  // client-side access control: only allow users with userType === 'organization'
  useEffect(() => {
    try {
      const ut = String((user && (user as any).userType) || '').toLowerCase()
      if (!loading && ut !== 'organization') {
        // redirect non-organization users to home (UI-only guard)
        navigate('/')
      }
    } catch (e) {
      if (!loading) navigate('/')
    }
  }, [user, loading, navigate])

  return (
    <>
      <div className="py-8 text-gray-900 dark:text-gray-100">
          <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Organization Dashboard</h1>
                <p className="text-sm text-gray-600 dark:text-gray-300">Manage projects, tasks, resources and your team.</p>
              </div>
            </header>

            {/* Organization profile */}
            <section className="rounded-2xl p-6 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h2 className="text-lg font-semibold mb-2">Organization Profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-2">
                  <div className="font-medium text-gray-900 dark:text-white">{(user && ((user as any).organizationDetails?.name || (user as any).name)) || 'Your Organization Name'}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-300">{(user && (user as any).organizationDetails?.description) || 'No description provided.'}</div>
                  <div className="mt-2 text-sm text-gray-500 dark:text-gray-300">Website: {(user && (user as any).organizationDetails?.website) || '—'}</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-300">Contact: {(user && (user as any).organizationDetails?.contactName) || (user && (user as any).organizationDetails?.contactEmail) || '—'}</div>
                </div>
                <div className="flex items-center justify-end">
                  <div className="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">Organization</div>
                </div>
              </div>
            </section>

      <OrganizationDashboardMain />
          </div>
        </div>
      <LlamaChatbot />
    </>
  )
}

function OrganizationTabs() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'projects'|'tasks'|'resources'|'team'|'analytics'>('projects')
  const [projects, setProjects] = useState<Project[]>([])
  const [resources, setResources] = useState<any[]>([])
  const [team, setTeam] = useState<Member[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any | null>(null)

  const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
  const token = typeof window !== 'undefined' ? localStorage.getItem('devlink_token') : null
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }), [token])

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch(`${API_BASE}/organization/projects`, { headers })
        if (!res.ok) return
        const j = await res.json()
        // backend sometimes returns { success, data } or array directly
        const data = Array.isArray(j) ? j : (j && j.data) || j.projects || []
        setProjects(data)
      } catch (e) { console.warn(e) }
    }
    async function loadResources() {
      try {
        const res = await fetch(`${API_BASE}/organization/resources`, { headers })
        if (!res.ok) return
        const j = await res.json()
        const data = Array.isArray(j) ? j : (j && j.data) || j.resources || []
        setResources(data)
      } catch (e) { console.warn(e) }
    }
    async function loadTeam() {
      try {
        const res = await fetch(`${API_BASE}/organization/team`, { headers })
        if (!res.ok) return
        const j = await res.json()
        const data = Array.isArray(j) ? j : (j && j.data) || j.members || []
        setTeam(data)
      } catch (e) { console.warn(e) }
    }
    loadProjects(); loadResources(); loadTeam();
  }, [API_BASE, headers])

  useEffect(() => {
    if (!selectedProject && projects && projects.length) setSelectedProject(String(projects[0]._id || (projects[0] as any).id))
  }, [projects])

  useEffect(() => {
    async function loadTasks() {
      if (!selectedProject) return setTasks([])
      try {
        const res = await fetch(`${API_BASE}/organization/projects/${selectedProject}/tasks`, { headers })
        if (!res.ok) return
        const j = await res.json()
        const data = Array.isArray(j) ? j : (j && j.data) || j.tasks || []
        setTasks(data)
      } catch (e) { console.warn(e) }
    }
    if (tab === 'tasks') loadTasks()
  }, [tab, selectedProject, API_BASE, headers])

  async function updateTaskProgressLocal(taskId: string, progress: number) {
    try {
      // optimistic update
      setTasks(prev => prev.map(t => (String((t as any)._id) === String(taskId) ? ({ ...(t as any), progress }) : t)))
      const res = await fetch(`${API_BASE}/tasks/${taskId}/progress`, { method: 'PATCH', headers, body: JSON.stringify({ progress }) })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(txt || 'Failed to update progress')
      }
      const j = await res.json()
      const updated = (j && (j.data || j)) || null
      if (updated) setTasks(prev => prev.map(t => (String((t as any)._id) === String(taskId) ? updated : t)))
    } catch (e: any) {
      console.warn('Update task progress failed', e)
      alert(e.message || 'Failed to update task progress')
    }
  }

  return (
    <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <TabButton active={tab==='projects'} onClick={() => setTab('projects')}>Projects</TabButton>
          <TabButton active={tab==='tasks'} onClick={() => setTab('tasks')}>Tasks</TabButton>
          <TabButton active={tab==='resources'} onClick={() => setTab('resources')}>Resources</TabButton>
          <TabButton active={tab==='team'} onClick={() => setTab('team')}>Team</TabButton>
          <TabButton active={tab==='analytics'} onClick={() => setTab('analytics')}>Analytics</TabButton>
        </div>
      </div>

      {tab === 'projects' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <CreateProjectModalButton onCreated={(p: any) => setProjects(prev => [p, ...prev])} headers={headers} />
          </div>
          {projects.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-300">No projects found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map(p => (
                <div key={p._id} className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white">{p.title}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-300 mt-1">{p.description}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-3">Status: <span className={`px-2 py-0.5 rounded text-xs ${p.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-white'}`}>{p.status || 'open'}</span> • Budget: ${p.budget ?? '—'}</div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button className="p-2 rounded border text-gray-700 dark:text-gray-200" onClick={() => window.location.href = `/app/projects/${p._id}`} aria-label="View project">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                      <button className="p-2 rounded border text-gray-700 dark:text-gray-200" onClick={() => { setEditingProject(p); setEditOpen(true) }} aria-label="Edit project">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 21v-3l11-11 3 3L6 21H3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                      <button className="p-2 rounded bg-red-600 text-white" onClick={async () => {
                        if (!confirm('Delete this project?')) return
                        const res = await fetch(`${API_BASE}/projects/${p._id}`, { method: 'DELETE', headers })
                        if (res.ok) setProjects(prev => prev.filter(x => x._id !== p._id))
                        else alert('Failed to delete')
                      }} aria-label="Delete project">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div>
          <div className="mb-3">
            <label className="block text-sm font-medium">Project</label>
            <select value={selectedProject || ''} onChange={(e) => setSelectedProject(e.target.value)} className="mt-1 p-2 rounded border w-full bg-white dark:bg-gray-900">
              {projects.map(p => <option key={(p as any)._id} value={(p as any)._id}>{p.title}</option>)}
            </select>
          </div>
          <div className="space-y-3">
            <TaskCreationInline projects={projects} members={team} onCreated={(projId: string, t: Task) => setTasks(prev => [t, ...prev])} headers={headers} />
            {tasks.length === 0 ? <div className="text-sm text-gray-500 dark:text-gray-300">No tasks for this project.</div> : (
              <div className="grid grid-cols-1 gap-3">
                {tasks.map(t => (
                  <div key={t._id} className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">{t.title} <span className="text-xs text-gray-500 dark:text-gray-300">({t.status})</span></div>
                        <div className="text-sm text-gray-500 dark:text-gray-300 mt-1">Assigned to: {Array.isArray((t as any).assignedTo) ? (t as any).assignedTo.map((a: any) => `${a.firstName || ''} ${a.lastName || ''}`).join(', ') : (typeof t.assignedTo === 'string' ? t.assignedTo : t.assignedTo?.name || '—')}</div>
                        <div className="mt-3">
                          <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                            <div className="h-full bg-[#0066FF]" style={{ width: `${t.progress || 0}%` }} />
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-300 mt-1">Progress: {t.progress || 0}% • Due: {t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}</div>
                        </div>
                      </div>
                      <div className="ml-4 flex flex-col items-end gap-2">
                        <select value={t.progress || 0} onChange={(e) => updateTaskProgressLocal(t._id, Number(e.target.value))} className="p-1 border rounded text-xs bg-white dark:bg-gray-800">
                          <option value={0}>0%</option>
                          <option value={25}>25%</option>
                          <option value={50}>50%</option>
                          <option value={75}>75%</option>
                          <option value={100}>100%</option>
                        </select>
                        <button className="px-3 py-1 bg-green-600 text-white rounded text-sm" onClick={() => updateTaskProgressLocal(t._id, t.progress || 0)}>Save</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'resources' && (
        <div className="space-y-3">
          <div className="flex justify-end mb-2">
            <ResourceAllocationModalButton projects={projects} onCreated={(r) => setResources(prev => [r, ...prev])} headers={headers} />
          </div>
          {resources.length === 0 ? <div className="text-sm text-gray-500">No resources allocated.</div> : resources.map(r => (
            <div key={r._id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
              <div className="font-medium">{r.name} <span className="text-xs text-gray-500">({r.type})</span></div>
              <div className="text-sm text-gray-500">Quantity: {r.quantity} • Cost: {r.cost || 0}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'team' && (
        <div className="space-y-3">
          <div className="flex justify-end mb-2">
            <InviteMemberModalButton onInvited={(m) => setTeam(prev => [m, ...prev])} headers={headers} />
          </div>
          {team.length === 0 ? <div className="text-sm text-gray-500">No team members yet.</div> : team.map(m => (
            <div key={m._id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
              <div>
                <div className="font-medium">{m.user ? `${m.user.firstName || ''} ${m.user.lastName || ''}` : (m.name || m.email || 'Member')}</div>
                <div className="text-sm text-gray-500">{m.user ? m.user.email : m.email}</div>
                <div className="text-xs text-gray-400">Status: {m.status || 'invited'}{m.invitedAt ? ` • Invited: ${new Date(m.invitedAt).toLocaleString()}` : ''}{m.joinedAt ? ` • Joined: ${new Date(m.joinedAt).toLocaleDateString()}` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500">{m.role}</div>
                {String((m.status || '').toLowerCase()) === 'invited' && (
                  <>
                    <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={async () => {
                      if (!confirm('Resend invitation?')) return
                      try {
                        const res = await fetch(`${API_BASE}/organization/invitations/${m._id}/resend`, { method: 'POST', headers })
                        if (!res.ok) throw new Error('Failed to resend')
                        const j = await res.json()
                        // update team state
                        setTeam(prev => prev.map(x => (String(x._id) === String(m._id) ? (j.data || j) : x)))
                        alert('Invitation resent')
                      } catch (e: any) { alert(e.message || 'Failed') }
                    }}>Resend</button>
                    <button className="px-3 py-1 bg-red-600 text-white rounded" onClick={async () => {
                      if (!confirm('Cancel this invitation?')) return
                      try {
                        const res = await fetch(`${API_BASE}/organization/invitations/${m._id}/cancel`, { method: 'POST', headers })
                        if (!res.ok) throw new Error('Failed to cancel')
                        const j = await res.json()
                        setTeam(prev => prev.map(x => (String(x._id) === String(m._id) ? (j.data || j) : x)))
                        alert('Invitation cancelled')
                      } catch (e: any) { alert(e.message || 'Failed') }
                    }}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <div className="text-sm text-gray-500">Projects</div>
            <div className="text-2xl font-semibold">{projects.length}</div>
          </div>
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <div className="text-sm text-gray-500">Tasks</div>
            <div className="text-2xl font-semibold">{tasks.length}</div>
          </div>
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <div className="text-sm text-gray-500">Resources</div>
            <div className="text-2xl font-semibold">{resources.length}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-md ${active ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700'}`}>
      {children}
    </button>
  )
}

function CreateProjectModalButton({ onCreated, headers }: { onCreated: (p: any) => void; headers: any }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1 bg-green-600 text-white rounded">Create New Project</button>
      <CreateProjectModal open={open} onClose={() => setOpen(false)} onCreated={(p: any) => { onCreated(p); setOpen(false) }} orgId={localStorage.getItem('devlink_user_id')} headers={headers} />
    </>
  )
}

function InviteMemberModalButton({ onInvited, headers }: { onInvited: (m: any) => void; headers: any }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1 bg-indigo-600 text-white rounded">Invite</button>
      <InviteMemberModal open={open} onClose={() => setOpen(false)} onInvited={(m: any) => { onInvited(m); setOpen(false) }} headers={headers} />
    </>
  )
}

function TaskCreationInline({ projects, members, onCreated, headers }: { projects: Project[]; members: Member[]; onCreated: (projectId: string, task: Task) => void; headers: any }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center justify-between">
      <div />
      <div>
        <button onClick={() => setOpen(true)} className="px-3 py-1 bg-yellow-600 text-white rounded">Create Task</button>
        <TaskCreationModal open={open} onClose={() => setOpen(false)} onCreated={(projId, t) => { onCreated(projId, t); setOpen(false) }} projects={projects} members={members} headers={headers} />
      </div>
    </div>
  )
}

function ResourceAllocationModalButton({ projects, onCreated, headers }: { projects: Project[]; onCreated: (r: any) => void; headers: any }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="px-3 py-1 bg-purple-600 text-white rounded">Allocate Resource</button>
      <ResourceAllocationModal open={open} onClose={() => setOpen(false)} onCreated={(r: any) => { onCreated(r); setOpen(false) }} projects={projects} headers={headers} />
    </>
  )
}
