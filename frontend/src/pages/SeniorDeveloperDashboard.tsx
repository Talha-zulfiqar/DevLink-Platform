import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import LlamaChatbot from '../components/AI/LlamaChatbot'
// InvitationInbox removed; organization notifications are surfaced in the header OrganizationHub

export default function SeniorDeveloperDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // simple UI: show Post a Project card/button for mentors
  return (
    <div className="py-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Senior Developer Dashboard</h1>
          <p className="text-sm text-gray-600">Quick actions for Senior Developers.</p>
        </header>

        {/* InvitationInbox moved to header Organization Hub for individual users */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border">
            <h2 className="text-lg font-semibold mb-2">Post a Project</h2>
            <p className="text-sm text-gray-600 mb-4">Share a real-world project and invite applicants.</p>
            <button
              onClick={() => navigate('/app/projects/new')}
              className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
            >
              Post a Project
            </button>
          </div>

          <div className="rounded-2xl p-6 bg-white dark:bg-gray-800 border">
            <h2 className="text-lg font-semibold mb-2">My Projects</h2>
            <p className="text-sm text-gray-600 mb-4">See projects you've posted and manage applicants (coming soon).</p>
            <button onClick={() => navigate('/app/projects')} className="px-4 py-2 rounded-md bg-transparent border border-gray-200 text-gray-700 hover:bg-gray-100">Browse Projects</button>
          </div>
        </div>
      </div>
      <LlamaChatbot />
    </div>
  )
}
