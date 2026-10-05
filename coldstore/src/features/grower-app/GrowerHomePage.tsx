import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, FilePlus2, FileText, Truck, Wallet } from 'lucide-react'
import { useStore } from '../../core/store'
import { fmtDateShort, fmtTime, greeting, inr, num, relativeDay } from '../../core/format'
import { Alert, DocPreview, Progress, Timeline, toast, type DocSpec } from '../../ui'
import { receiptDoc, stayLabel, useMe } from './shared'

export default function GrowerHomePage() {
  const nav = useNavigate()
  const { gid, grower, stats, lots, dv, active } = useMe()
  const receipts = useStore((s) => s.receipts)
  const activities = useStore((s) => s.activities)
  const [doc, setDoc] = useState<DocSpec | null>(null)

  const liveLots = lots.filter((l) => l.current > 0)
  const progress = stats.allocated ? (stats.received / stats.allocated) * 100 : 0
  const recent = activities.filter((a) => a.growerId === gid).slice(0, 5)

  const viewReceipt = () => {
    const r = receipts.filter((x) => x.growerId === gid).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))[0]
    if (!r) return toast('No receipts yet. Receipts appear once your apples are received.', 'error')
    setDoc(receiptDoc(r, dv.lotById.get(r.lotId), grower?.name))
  }

  return (
    <>
      <div>
        <div className="muted" style={{ fontSize: 13 }}>{greeting()}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{grower?.name ?? 'Grower'}</div>
      </div>

      {grower?.status === 'PENDING' && (
        <div className="ga-banner">
          <Clock />
          <div><b>Awaiting approval</b><br />The store is reviewing your registration. You can request storage once approved.</div>
        </div>
      )}
      {grower?.status === 'INACTIVE' && <Alert kind="warning">Your account is inactive. Please contact the store.</Alert>}

      <section className="m-hero ga-hero">
        <div className="ga-hero-head">
          <span className="lbl">My storage</span>
          <span className="lbl">{num(stats.allocated)} boxes allocated</span>
        </div>
        <div className="big">{num(stats.stored)} <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.8 }}>boxes in store</span></div>
        <Progress value={progress} />
        <div className="ga-hero-row">
          <div><span className="lbl">Received</span><b>{num(stats.received)}</b></div>
          <div><span className="lbl">Dispatched</span><b>{num(stats.dispatched)}</b></div>
          <div><span className="lbl">To bring</span><b>{num(Math.max(0, stats.allocated - stats.received))}</b></div>
        </div>
      </section>

      <div className="ga-money">
        <div><small>Charges</small><b>{inr(stats.charges)}</b></div>
        <div><small>Paid</small><b>{inr(stats.paid)}</b></div>
        <div className={stats.due > 1 ? 'due' : 'clear'}><small>Due</small><b>{inr(Math.max(0, stats.due))}</b></div>
      </div>

      <div className="m-section">Quick actions</div>
      <div className="ga-actions">
        <button className="m-action" disabled={!active} onClick={() => nav('/app/request')}><FilePlus2 />Request Storage</button>
        <button className="m-action" disabled={liveLots.length === 0} onClick={() => nav('/app/dispatch')}><Truck />Request Dispatch</button>
        <button className="m-action" onClick={viewReceipt}><FileText />View Receipt</button>
        <button className="m-action" onClick={() => nav('/app/payments')}><Wallet />Make Payment</button>
      </div>

      <div className="m-section">Current lots</div>
      {liveLots.length === 0 ? (
        <div className="m-list-item muted">No apples in storage right now.</div>
      ) : (
        <div className="ga-list">
          {liveLots.map((l) => (
            <button key={l.id} className="m-list-item ga-item" onClick={() => nav('/app/storage')}>
              <div className="grow"><b>{l.code}</b><span>Chamber {l.chamberId} · {stayLabel(l)}</span></div>
              <div className="end"><b>{num(l.current)}</b><span className="muted" style={{ fontSize: 12 }}>boxes</span></div>
            </button>
          ))}
        </div>
      )}

      <div className="m-section">Recent activity</div>
      {recent.length === 0 ? (
        <div className="m-list-item muted">Nothing yet.</div>
      ) : (
        <div className="ga-card">
          <Timeline items={recent.map((a) => ({
            id: a.id, title: a.title, desc: a.description, tone: a.status,
            time: relativeDay(a.timestamp) === 'Today' ? fmtTime(a.timestamp) : fmtDateShort(a.timestamp),
          }))} />
        </div>
      )}

      <DocPreview open={!!doc} doc={doc} onClose={() => setDoc(null)} />
    </>
  )
}
