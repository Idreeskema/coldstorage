import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useStore } from '../../core/store'
import { fmtDate, num } from '../../core/format'
import { Avatar, Button, QrCode, StatusPill } from '../../ui'
import { useMe } from './shared'

export default function GrowerProfilePage() {
  const nav = useNavigate()
  const logout = useStore((s) => s.logout)
  const { grower } = useMe()

  if (!grower) return <div className="m-list-item muted">Profile not found.</div>

  const rows: [string, string][] = [
    ['Mobile', grower.phone],
    ['Father’s name', grower.fatherName ?? '—'],
    ['Village', grower.village],
    ['District', grower.district],
    ['Address', grower.address ?? '—'],
    ['Orchard', grower.orchard ?? '—'],
    ['Expected production', grower.expectedProduction ? `${num(grower.expectedProduction)} boxes` : '—'],
    ['Expected storage', grower.expectedStorage ? `${num(grower.expectedStorage)} boxes` : '—'],
    ['Member since', fmtDate(grower.createdAt)],
  ]

  return (
    <>
      <div className="ga-card">
        <div className="ga-profile-head">
          <Avatar name={grower.name} lg />
          <div className="grow">
            <b style={{ fontSize: 17 }}>{grower.name}</b>
            <div className="muted mono">{grower.code}</div>
            <div style={{ marginTop: 6 }}><StatusPill status={grower.status} /></div>
          </div>
        </div>
      </div>

      <div className="ga-card">
        <dl className="ga-kv">
          {rows.map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}
        </dl>
      </div>

      <div className="ga-card ga-profile-qr">
        <QrCode value={grower.code} size={140} />
        <div><b>{grower.code}</b><div className="muted" style={{ fontSize: 12.5 }}>Show this QR at the store gate</div></div>
      </div>

      <Button size="lg" block icon={<LogOut />} onClick={() => { logout(); nav('/login') }}>Sign out</Button>
    </>
  )
}
