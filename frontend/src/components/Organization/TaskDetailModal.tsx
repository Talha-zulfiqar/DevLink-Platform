import React, { useState, useEffect } from 'react'

type Props = {
  task: any
  isOpen: boolean
  onClose: () => void
  onMarkComplete: (taskId: string) => void
  onStatusChange?: (taskId: string, status: string) => void
  onProgressChange?: (taskId: string, progress: number) => void
  onRemoveTask?: (taskId: string) => void
}

export default function TaskDetailModal({ task, isOpen, onClose, onMarkComplete, onStatusChange, onProgressChange, onRemoveTask }: Props) {
  const [selectedStatus, setSelectedStatus] = useState(task?.status || 'todo')
  const [progress, setProgress] = useState(task?.progress || 0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (task) {
      setSelectedStatus(task.status || 'todo')
      setProgress(task.progress || 0)
    }
  }, [task])

  if (!isOpen || !task) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('devlink_token') : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      
      // Update status if changed
      if (selectedStatus !== (task.status || 'todo')) {
        console.log('[TaskDetailModal] Updating status from', task.status || 'todo', 'to', selectedStatus)
        const res = await fetch(`/api/organization/tasks/${task._id}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: selectedStatus })
        })
        if (res.ok) {
          if (onStatusChange) {
            onStatusChange(task._id, selectedStatus)
          }
        }
      }
      
      // Update progress if changed
      if (progress !== (task.progress || 0)) {
        console.log('[TaskDetailModal] Updating progress from', task.progress || 0, 'to', progress)
        const res = await fetch(`/api/organization/tasks/${task._id}/progress`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ progress })
        })
        if (res.ok) {
          if (onProgressChange) {
            onProgressChange(task._id, progress)
          }
        }
      }
      
      // Close modal after saving
      setTimeout(() => onClose(), 300)
    } catch (e) {
      console.error('Failed to save changes', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 transform transition-all duration-200 scale-100" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Task Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl" aria-label="Close">&times;</button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{task.title}</h4>
            <div className="mb-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">Project: </span>
              <a href={`/app/projects/${task.project?._id || task.project?.id || task.project}`} className="text-blue-600 dark:text-blue-400 hover:underline">{task.project?.title || task.project?.name || 'View Project'}</a>
            </div>
          </div>

          <div className="mb-6">
            <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h5>
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{task.description || 'No description provided.'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <h6 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Status</h6>
              <div className="flex gap-2 flex-wrap">
                {['todo', 'in-progress', 'review', 'completed'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`px-3 py-2 rounded text-sm font-medium transition ${
                      selectedStatus === status
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h6 className="text-sm font-medium text-gray-500 dark:text-gray-400">Priority</h6>
              <p className="text-gray-900 dark:text-white capitalize">{task.priority || 'Not set'}</p>
            </div>
            <div>
              <h6 className="text-sm font-medium text-gray-500 dark:text-gray-400">Due Date</h6>
              <p className="text-gray-900 dark:text-white">{task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No due date'}</p>
            </div>
            <div>
              <h6 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Progress: {progress}%</h6>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-300 min-w-fit">{progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex gap-2">
                  {[0, 25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() => setProgress(p)}
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {task.assignedTo && task.assignedTo.length > 0 && (
            <div className="mb-6">
              <h6 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Assigned To</h6>
              <div className="flex flex-wrap gap-2">
                {task.assignedTo.map((user: any) => (
                  <div key={user._id || user} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 px-3 py-1 rounded-full">
                    {user.avatar ? (
                      <img src={user.avatar} alt={(user.firstName || user.email) as string} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs font-semibold">{(user.firstName || user.lastName) ? `${(user.firstName||'').charAt(0)}${(user.lastName||'').charAt(0)}` : (user.email||'').charAt(0).toUpperCase()}</div>
                    )}
                    <span className="text-sm text-gray-800 dark:text-gray-200">{user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user.name || user.email || 'Unknown')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between gap-3 pt-4 border-t dark:border-gray-700">
            <button
              onClick={() => {
                if (onRemoveTask && window.confirm('Are you sure you want to remove this task?')) {
                  onRemoveTask(task._id)
                }
              }}
              className="px-4 py-2 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              title="Remove this task"
            >
              Remove
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
