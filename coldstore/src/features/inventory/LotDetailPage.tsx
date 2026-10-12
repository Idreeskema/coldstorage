import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Printer, Truck } from 'lucide-react'
import {
  Alert, Button, Card, DocPreview, EmptyState, Field, Input, Modal, PageHeader, Progress, QrCode, Select,
  StatusPill, TableWrap, Textarea, Timeline, toast, type DocSpec, type TimelineItem,
} from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { estimateCharge } from '../../core/calc'
import { fmtDate, fmtTime, inr, num, rateLabel } from '../../core/format'
import './inventory.css'

export default function LotDetailPage() {
  const { lotId = '' } = useParams()
  const d = useDerived()
  const dispatches = useStore((s) => s.dispatches)
  const receipts = useStore((s) => s.receipts)
  const allocations = useStore((s) => s.allocations)
  const requestDispatch = useStore((s) => s.requestDispatch)
  const assignLotChamber = useStore((s) => s.assignLotChamber)
  const [asgOpen, setAsgOpen] = useState(false)
  const [asgChamber, setAsgChamber] = useState('')
  const [asgRack, setAsgRack] = useState('1')
  const [asgError, setAsgError] = useState('')

  const lot = d.lotById.get(lotId)
  const [reqOpen, setReqOpen] = useState(false)
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [doc, setDoc] = useState<DocSpec | null>(null)
  const [wiDays, setWiDays] = useState<string | null>(null)
  const [wiRate, setWiRate] = useState<string | null>(null)
  const [wiBoxes, setWiBoxes] = useState<string | null>(null)

  const lotDispatches = useMemo(
    () => dispatches.filter((x) => x.lotId === lotId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [dispatches, lotId],
  )

  if (!lot) {
    return (
      <div className="page">
        <PageHeader title="Lot not found" crumbs={[{ label: 'Inventory', to: '/admin/inventory' }, { label: 'Lot' }]} />
        <Card><EmptyState title="This lot does not exist" text="It may have been removed or the link is wrong."
          action={<Link to="/admin/inventory"><Button variant="primary">Back to inventory</Button></Link>} /></Card>
      </div>
    )
  }

  const receipt = receipts.find((r) => r.id === lot.receiptId)
  const alloc = allocations.find((a) => a.id === lot.allocationId)
  const gs = d.growerStats.get(lot.growerId)
  const free = lot.current - lot.pendingDispatch
  const done = lotDispatches.filter((x) => x.status === 'COMPLETED')
  const placed = d.store.chambers.some((c) => c.chamber.id === lot.chamberId)
  const chamberLabel = placed ? `${lot.chamberId} · ${lot.rackLabel}` : 'Unassigned'
  const flat = lot.rateType === 'PER_CRATE'

  const wDays = wiDays ?? String(lot.days), wRate = wiRate ?? String(lot.rate), wBoxes = wiBoxes ?? String(lot.boxesReceived)
  const whatIf = estimateCharge(Number(wBoxes) || 0, Number(wDays) || 0, lot.rateType, Number(wRate) || 0)
  const rateUnit = rateLabel(lot.rateType, 0).replace(/^₹0 \/ /, '')
  const noDays = lot.rateType === 'PER_CRATE' || lot.rateType === 'PER_SEASON'

  const asgStat = d.store.chambers.find((c) => c.chamber.id === asgChamber)
  const submitAssign = () => {
    setAsgError('')
    const rk = Number(asgRack)
    if (asgChamber && (!Number.isInteger(rk) || rk < 1 || (asgStat && rk > asgStat.chamber.racks)))
      return setAsgError(`Starting rack must be between 1 and ${asgStat?.chamber.racks ?? 1}`)
    const res = assignLotChamber(lot.id, asgChamber || undefined, asgChamber ? rk : undefined)
    if (!res.ok) { setAsgError(res.error ?? 'Could not assign'); toast(res.error ?? 'Could not assign', 'error'); return }
    toast(`${lot.code} placed in a chamber`)
    setAsgOpen(false)
  }

  const submitDispatch = () => {
    setError('')
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) return setError('Enter a whole number of boxes')
    if (n > free) return setError(`Only ${num(free)} boxes are available for dispatch from this lot`)
    const res = requestDispatch(lot.growerId, lot.id, n, notes.trim() || undefined)
    if (!res.ok) { setError(res.error ?? 'Could not create request'); toast(res.error ?? 'Could not create request', 'error'); return }
    toast(`Dispatch requested for ${num(n)} boxes`)
    setReqOpen(false); setQty(''); setNotes('')
  }

  const lotDoc = (): DocSpec => ({
    title: 'Lot Storage Receipt',
    code: lot.code,
    date: fmtDate(lot.storageStartDate),
    rows: [
      ['Grower', `${lot.growerName} (${lot.growerCode})`],
      ['Allocation', alloc?.code ?? '—'],
      ['Variety / grade', `${lot.variety} · Grade ${lot.grade}`],
      ['Boxes received', num(lot.boxesReceived)],
      ['Dispatched', num(lot.dispatched)],
      ['Remaining in storage', num(lot.current)],
      ['Chamber / rack', chamberLabel],
      ['Storage start', fmtDate(lot.storageStartDate)],
      ['Expected release', fmtDate(lot.expectedReleaseDate)],
      ['Rate', rateLabel(lot.rateType, lot.rate)],
      ['Accrued charge', inr(lot.accrued)],
    ],
  })

  const events: (TimelineItem & { at: string })[] = []
  events.push({
    id: 'recv', at: `${lot.storageStartDate}T00:00`, tone: 'success', title: `Received ${num(lot.boxesReceived)} boxes`,
    desc: `${receipt?.code ?? ''} · ${lot.variety} Grade ${lot.grade} · ${chamberLabel}`, time: fmtDate(lot.storageStartDate),
  })
  for (const x of lotDispatches) {
    const verb = x.status === 'COMPLETED' ? 'Dispatched' : x.status === 'REJECTED' ? 'Dispatch declined' : 'Dispatch requested'
    events.push({
      id: x.id, at: x.status === 'COMPLETED' && x.completedDate ? `${x.completedDate}T23:59` : x.requestedAt,
      tone: x.status === 'COMPLETED' ? 'success' : x.status === 'REJECTED' ? 'warning' : 'info',
      title: `${verb} · ${num(x.quantity)} boxes`, desc: x.code,
      time: x.status === 'COMPLETED' ? fmtDate(x.completedDate) : `${fmtDate(x.requestedAt.slice(0, 10))} ${fmtTime(x.requestedAt)}`,
    })
  }
  events.push({
    id: 'exp', at: `${lot.expectedReleaseDate}T00:00`, tone: lot.daysToRelease <= 0 ? 'warning' : 'info',
    title: lot.daysToRelease <= 0 ? 'Storage period ended' : 'Expected release',
    desc: lot.daysToRelease > 0 ? `In ${lot.daysToRelease} days` : undefined, time: fmtDate(lot.expectedReleaseDate),
  })
  events.sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="page">
      <PageHeader title="" crumbs={[{ label: 'Inventory', to: '/admin/inventory' }, { label: lot.code }]} />
      <div className="lot-head" style={{ marginTop: -44 }}>
        <div>
          <h1><span className="mono" style={{ fontSize: 'inherit' }}>{lot.code}</span><StatusPill status={lot.status} />{!placed && <StatusPill status="UNASSIGNED" label="Unassigned" tone="amber" />}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            <Link className="link" to={`/admin/growers/${lot.growerId}`}>{lot.growerName}</Link> · {lot.growerCode} · {lot.variety}, Grade {lot.grade}
          </div>
        </div>
        <div className="row wrap">
          <div className="qrbox"><QrCode value={lot.code} size={64} /></div>
          {!placed && lot.current > 0 && <Button onClick={() => { setAsgError(''); setAsgChamber(''); setAsgRack('1'); setAsgOpen(true) }}>Assign chamber</Button>}
          <Button icon={<Printer />} onClick={() => setDoc(lotDoc())}>Print lot receipt</Button>
          <Button variant="primary" icon={<Truck />} disabled={free <= 0} onClick={() => { setError(''); setQty(String(free)); setReqOpen(true) }}>Request dispatch</Button>
        </div>
      </div>

      <div className="grid cols-main">
        <div className="stack">
          <Card title="Lot facts">
            <dl className="kv" style={{ gridTemplateColumns: 'minmax(110px,150px) 1fr' }}>
              <dt>Received on</dt><dd>{fmtDate(lot.storageStartDate)}</dd>
              <dt>Original boxes</dt><dd className="num">{num(lot.boxesReceived)}</dd>
              <dt>Dispatched</dt><dd className="num">{num(lot.dispatched)}</dd>
              <dt>Remaining</dt><dd className="num">{num(lot.current)}{lot.pendingDispatch > 0 && <span className="muted"> ({num(lot.pendingDispatch)} pending dispatch)</span>}</dd>
              <dt>Variety / grade</dt><dd>{lot.variety} · Grade {lot.grade}</dd>
              <dt>Chamber / rack</dt><dd>{chamberLabel}</dd>
              <dt>Storage start</dt><dd>{fmtDate(lot.storageStartDate)} · day {lot.days}</dd>
              <dt>Expected release</dt><dd>{fmtDate(lot.expectedReleaseDate)}{lot.daysToRelease > 0 ? ` (${lot.daysToRelease} days left)` : ' (due)'}</dd>
              <dt>Rate</dt><dd>{rateLabel(lot.rateType, lot.rate)}</dd>
              <dt>Allocation</dt><dd className="mono">{alloc?.code ?? '—'}</dd>
            </dl>
          </Card>

          <Card title="Partial dispatch" sub="Boxes leave in stages; charges stop for dispatched boxes">
            <div className="lot-flow">
              <div><small>Original</small><b>{num(lot.boxesReceived)}</b></div>
              <div className="arrow"><ArrowRight size={18} /></div>
              <div><small>Dispatched</small><b>{num(lot.dispatched)}</b></div>
              <div className="arrow"><ArrowRight size={18} /></div>
              <div><small>Remaining</small><b>{num(lot.current)}</b></div>
            </div>
            <div style={{ margin: '12px 0 4px' }}><Progress value={(lot.dispatched / lot.boxesReceived) * 100} /></div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{Math.round((lot.dispatched / lot.boxesReceived) * 100)}% of the lot has left the store</div>
            {lotDispatches.length === 0 ? (
              <div className="muted" style={{ paddingTop: 8 }}>No dispatches from this lot yet.</div>
            ) : (
              <TableWrap>
                <thead><tr><th>Gate pass</th><th>Date</th><th className="r">Boxes</th><th>Vehicle</th><th>Status</th></tr></thead>
                <tbody>
                  {lotDispatches.map((x) => (
                    <tr key={x.id}>
                      <td className="mono">{x.code}</td>
                      <td>{x.status === 'COMPLETED' ? fmtDate(x.completedDate) : fmtDate(x.requestedAt.slice(0, 10))}</td>
                      <td className="r num">{num(x.quantity)}</td>
                      <td>{x.vehicle || '—'}</td>
                      <td><StatusPill status={x.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
            {done.length > 0 && <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>{done.length} completed dispatch{done.length > 1 ? 'es' : ''}</div>}
          </Card>

          <Card title="Timeline">
            <Timeline items={events} />
          </Card>
        </div>

        <div className="stack">
          <Card title="Charge breakdown" sub="Charges to date for this lot">
            <table className="lot-charge">
              <tbody>
                <tr><td>{flat ? 'Flat crate charge' : 'Base storage charge'}</td><td>{inr(lot.accrued)}</td></tr>
                {flat
                  ? <tr><td className="muted">Basis</td><td>{num(lot.boxesReceived)} crates × ₹{lot.rate} (flat, no days)</td></tr>
                  : <tr><td className="muted">Days stored</td><td>{lot.days}</td></tr>}
                <tr><td className="muted">Rate</td><td>{rateLabel(lot.rateType, lot.rate)}</td></tr>
                <tr><td>Other charges</td><td>₹0</td></tr>
                <tr><td>Discount</td><td>₹0</td></tr>
                <tr className="total"><td>Total</td><td>{inr(lot.accrued)}</td></tr>
              </tbody>
            </table>
            {gs && (
              <div className="row spread" style={{ marginTop: 14, fontSize: 13 }}>
                <span className="muted">{lot.growerName}: paid <b style={{ color: 'var(--text)' }}>{inr(gs.paid)}</b></span>
                <Link className="link" to={`/admin/ledger/${lot.growerId}`}>Outstanding {inr(gs.due)}</Link>
              </div>
            )}

            <div className="lot-whatif">
              <h4>What-if calculator</h4>
              <div className="grid cols-3">
                <Field label="Boxes"><Input className="sm" type="number" min={0} value={wBoxes} onChange={(e) => setWiBoxes(e.target.value)} /></Field>
                {!noDays && <Field label="Days"><Input className="sm" type="number" min={0} value={wDays} onChange={(e) => setWiDays(e.target.value)} /></Field>}
                <Field label={`Rate (₹ / ${rateUnit})`}><Input className="sm" type="number" min={0} step="0.1" value={wRate} onChange={(e) => setWiRate(e.target.value)} /></Field>
              </div>
              <div className="out">
                <span className="muted">{flat ? 'Estimated flat charge (crates × rate)' : 'Estimated charge'}</span>
                <b>{inr(whatIf)}</b>
              </div>
              {(wiDays !== null || wiRate !== null || wiBoxes !== null) && (
                <Button size="sm" variant="ghost" onClick={() => { setWiDays(null); setWiRate(null); setWiBoxes(null) }}>Reset to this lot</Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={reqOpen} onClose={() => setReqOpen(false)} title={`Request dispatch · ${lot.code}`}
        footer={<><Button onClick={() => setReqOpen(false)}>Cancel</Button><Button variant="primary" onClick={submitDispatch}>Create request</Button></>}>
        <div className="form-grid">
          <div className="full muted">{num(lot.current)} boxes in storage{lot.pendingDispatch > 0 ? `, ${num(lot.pendingDispatch)} already requested` : ''}. Available to dispatch: <b style={{ color: 'var(--text)' }}>{num(free)}</b>.</div>
          <Field label="Boxes to dispatch" full><Input type="number" min={1} max={free} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Notes (optional)" full><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error && <div className="full"><Alert kind="error">{error}</Alert></div>}
        </div>
      </Modal>
      <Modal open={asgOpen} onClose={() => setAsgOpen(false)} title={`Assign chamber · ${lot.code}`}
        footer={<><Button onClick={() => setAsgOpen(false)}>Cancel</Button><Button variant="primary" onClick={submitAssign}>Assign</Button></>}>
        <div className="form-grid">
          <div className="full muted">{num(lot.current)} boxes to place.</div>
          <Field label="Chamber" hint={asgStat ? `${num(asgStat.available)} boxes free of ${num(asgStat.chamber.capacity)}` : 'Emptiest chamber with room is chosen'}>
            <Select value={asgChamber} onChange={(e) => setAsgChamber(e.target.value)}>
              <option value="">Auto-assign (emptiest chamber)</option>
              {d.store.chambers.map((c) => <option key={c.chamber.id} value={c.chamber.id}>{c.chamber.id} · {num(c.available)} free</option>)}
            </Select>
          </Field>
          <Field label="Starting rack" hint={asgStat ? `Racks 1–${asgStat.chamber.racks}` : 'Set automatically'}>
            <Input type="number" min={1} max={asgStat?.chamber.racks} disabled={!asgChamber} value={asgRack} onChange={(e) => setAsgRack(e.target.value)} />
          </Field>
          {asgError && <div className="full"><Alert kind="error">{asgError}</Alert></div>}
        </div>
      </Modal>
      <DocPreview open={!!doc} onClose={() => setDoc(null)} doc={doc} />
    </div>
  )
}
