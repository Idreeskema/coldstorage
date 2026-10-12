import { useState } from 'react'
import { useStore } from '../../core/store'
import { Alert, EmptyState, Modal, QrCode, StatusPill } from '../../ui'
import { fmtDate, inr, num, rateLabel } from '../../core/format'
import type { LotView } from '../../core/calc'
import { stayLabel, useMe } from './shared'

export default function GrowerStoragePage() {
  const { allocations, lots, dv } = useMe()
  const [sel, setSel] = useState<LotView | null>(null)
  const receipts = useStore((s) => s.receipts)
  const selReceipt = sel ? receipts.find((r) => r.id === sel.receiptId) : undefined

  const sortedLots = [...lots].sort((a, b) => Number(b.current > 0) - Number(a.current > 0) || b.storageStartDate.localeCompare(a.storageStartDate))

  return (
    <>
      <div className="ga-head"><h1>My storage</h1></div>

      <div className="m-section">Allocations</div>
      {allocations.length === 0 ? (
        <EmptyState title="No allocations yet" text="Request storage from the home screen. Boxes are allocated once the store approves." />
      ) : (
        allocations.map((a) => {
          const st = dv.allocStats.get(a.id)
          if (!st) return null
          const stored = lots.filter((l) => l.allocationId === a.id).reduce((s, l) => s + l.current, 0)
          const dispatched = lots.filter((l) => l.allocationId === a.id).reduce((s, l) => s + l.dispatched, 0)
          const steps = [
            { label: 'Allocated', n: st.allocated, done: st.allocated > 0 },
            { label: 'Crates issued', n: st.issued, done: st.issued > 0 },
            { label: 'Crates received', n: st.received, done: st.received > 0 },
            { label: 'In store', n: stored, done: stored > 0 },
            { label: 'Dispatched', n: dispatched, done: dispatched > 0 },
          ]
          return (
            <div className="ga-card" key={a.id}>
              <div className="ga-card-head">
                <div><b>{a.code}</b><div className="muted" style={{ fontSize: 12.5 }}>{a.durationMonths} month plan &middot; {num(a.boxes)} crates &middot; {rateLabel(a.rateType, a.rate)}</div></div>
                <StatusPill status={st.status.toUpperCase()} label={st.status} />
              </div>
              <div className="ga-journey">
                {steps.map((s) => (
                  <div key={s.label} className={`ga-step ${s.done ? 'done' : ''}`}><i /><b>{num(s.n)}</b><span>{s.label}</span></div>
                ))}
              </div>
              {st.awaitingReturn > 0 && (
                <Alert kind="warning"><b>{num(st.awaitingReturn)} crates still with you</b> — fill them with apples and bring them to the store.</Alert>
              )}
              {st.remainingToIssue > 0 && (
                <div className="muted" style={{ fontSize: 12.5 }}>{num(st.remainingToIssue)} crates still to be issued by the store.</div>
              )}
            </div>
          )
        })
      )}

      <div className="m-section">Lots</div>
      {sortedLots.length === 0 ? (
        <div className="m-list-item muted">No lots yet. A lot is created when your apples are received.</div>
      ) : (
        <div className="ga-list">
          {sortedLots.map((l) => (
            <button key={l.id} className="m-list-item ga-item" onClick={() => setSel(l)}>
              <div className="grow">
                <b>{l.code} · {l.variety}</b>
                <span>{l.chamberId || 'Unplaced'} · {l.rackLabel} · {stayLabel(l)}</span>
                <div style={{ marginTop: 4 }}><StatusPill status={l.status} /></div>
              </div>
              <div className="end"><b>{num(l.current)}</b><span className="muted" style={{ fontSize: 12 }}>of {num(l.boxesReceived)}</span><br /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{inr(l.accrued)}</span></div>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Lot ${sel.code}` : ''}>
        {sel && (
          <div className="ga-m-body">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <StatusPill status={sel.status} />
              <QrCode value={sel.code} size={96} />
            </div>
            <dl className="ga-kv">
              <dt>Variety / grade</dt><dd>{sel.variety} · {sel.grade}</dd>
              <dt>Crates in store</dt><dd>{num(sel.current)} of {num(sel.boxesReceived)}</dd>
              <dt>Dispatched</dt><dd>{num(sel.dispatched)}</dd>
              <dt>Chamber / rack</dt><dd>{sel.chamberId} · {sel.rackLabel}</dd>
              <dt>Stored since</dt><dd>{fmtDate(sel.storageStartDate)}</dd>
              <dt>Days stored</dt><dd>{num(sel.days)}</dd>
              <dt>Expected release</dt><dd>{fmtDate(sel.expectedReleaseDate)}</dd>
              {selReceipt?.sourceLocation && <><dt>Picked up from</dt><dd>{selReceipt.sourceLocation}</dd></>}
              {selReceipt?.destination && <><dt>Received at</dt><dd>{selReceipt.destination}</dd></>}
              {selReceipt?.driver && <><dt>Driver</dt><dd>{selReceipt.driver}</dd></>}
              <dt>Rate</dt><dd>{rateLabel(sel.rateType, sel.rate)}{sel.rateType === 'PER_CRATE' ? ' (flat)' : ''}</dd>
              <dt>Charge so far</dt><dd>{inr(sel.accrued)}</dd>
              {sel.pendingDispatch > 0 && (<><dt>Dispatch pending</dt><dd>{num(sel.pendingDispatch)} crates</dd></>)}
            </dl>
          </div>
        )}
      </Modal>
    </>
  )
}
