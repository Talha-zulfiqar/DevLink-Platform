import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { SunIcon, MoonIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext'
import { initSocket } from '../../utils/socket'
import OrganizationHub from '../Organization/OrganizationHub'
import NotificationBell from '../UX/NotificationBell'
import ChatBox from '../AI/ChatBox'

export default function Header({ mobileOpen, onMobileToggle }: { mobileOpen?: boolean; onMobileToggle?: () => void }) {
  const { user } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'light' || stored === 'dark') return stored
    } catch (e) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const profileRef = useRef<HTMLDivElement | null>(null);
  const [totalUnread, setTotalUnread] = useState<number>(0);
  // Map of bookingId -> unread count for current user. Using Map makes updates easy.
  const [bookingUnread, setBookingUnread] = useState<Map<string, number>>(() => new Map());

  useEffect(() => {
    // fetch booking summaries to compute unread total
    // declare handlers in outer scope so cleanup can access them
    let s: any = null;
    let convHandler: ((payload: any) => void) | null = null;
    let onLocal: ((ev: Event) => void) | null = null;

    (async () => {
      try {
        const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';
        const token = localStorage.getItem('devlink_token') || undefined;
        if (!token) {
          // Not authenticated — clear any unread state and skip protected call
          setBookingUnread(new Map())
          setTotalUnread(0)
          return
        }
        const headers: Record<string,string> = {};
        headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/bookings/my`, { headers });
        if (!res.ok) return;
        const j = await res.json();
        const bookings = (j && j.data && Array.isArray(j.data.results)) ? j.data.results : (Array.isArray(j.bookings) ? j.bookings : []);
        const me = localStorage.getItem('devlink_user_id') || undefined;
        const getUnread = (map: any, id?: string) => {
          if (!map || !id) return 0;
          try { return Number(typeof map.get === 'function' ? (map.get(id) || 0) : (map[id] || 0)) || 0 } catch (e) { return 0 }
        }
        // populate bookingUnread map for quick updates
        const bm = new Map<string, number>();
        for (const b of bookings) {
          try {
            const u = getUnread(b.unreadCount, me);
            bm.set(b.id || b._id || String(b.bookingId || ''), u || 0);
          } catch (e) {}
        }
        setBookingUnread(bm);
        // compute total
        let sum = 0;
        for (const v of bm.values()) sum += v;
        setTotalUnread(sum);
        // init socket to receive conversation-updated events
        try {
          s = initSocket(token);
          convHandler = (payload: any) => {
            try {
              // payload expected: { bookingId, lastMessageAt, unreadCount }
              if (!payload || !payload.bookingId) return;
              const meId = localStorage.getItem('devlink_user_id') || undefined;
              // determine unread for current user from payload.unreadCount if present
              let newCount = 0;
              try {
                if (payload.unreadCount && meId) {
                  const uc = payload.unreadCount;
                  newCount = Number(typeof uc.get === 'function' ? (uc.get(meId) || 0) : (uc[meId] || 0)) || 0;
                }
              } catch (e) { newCount = 0 }
              // update bookingUnread map and total
              setBookingUnread((prev) => {
                const nm = new Map(prev);
                nm.set(payload.bookingId, newCount);
                // update totalUnread as side-effect
                let ssum = 0;
                for (const v of nm.values()) ssum += v;
                setTotalUnread(ssum);
                return nm;
              });
            } catch (e) {}
          };
          s.on('conversation-updated', convHandler);

          // local UI events can trigger immediate updates (e.g., optimistic reads)
          onLocal = (ev: Event) => {
            try {
              const detail = (ev as CustomEvent)?.detail;
              if (!detail) return;
              const meId = localStorage.getItem('devlink_user_id') || undefined;
              // If detail.unreadCount contains an entry for me, use it; otherwise, if bookingId present assume 0
              const bid = detail.bookingId;
              let newCount = 0;
              try {
                if (detail.unreadCount && meId) {
                  const uc = detail.unreadCount;
                  newCount = Number(typeof uc.get === 'function' ? (uc.get(meId) || 0) : (uc[meId] || 0)) || 0;
                } else if (bid) {
                  newCount = 0;
                }
              } catch (e) { newCount = 0 }
              if (!bid) return;
              setBookingUnread((prev) => {
                const nm = new Map(prev);
                nm.set(bid, newCount);
                let ssum = 0; for (const v of nm.values()) ssum += v;
                setTotalUnread(ssum);
                return nm;
              });
            } catch (e) {}
          };
          window.addEventListener('local-conversation-updated', onLocal as EventListener);
        } catch (e) {}
      } catch (e) {}
    })();
    return () => {
      try {
        if (s && convHandler) s.off && s.off('conversation-updated', convHandler);
      } catch (e) {}
      try {
        if (onLocal) window.removeEventListener('local-conversation-updated', onLocal as EventListener);
      } catch (e) {}
    };
  }, []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    try {
      if (theme === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', theme)
    } catch (e) {}
  }, [theme])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled ? 'backdrop-blur-md shadow-2xl' : ''}`}
      style={{
        background: scrolled 
          ? 'rgba(0, 102, 255, 0.95) backdrop-filter: blur(12px)' 
          : 'linear-gradient(135deg, #0066FF 0%, #8B5CF6 100%)',
        boxShadow: scrolled ? '0 8px 32px rgba(11,24,55,0.15)' : 'none',
      }}
    >
      <div
        className="h-16 flex items-center justify-between max-w-7xl mx-auto"
        style={{ padding: '0 24px', height: 64 }}
      >
        <div className="flex items-center gap-6">
          <Link to={user ? "/app/dashboard" : "/"} className="flex items-center gap-3 no-underline group">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-2xl transition-all duration-300 group-hover:scale-105"
              style={{
                background: 'linear-gradient(135deg,#0066FF 0%,#8B5CF6 100%)',
                boxShadow: '0 8px 24px rgba(11,24,55,0.15)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12h18" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 7h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
                <path d="M7 17h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white group-hover:text-blue-100 transition-colors">DevLink</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {/* Display-only terminology mapping: "Mentor" -> "Senior Developer", "Junior" -> "Junior Developer" */}
            <TopNavItem to="/app/mentors">Senior Developers</TopNavItem>
            <TopNavItem to="/app/become-mentor">Become a Senior Developer</TopNavItem>
            <TopNavItem to="/app/projects">Browse Projects</TopNavItem>
            {user && (user as any).role === 'mentor' && (
              <TopNavItem to="/app/projects/new">Post Project</TopNavItem>
            )}
            {/* Organization dashboard link — visible only to users whose account is an organization */}
            {(String((user && (user as any).userType) || '').toLowerCase() === 'organization') && (
              <TopNavItem to="/app/organization-dashboard">Organization Dashboard</TopNavItem>
            )}
            <TopNavItem to="/app/sessions">Sessions</TopNavItem>
            <TopNavItem to="/app/messages">Messages</TopNavItem>
            <TopNavItem to="/app/feed">Feed</TopNavItem>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* Removed the global "New Session" top-nav item per UX update: sessions are booked from mentor profiles now */}
          <div className="hidden md:flex items-center gap-4" />

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              type="button"
              aria-label="Toggle theme"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-110"
            >
              {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>

            {/* Notification Bell */}
            {user && <NotificationBell />}

            {/* Organization Hub: show for individual users only */}
            {user && String(((user as any).userType || '')).toLowerCase() === 'individual' && (
              <OrganizationHub />
            )}
          </div>

          {/* profile */}
          <div className="relative" ref={profileRef}>
            {/* use auth hook to show real user info */}
            <AuthProfileButton
              open={profileOpen}
              onToggle={() => setProfileOpen((s) => !s)}
              onClose={() => setProfileOpen(false)}
            />
          </div>

          {/* mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => onMobileToggle?.()}
              type="button"
              aria-label="Toggle menu"
              className="p-3 md:p-2 rounded-md bg-white hover:scale-105 transition-transform"
              style={{ transition: 'all 0.2s ease' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M3 12h18" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M3 18h18" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>

            {/* Mobile sidebar is rendered by Sidebar component in MainLayout; Header just toggles it */}
          </div>
        </div>
      </div>
      <ChatBox />
    </header>
  );
}

function NavLinkItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="relative px-3 py-2 text-sm font-medium text-white hover:bg-white/8 rounded-md transition-all duration-200"
      style={{ transition: 'all 0.2s ease' }}
    >
      {children}
      <span className="absolute left-0 -bottom-0.5 w-0 h-0.5 bg-transparent transition-all"></span>
    </Link>
  );
}

function TopNavItem({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation()
  const path = location.pathname
  const isActive = path === to || path.startsWith(to + '/')
  const base = 'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 hover:scale-105'
  const activeCls = 'bg-white/20 text-white shadow-lg'
  const inactiveCls = 'text-white/90 hover:bg-white/10 hover:text-white'
  console.log('TopNavItem - to:', to, 'path:', path, 'isActive:', isActive)
  return (
    <NavLink to={to} className={`${base} ${isActive ? activeCls : inactiveCls}`}>
      {children}
    </NavLink>
  )
}

function AuthProfileButton({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const { user, loading, signOut } = useAuth()
  // Derive display name and avatar from various possible user/profile shapes
  const u = user as any
  const firstName = u?.firstName || u?.user_metadata?.firstName || null
  const lastName = u?.lastName || u?.user_metadata?.lastName || null
  const name: string | undefined = [firstName, lastName].filter(Boolean).join(' ') || u?.user_metadata?.full_name || u?.name || undefined
  const email: string | undefined = u?.email
  const avatar: string | undefined = u?.avatar || u?.profile?.avatar || u?.user_metadata?.avatar || undefined
  const initial = name ? String(name).charAt(0).toUpperCase() : (email ? String(email).charAt(0).toUpperCase() : 'U')

  const handleLogout = async () => {
    await signOut()
    onClose()
  }

  return (
    <>
      <button
        onClick={onToggle}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-2 md:p-1 hover:scale-105 transition-transform"
      >
        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-blue-500 text-white font-medium border border-white/20 shadow-sm">
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/60 rounded-full animate-spin" />
          ) : avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={name || 'avatar'} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm">{initial}</span>
          )}
        </div>
        <div className="hidden md:flex flex-col truncate">
          <span className="text-sm text-white/90">{loading ? 'Loading...' : (name || 'User')}</span>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-60" style={{ zIndex: 60 }}>
          <div className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg py-2 shadow-lg border border-gray-200 dark:border-gray-700">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="text-sm text-gray-700 dark:text-gray-300">Signed in as</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white truncate">{name || email || 'User'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{email}</div>
            </div>
            <Link to="/app/profile/me" className="block px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Profile</Link>
            <Link to="/app/settings" className="block px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700">Settings</Link>
            <button type="button" onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">Logout</button>
          </div>
        </div>
      )}
    </>
  )
}
