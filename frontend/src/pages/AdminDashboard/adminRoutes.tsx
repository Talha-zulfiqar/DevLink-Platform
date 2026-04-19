import React from 'react'
import { Routes, Route } from 'react-router-dom'
import AdminLogin from './AdminLogin'
import DashboardHome from './DashboardHome'
import UsersManagement from './UsersManagement'
import ApprovalsPage from './ApprovalsPage'
import RevenueDashboard from './RevenueDashboard'
import RatingsManagement from './RatingsManagement'
import WithdrawalsManagement from './WithdrawalsManagement'
import { ToastProvider } from '../../components/UX/ToastProvider'
import AdminProtectedRoute from '../../components/Auth/AdminProtectedRoute'

// Simple ErrorBoundary implementation to avoid external dependency
class SimpleErrorBoundary extends React.Component<any, { error: Error | null }> {
  constructor(props: any) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: any) {
    try { console.error('AdminRoutes error:', error, info) } catch (e) {}
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <h2 style={{ color: 'red' }}>Admin Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error && this.state.error.message)}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AdminRoutes() {
  console.log('AdminRoutes rendering')
  return (
    <SimpleErrorBoundary>
      <ToastProvider>
        <Routes>
          {/* Relative paths because AdminRoutes is mounted at /admin/* from App.tsx */}
          <Route path="login" element={<AdminLogin />} />
          <Route path="" element={<AdminProtectedRoute><DashboardHome /></AdminProtectedRoute>} />
          <Route path="users" element={<AdminProtectedRoute><UsersManagement /></AdminProtectedRoute>} />
          <Route path="approvals" element={<AdminProtectedRoute><ApprovalsPage /></AdminProtectedRoute>} />
          <Route path="revenue" element={<AdminProtectedRoute><RevenueDashboard /></AdminProtectedRoute>} />
          <Route path="ratings" element={<AdminProtectedRoute><RatingsManagement /></AdminProtectedRoute>} />
          <Route path="withdrawals" element={<AdminProtectedRoute><WithdrawalsManagement /></AdminProtectedRoute>} />
          {/* Additional admin routes can be added here */}
        </Routes>
      </ToastProvider>
    </SimpleErrorBoundary>
  )
}
