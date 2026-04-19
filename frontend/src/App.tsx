 
import React from 'react'
import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import PricingPage from './pages/PricingPage'
import AboutPage from './pages/AboutPage'
import BlogPage from './pages/BlogPage'
import CareersPage from './pages/CareersPage'
import PrivacyPage from './pages/PrivacyPage'
import Home from './pages/Home'
import TestSocket from './pages/TestSocket'
import MonacoTest from './pages/MonacoTest'
import LiveCodingRoomPage from './pages/LiveCodingRoomPage'
import TestVideoPIP from './pages/TestVideoPIP'
import Dashboard from './pages/Dashboard'
import Messages from './pages/Messages'
import ProjectListingPage from './pages/projects/ProjectListingPage'
import ProjectDetailPage from './pages/projects/ProjectDetailPage'
import CreateProjectPage from './pages/projects/CreateProjectPage'
import Feed from './pages/Feed'
import Mentors from './pages/Mentors'
import Sessions from './pages/Sessions'
import SessionConfirmation from './pages/SessionConfirmation'
import BecomeMentor from './pages/BecomeMentor'
import RegisterOrganization from './pages/RegisterOrganization'
import OrganizationDashboard from './pages/OrganizationDashboard'
import CheckoutPage from './pages/CheckoutPage'
import PaymentSuccess from './pages/PaymentSuccess'
import Settings from './pages/Settings'
import NotificationsCenter from './pages/NotificationsCenter'
import ProfilePage from './components/Profile/ProfilePage'
import VideoCall from './components/Video/VideoCall'
import VideoCallWithPIPPage from './pages/VideoCallWithPIPPage'
import { Navigate } from 'react-router-dom'
import { MainLayout } from './components/Layout'
import { AuthProvider } from './contexts/AuthContext'
import Login from './components/Auth/Login'
import Signup from './components/Auth/Signup'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import ForgotPassword from './components/Auth/ForgotPassword'
import ResetPassword from './components/Auth/ResetPassword'
import AdminRoutes from './pages/AdminDashboard/adminRoutes'
import { ToastProvider } from './components/UX/ToastProvider'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="/app/*" element={
            <MainLayout>
              <Routes>
                <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="mentors" element={<ProtectedRoute><Mentors /></ProtectedRoute>} />
                <Route path="become-mentor" element={<ProtectedRoute><BecomeMentor /></ProtectedRoute>} />
                <Route path="register-organization" element={<ProtectedRoute><RegisterOrganization /></ProtectedRoute>} />
                <Route path="organization-dashboard" element={<ProtectedRoute><OrganizationDashboard /></ProtectedRoute>} />
                <Route path="sessions/confirmation" element={<ProtectedRoute><SessionConfirmation /></ProtectedRoute>} />
                <Route path="sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
                <Route path="test-socket" element={<TestSocket />} />
                {import.meta.env && import.meta.env.DEV ? (
                  <Route path="/test-video-pip" element={<TestVideoPIP />} />
                ) : null}
                <Route path="messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
                <Route path="feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
                <Route path="projects" element={<ProjectListingPage />} />
                <Route path="projects/new" element={<ProtectedRoute><CreateProjectPage /></ProtectedRoute>} />
                <Route path="projects/:id" element={<ProjectDetailPage />} />
                <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="notifications" element={<ProtectedRoute><NotificationsCenter /></ProtectedRoute>} />
                <Route path="profile/:userId?" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="video-legacy/:bookingId" element={<ProtectedRoute><VideoCall /></ProtectedRoute>} />
                <Route path="video/:bookingId" element={<ProtectedRoute><VideoCallWithPIPPage /></ProtectedRoute>} />
                <Route path="test-live-coding" element={
                  <ProtectedRoute>
                    <React.Suspense fallback={<div className="p-6">Loading live coding...</div>}>
                      <LiveCodingRoomPage />
                    </React.Suspense>
                  </ProtectedRoute>
                } />
                <Route path="live-coding/:bookingId?" element={
                  <ProtectedRoute>
                    <React.Suspense fallback={<div className="p-6">Loading live coding...</div>}>
                      <LiveCodingRoomPage />
                    </React.Suspense>
                  </ProtectedRoute>
                } />
                <Route path="checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                <Route path="payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
              </Routes>
            </MainLayout>
          } />
          <Route path="/admin/*" element={<AdminRoutes />} />
          <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
