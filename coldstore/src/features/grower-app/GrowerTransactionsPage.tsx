import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useStore } from '../../core/store'
import { fmtDate, fmtTime, relativeDay } from '../../core/format'
import { DocPreview, EmptyState, Tabs, Timeline, type DocSpec } from '../../ui'
import { boxIssueDoc, movementLine, receiptDoc, useMe } from './shared'

type Tab = 'activity' | 'notifications' | 'receipts'

export default function GrowerTransactionsPage() {
  const [sp, setSp] = useSearchParams()
  const { gid, grower, dv, allocations } = useMe()
  const activities = useStore((s) => s.activities)
  const notifications = useStore((s) => s.notifications)
  const receipts = useStore((s) => s.receipts)
  const boxIssues = useStore((s) => s.boxIssues)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAll = useStore((s) => s.markAllNotificationsRead)
  const [doc, setDoc] = useState<DocSpec | null>(null)

  const raw = sp.get('tab')
  const tab: Tab = raw === 'notifications' || raw === 'receipts' ? raw : 'activity'
  const setTab = (t: Tab) => setSp(t === 'activity' ? {} : { tab: t }, { replace: true })

  /** pickup / driver / destination for box-issue and receipt activities */
  const detail = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of boxIssues) m.set(b.id, movementLine([b.fromLocation && `From ${b.fromLocation}`, b.driver && `Driver ${b.driver}`, b.vehicle]))
    for (const r of receipts) m.set(r.lotId, movementLine([r.sourceLocation && `From ${r.sourceLocation}`, r.destination && `To ${r.destination}`, r.driver && `Driver ${r.driver}`, r.vehicle]))
    return m
  }, [boxIssues, receipts])
  const descOf = (a: { entityId: string; entityType: string; description: string }) => {
    const x = a.entityType === 'boxIssue' || a.entityType === 'lot' ? detail.get(a.entityId) : undefined
    return x ? ` - ` : a.description
  }

  const mine = useMemo(() => activities.filter((a) => a.growerId === gid), [activities, gid])
  const groups = useMemo(() => {
    const m = new Map<string, typeof mine>()
    for (const a of mine) {
      const k = relativeDay(a.timestamp)
      m.set(k, [...(m.get(k) ?? []), a])
    }
    return [...m.entries()]
  }, [mine])
  const myNotes = notifications.filter((n) => n.audience === 'GROWER' && n.growerId === gid)
  const unread = myNotes.filter((n) => !n.read).length

  const docs = useMemo(() => {
    const name = grower?.name ?? ''
    const a = receipts.filter((r) => r.growerId === gid).map((r) => ({
      id: r.id, date: r.receivedDate, title: 'Apple receipt', code: r.code, sub: `${r.boxes.toLocaleString('en-IN')} crates · ${r.variety}`,
      doc: () => receiptDoc(r, dv.lotById.get(r.lotId), name),
    }))
    const b = boxIssues.filter((x) => x.growerId === gid).map((x) => ({
      id: x.id, date: x.date, title: 'Crate issue receipt', code: x.code, sub: `${x.quantity.toLocaleString('en-IN')} ${x.boxType.toLowerCase()} crates`,
      doc: () => boxIssueDoc(x, allocations.find((al) => al.id === x.allocationId), name),
    }))
    return [...a, ...b].sort((p, q) => q.date.localeCompare(p.date))
  }, [receipts, boxIssues, gid, grower, dv, allocations])

  return (
    <>
      <div className="ga-head"><h1>Activity</h1></div>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: 'activity', label: 'Timeline' },
        { id: 'notifications', label: unread ? `Alerts (${unread})` : 'Alerts' },
        { id: 'receipts', label: 'Receipts' },
      ]} />

      {tab === 'activity' && (groups.length === 0 ? (
        <EmptyState title="No activity yet" text="Your requests, receipts and payments will appear here." />
      ) : (
        groups.map(([day, items]) => (
          <div key={day}>
            <div className="ga-day">{day}</div>
            <div className="ga-card">
              <Timeline items={items.map((a) => ({ id: a.id, title: a.title, desc: descOf(a), tone: a.status, time: fmtTime(a.timestamp) }))} />
            </div>
          </div>
        ))
      ))}

      {tab === 'notifications' && (myNotes.length === 0 ? (
        <EmptyState title="No notifications" text="Updates from the store will show up here." />
      ) : (
        <>
          {unread > 0 && (
            <button className="btn ghost sm" style={{ alignSelf: 'flex-end' }} onClick={() => markAll('GROWER', gid)}>Mark all as read</button>
          )}
          <div className="ga-list">
            {myNotes.map((n) => (
              <button key={n.id} className={`m-list-item ga-item ${n.read ? '' : 'ga-unread'}`} onClick={() => markRead(n.id)}>
                <span className={`ga-dot ${n.read ? 'off' : ''}`} />
                <div className="grow"><b>{n.title}</b><span>{n.body}</span></div>
                <span className="muted" style={{ fontSize: 11.5, flex: 'none' }}>{relativeDay(n.timestamp)}</span>
              </button>
            ))}
          </div>
        </>
      ))}

      {tab === 'receipts' && (docs.length === 0 ? (
        <EmptyState title="No receipts yet" text="Crate issue and apple receipts are listed here." />
      ) : (
        <div className="ga-list">
          {docs.map((d) => (
            <button key={d.id} className="m-list-item ga-item" onClick={() => setDoc(d.doc())}>
              <FileText size={20} color="var(--primary)" style={{ flex: 'none' }} />
              <div className="grow"><b>{d.title}</b><span>{d.code} · {d.sub}</span></div>
              <span className="muted" style={{ fontSize: 12, flex: 'none' }}>{fmtDate(d.date)}</span>
            </button>
          ))}
        </div>
      ))}

      <DocPreview open={!!doc} doc={doc} onClose={() => setDoc(null)} />
    </>
  )
}
