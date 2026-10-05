import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell, Home, Receipt, Snowflake, User, Wallet, LogOut } from 'lucide-react'
import { useStore } from '../core/store'
import { Toaster } from '../ui'
import './layout.css'

const TABS = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/storage', label: 'My Storage', icon: Snowflake },
  { to: '/app/transactions', label: 'Activity', icon: Receipt },
  { to: '/app/payments', label: 'Payments', icon: Wallet },
  { to: '/app/profile', label: 'Profile', icon: User },
]

/** Mobile-first grower shell. On desktop it renders as a centred phone-width column. */
export function GrowerLayout() {
  const session = useStore((s) => s.session)!
  const logout = useStore((s) => s.logout)
  const unread = useStore((s) => s.notifications.filter((n) => n.audience === 'GROWER' && n.growerId === session.growerId && !n.read).length)
  const nav = useNavigate()
  return (
    <div className="m-stage">
      <div className="m-app">
        <header className="m-top">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Kashmir Fresh CA Storage</div>
            <b style={{ fontSize: 16 }}>{session.userName}</b>
          </div>
          <div className="row" style={{ gap: 2 }}>
            <button className="icon-btn" aria-label="Notifications" onClick={() => nav('/app/transactions?tab=notifications')}>
              <Bell />{unread > 0 && <span className="badge-dot">{unread}</span>}
            </button>
            <button className="icon-btn" aria-label="Sign out" onClick={() => { logout(); nav('/login') }}><LogOut /></button>
          </div>
        </header>
        <main className="m-body"><Outlet /></main>
        <nav className="m-nav">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}><t.icon />{t.label}</NavLink>
          ))}
        </nav>
      </div>
      <Toaster />
    </div>
  )
}
