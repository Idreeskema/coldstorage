import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Apple, Bell, Boxes, ChevronDown, FileBarChart, LayoutDashboard, LogOut, Menu, Package, PackageCheck,
  Settings, Snowflake, Truck, Users, Wallet, BookOpen, ClipboardList, Warehouse, Table2, UserRound, FileSpreadsheet,
} from 'lucide-react'
import { useDerived, useStore } from '../core/store'
import { Avatar, Toaster } from '../ui'
import './layout.css'

interface NavItem { to: string; label: string; icon: typeof Apple; end?: boolean; managerOnly?: boolean; count?: 'requests' | 'dispatch' }
const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/growers', label: 'Growers', icon: Users },
  { to: '/admin/requests', label: 'Storage Requests', icon: ClipboardList, count: 'requests', managerOnly: true },
  { to: '/admin/boxes', label: 'Box Management', icon: Boxes },
  { to: '/admin/receipts', label: 'Apple Receipts', icon: PackageCheck },
  { to: '/admin/inventory', label: 'Storage Inventory', icon: Warehouse },
  { to: '/admin/dispatch', label: 'Dispatch / Outward', icon: Truck, count: 'dispatch' },
  { to: '/admin/payments', label: 'Payments', icon: Wallet, managerOnly: true },
  { to: '/admin/ledger', label: 'Grower Ledger', icon: BookOpen, managerOnly: true },
  { to: '/admin/trade', label: 'Trade Ledger', icon: Table2 },
  { to: '/admin/customers', label: 'Customers', icon: UserRound },
  { to: '/admin/import', label: 'Import / Export', icon: FileSpreadsheet, managerOnly: true },
  { to: '/admin/chambers', label: 'Chambers', icon: Snowflake },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart, managerOnly: true },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/settings', label: 'Settings', icon: Settings, managerOnly: true },
]

export function AdminLayout() {
  const [open, setOpen] = useState(false)
  const session = useStore((s) => s.session)!
  const logout = useStore((s) => s.logout)
  const settings = useStore((s) => s.settings)
  const unread = useStore((s) => s.notifications.filter((n) => n.audience === 'MANAGER' && !n.read).length)
  const d = useDerived()
  const nav = useNavigate()
  const loc = useLocation()
  const items = NAV.filter((n) => session.role === 'MANAGER' || !n.managerOnly)
  const counts = { requests: d.store.pendingRequests, dispatch: d.store.pendingDispatches }

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Apple /></div>
          <div><b>{settings.storeName.split(' ').slice(0, 2).join(' ')}</b><span>CA Storage · {session.role === 'MANAGER' ? 'Manager' : 'Staff'}</span></div>
        </div>
        <nav className="nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setOpen(false)}>
              <n.icon />{n.label}
              {n.count && counts[n.count] > 0 && <span className="count">{counts[n.count]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <Avatar name={session.userName} />
          <div className="who"><b>{session.userName}</b><span>{settings.season}</span></div>
          <button className="icon-btn" title="Sign out" onClick={() => { logout(); nav('/login') }}><LogOut /></button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="content">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Menu /></button>
          <div className="store-select"><Package size={15} />{settings.storeName}<span>· {settings.season}</span><ChevronDown size={14} /></div>
          <div className="grow" />
          <button className="icon-btn" aria-label="Notifications" onClick={() => nav('/admin/notifications')}>
            <Bell />{unread > 0 && <span className="badge-dot">{unread}</span>}
          </button>
        </header>
        <main key={loc.pathname}><Outlet /></main>
      </div>
      <Toaster />
    </div>
  )
}
