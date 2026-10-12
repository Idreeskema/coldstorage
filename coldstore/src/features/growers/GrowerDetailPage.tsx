import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Box, FileText, IndianRupee, Plus, Apple, BookOpen, Phone, MapPin } from 'lucide-react'
import { useDerived, useStore } from '../../core/store'
import { buildLedger, requestStatusLabel } from '../../core/calc'
import { fmtDate, fmtDateShort, fmtTime, inr, num, rateLabel } from '../../core/format'
import type { Allocation, RateType } from '../../core/types'
import {
  Alert, Avatar, Button, Card, DocPreview, EmptyState, Field, Input, Kpi, Modal, PageHeader, QrCode, Select, StatusPill, TableWrap, Tabs, Timeline, toast,
  type DocSpec,
} from '../../ui'
import './growers.css'

type Tab = 'overview' | 'lots' | 'boxes' | 'receipts' | 'dispatches' | 'payments' | 'ledger' | 'docs'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'lots', label: 'Storage Lots' }, { id: 'boxes', label: 'Box Transactions' },
  { id: 'receipts', label: 'Apple Receipts' }, { id: 'dispatches', label: 'Dispatches' }, { id: 'payments', label: 'Payments' },
  { id: 'ledger', label: 'Ledger' }, { id: 'docs', label: 'Documents' },
]

export default function GrowerDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const d = useDerived()
  const state = useStore((s) => s)
  const approveGrower = useStore((s) => s.approveGrower)
  const [tab, setTab] = useState<Tab>('overview')
  const [doc, setDoc] = useState<DocSpec | null>(null)
  const isManager = useStore((s) => s.session?.role === 'MANAGER')
  const updateAllocation = useStore((s) => s.updateAllocation)
  const [rateAlloc, setRateAlloc] = useState<Allocation | null>(null)
  const [rf, setRf] = useState({ type: 'PER_MONTH' as RateType, rate: '', ref: '', remarks: '', applyLots: true })
  const [rfErr, setRfErr] = useState('')

  const g = state.growers.find((x) => x.id === id)
  const s = d.growerStats.get(id)

  const allocs = useMemo(() => state.allocations.filter((a) => a.growerId === id), [state.allocations, id])
  const lots = useMemo(() => d.lots.filter((l) => l.growerId === id), [d.lots, id])
  const issues = state.boxIssues.filter((x) => x.growerId === id).sort((a, b) => b.date.localeCompare(a.date))
  const receipts = state.receipts.filter((x) => x.growerId === id).sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  const dispatches = state.dispatches.filter((x) => x.growerId === id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
  const payments = state.payments.filter((x) => x.growerId === id).sort((a, b) => b.date.localeCompare(a.date))
  const requests = state.requests.filter((x) => x.growerId === id)
  const ledger = useMemo(() => (g ? buildLedger(state, id) : []), [state, id, g])
  const activities = state.activities.filter((a) => a.growerId === id).slice(0, 15)

  if (!g || !s) {
    return (
      <div className="page">
        <EmptyState title="Grower not found" text="This grower does not exist or was removed."
          action={<Button onClick={() => nav('/admin/growers')}>Back to growers</Button>} />
      </div>
    )
  }

  const openRate = (a: Allocation) => {
    setRateAlloc(a); setRfErr('')
    setRf({ type: a.rateType, rate: String(a.rate), ref: a.externalRef ?? '', remarks: a.remarks ?? '', applyLots: true })
  }
  const saveRate = () => {
    if (!rateAlloc) return
    const rate = Number(rf.rate)
    if (rf.rate.trim() === '' || !(rate >= 0)) return setRfErr('Enter a valid rate')
    const res = updateAllocation(rateAlloc.id, {
      rateType: rf.type, rate, externalRef: rf.ref.trim() || undefined, remarks: rf.remarks.trim() || undefined,
    }, rf.applyLots)
    if (!res.ok) return setRfErr(res.error ?? 'Could not update the agreement')
    toast(`Rate updated · ${rateLabel(rf.type, rate)}`)
    setRateAlloc(null)
  }
  const allocCode = (aid: string) => state.allocations.find((a) => a.id === aid)?.code ?? '—'
  const lotCode = (lid: string) => d.lotById.get(lid)?.code ?? '—'
  const firstAlloc = allocs.find((a) => d.allocStats.get(a.id)!.remainingToIssue > 0) ?? allocs[0]
  const q = (extra = '') => `grower=${g.id}${extra}`

  const openDoc = (x: DocSpec) => setDoc(x)
  const requestDoc = (r: (typeof requests)[number]): DocSpec => ({
    title: 'Storage Request Receipt', code: r.code, date: fmtDate(r.createdAt),
    rows: [['Grower', g.name], ['Grower ID', g.code], ['Boxes requested', num(r.requestedBoxes)], ['Arrival window', `${fmtDateShort(r.arrivalStart)} – ${fmtDate(r.arrivalEnd)}`],
      ['Duration', `${r.durationMonths} months`], ['Variety', r.variety], ['Status', requestStatusLabel[r.status]]],
  })
  const issueDoc = (b: (typeof issues)[number]): DocSpec => ({
    title: 'Box Issue Receipt', code: b.code, date: fmtDate(b.date),
    rows: [['Grower', g.name], ['Allocation', allocCode(b.allocationId)], ['Boxes issued', num(b.quantity)], ['Box type', b.boxType],
      ['Issued by', b.issuedBy], ['Vehicle', b.vehicle ?? '—']],
  })
  const receiptDoc = (r: (typeof receipts)[number]): DocSpec => ({
    title: 'Inward Receipt', code: r.code, date: fmtDate(r.receivedDate),
    rows: [['Grower', g.name], ['Lot', lotCode(r.lotId)], ['Boxes received', num(r.boxes)], ['Variety / grade', `${r.variety} · ${r.grade}`],
      ['Weight', r.weightKg ? `${num(r.weightKg)} kg` : '—'], ['Location', `${r.chamberId} · rack ${r.rackStart}`], ['Vehicle', r.vehicle ?? '—']],
  })
  const payDoc = (p: (typeof payments)[number]): DocSpec => ({
    title: 'Payment Receipt', code: p.code, date: fmtDate(p.date),
    rows: [['Received from', g.name], ['Grower ID', g.code], ['Method', p.method], ['Reference', p.reference ?? '—'], ['Amount', inr(p.amount)]],
  })
  const statementDoc = (): DocSpec => ({
    title: 'Storage Statement', code: `STMT-${g.code}`, date: fmtDate(new Date().toISOString()),
    rows: [['Grower', g.name], ['Boxes received', num(s.received)], ['Dispatched', num(s.dispatched)], ['Current storage', num(s.stored)],
      ['Total charges', inr(s.charges)], ['Paid', inr(s.paid)], s.due < -1 ? ['Advance held', inr(-s.due)] : ['Balance due', inr(Math.max(0, s.due))]],
  })

  const stats: [string, string, string?][] = [
    ['Allocation', num(s.allocated), 'boxes'], ['Boxes issued', num(s.issued), `${num(s.awaitingReturn)} awaiting return`],
    ['Apples received', num(s.received)], ['Current storage', num(s.stored), `${s.activeLots} active lots`],
    ['Dispatched', num(s.dispatched)], ['Total charges', inr(s.charges)], ['Paid', inr(s.paid)],
    s.due < -1 ? ['Advance held', inr(-s.due), 'Paid in excess of charges'] : ['Due', inr(Math.max(0, s.due))],
  ]

  const stepper = (allocated: number, issued: number, received: number, stored: number, dispatched: number) => {
    const steps = [['Allocation', allocated, allocated > 0], ['Issued', issued, issued > 0], ['Received', received, received > 0],
      ['Stored', stored, stored > 0], ['Dispatched', dispatched, dispatched > 0]] as const
    const lastDone = steps.reduce((m, st, i) => (st[2] ? i : m), 0)
    return (
      <div className="gr-steps">
        {steps.map(([label, n, done], i) => (
          <div key={label} className={`gr-step ${done ? 'done' : ''} ${i === lastDone ? 'now' : ''}`}>
            <i>{done ? '✓' : i + 1}</i><b>{label}</b><span>{num(n)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Grower profile" crumbs={[{ label: 'Growers', to: '/admin/growers' }, { label: g.name }]} />
      <Card>
        <div className="gr-hero" style={{ padding: 0 }}>
          <Avatar name={g.name} lg />
          <div className="gr-hero-main">
            <div className="row wrap"><h2>{g.name}</h2><StatusPill status={g.status} /></div>
            <div className="gr-meta">
              <span className="row" style={{ gap: 5 }}><Phone size={14} />{g.phone}</span>
              <span className="row" style={{ gap: 5 }}><MapPin size={14} />{g.village}{g.district ? `, ${g.district}` : ''}</span>
              <span className="mono">{g.code}</span>
              {g.orchard && <span>Orchard: {g.orchard}</span>}
            </div>
            {g.status === 'PENDING' && (
              <div style={{ marginTop: 10 }}>
                <Button size="sm" variant="primary" onClick={() => { approveGrower(g.id); toast(`${g.name} approved`) }}>Approve grower</Button>
              </div>
            )}
          </div>
          <QrCode value={g.code} />
        </div>
      </Card>

      <div className="gr-actions">
        <Button variant="primary" icon={<Box />} onClick={() => nav(`/admin/boxes?${q(firstAlloc ? `&allocation=${firstAlloc.id}` : '')}`)}>Issue boxes</Button>
        <Button icon={<Apple />} onClick={() => nav(`/admin/receipts?${q()}`)}>Receive apples</Button>
        <Button icon={<IndianRupee />} onClick={() => nav(`/admin/payments?new=1&${q()}`)}>Record payment</Button>
        <Button icon={<BookOpen />} onClick={() => nav(`/admin/ledger/${g.id}`)}>Ledger</Button>
        <Button icon={<Plus />} onClick={() => nav(`/admin/requests?new=1&${q()}`)}>New request</Button>
      </div>

      <div className="gr-stats">
        {stats.map(([label, value, foot], i) => (
          <Kpi key={label} label={label} value={value} foot={foot} tone={i === 7 && s.due > 1 ? 'bad' : undefined} />
        ))}
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid cols-main">
          <Card title="Allocations" sub={`${allocs.length} active and past`} pad={false}>
            {allocs.length === 0 ? (
              <EmptyState title="No allocations yet" text="Approve a storage request to allocate boxes."
                action={<Button onClick={() => nav(`/admin/requests?new=1&${q()}`)}>Create request</Button>} />
            ) : allocs.map((a) => {
              const st = d.allocStats.get(a.id)!
              const al = lots.filter((l) => l.allocationId === a.id)
              const stored = al.reduce((t, l) => t + l.current, 0)
              const out = al.reduce((t, l) => t + l.dispatched, 0)
              return (
                <div key={a.id} className="gr-alloc">
                  <div className="row spread wrap">
                    <div>
                      <span className="mono strong">{a.code}</span>
                      {a.externalRef && <span className="muted"> · Txn {a.externalRef}</span>}
                      <span className="muted"> · {a.durationMonths} months</span>
                      <div className="gr-rate">
                        <b>{rateLabel(a.rateType, a.rate)}</b>
                        {!(a.rate > 0) && <span className="pill amber">Rate missing</span>}
                        {isManager && <button type="button" className="link" onClick={() => openRate(a)}>Edit rate</button>}
                      </div>
                      {a.remarks && <div className="muted" style={{ fontSize: 12.5 }}>{a.remarks}</div>}
                    </div>
                    <div className="row"><StatusPill status={st.status} />
                      {st.remainingToIssue > 0 && <Button size="sm" onClick={() => nav(`/admin/boxes?${q(`&allocation=${a.id}`)}`)}>Issue boxes</Button>}</div>
                  </div>
                  <div className="gr-alloc-nums">
                    <div><small>Allocated</small><b>{num(st.allocated)}</b></div>
                    <div><small>Issued</small><b>{num(st.issued)}</b></div>
                    <div><small>Returned with apples</small><b>{num(st.received)}</b></div>
                    <div><small>Remaining to issue</small><b>{num(st.remainingToIssue)}</b></div>
                    <div><small>Awaiting return</small><b>{num(st.awaitingReturn)}</b></div>
                  </div>
                  {stepper(st.allocated, st.issued, st.received, stored, out)}
                </div>
              )
            })}
          </Card>
          <Card title="Timeline" sub="Latest activity for this grower">
            {activities.length === 0 ? <div className="muted">No activity recorded yet.</div> : (
              <Timeline items={activities.map((a) => ({
                id: a.id, time: fmtTime(a.timestamp), tone: a.status === 'warning' ? 'warning' : a.status === 'info' ? 'info' : 'success',
                title: a.title, desc: `${fmtDateShort(a.timestamp)} · ${a.description}`,
              }))} />
            )}
          </Card>
        </div>
      )}

      {tab === 'lots' && (
        <Card pad={false}>
          {lots.length === 0 ? <EmptyState title="No storage lots" text="Lots are created when apples are received." /> : (
            <TableWrap>
              <thead><tr><th>Lot</th><th>Variety</th><th className="r">Received</th><th className="r">Current</th><th className="r">Days</th>
                <th>Rate</th><th className="r">Accrued</th><th>Location</th><th>Status</th></tr></thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} className="click" onClick={() => nav(`/admin/inventory/${l.id}`)}>
                    <td className="mono"><Link className="link" to={`/admin/inventory/${l.id}`}>{l.code}</Link></td>
                    <td>{l.variety} · {l.grade}</td>
                    <td className="r num">{num(l.boxesReceived)}</td><td className="r num strong">{num(l.current)}</td>
                    <td className="r num">{l.days}</td><td className="muted">{rateLabel(l.rateType, l.rate)}</td><td className="r num">{inr(l.accrued)}</td>
                    <td>{l.chamberId} · {l.rackLabel}</td><td><StatusPill status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'boxes' && (
        <Card pad={false}>
          {issues.length === 0 ? <EmptyState title="No boxes issued" /> : (
            <TableWrap>
              <thead><tr><th>Date</th><th>Receipt</th><th>Allocation</th><th>Type</th><th className="r">Quantity</th><th>Issued by</th><th /></tr></thead>
              <tbody>
                {issues.map((b) => (
                  <tr key={b.id}><td>{fmtDate(b.date)}</td><td className="mono">{b.code}</td><td className="mono">{allocCode(b.allocationId)}</td>
                    <td>{b.boxType}</td><td className="r num strong">{num(b.quantity)}</td><td>{b.issuedBy}</td>
                    <td className="r"><Button size="sm" variant="ghost" icon={<FileText />} onClick={() => openDoc(issueDoc(b))}>Receipt</Button></td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'receipts' && (
        <Card pad={false}>
          {receipts.length === 0 ? <EmptyState title="No apples received" /> : (
            <TableWrap>
              <thead><tr><th>Date</th><th>Receipt</th><th>Lot</th><th>Variety</th><th className="r">Boxes</th><th>Location</th><th /></tr></thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}><td>{fmtDate(r.receivedDate)}</td><td className="mono">{r.code}</td>
                    <td><Link className="link mono" to={`/admin/inventory/${r.lotId}`}>{lotCode(r.lotId)}</Link></td>
                    <td>{r.variety} · {r.grade}</td><td className="r num strong">{num(r.boxes)}</td><td>{r.chamberId} · R{String(r.rackStart).padStart(2, '0')}</td>
                    <td className="r"><Button size="sm" variant="ghost" icon={<FileText />} onClick={() => openDoc(receiptDoc(r))}>Receipt</Button></td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'dispatches' && (
        <Card pad={false}>
          {dispatches.length === 0 ? <EmptyState title="No dispatches" text="Dispatch requests for this grower will show here." /> : (
            <TableWrap>
              <thead><tr><th>Requested</th><th>Gate pass</th><th>Lot</th><th className="r">Boxes</th><th>Completed</th><th>Status</th></tr></thead>
              <tbody>
                {dispatches.map((x) => (
                  <tr key={x.id}><td>{fmtDate(x.requestedAt)}</td><td className="mono">{x.code}</td><td className="mono">{lotCode(x.lotId)}</td>
                    <td className="r num strong">{num(x.quantity)}</td><td>{fmtDate(x.completedDate)}</td><td><StatusPill status={x.status} /></td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'payments' && (
        <Card pad={false} title="Payments" action={<Button size="sm" variant="primary" onClick={() => nav(`/admin/payments?new=1&${q()}`)}>Record payment</Button>}>
          {payments.length === 0 ? <EmptyState title="No payments recorded" /> : (
            <TableWrap>
              <thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th>Reference</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}><td>{fmtDate(p.date)}</td><td className="mono">{p.code}</td><td>{p.method}</td><td>{p.reference ?? '—'}</td>
                    <td className="r num strong">{inr(p.amount)}</td>
                    <td className="r"><Button size="sm" variant="ghost" icon={<FileText />} onClick={() => openDoc(payDoc(p))}>Receipt</Button></td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>Total paid</td><td className="r num">{inr(s.paid)}</td><td /></tr></tfoot>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'ledger' && (
        <Card pad={false} title="Ledger" action={<Button size="sm" onClick={() => nav(`/admin/ledger/${g.id}`)}>Open full ledger</Button>}>
          {ledger.length === 0 ? <EmptyState title="No ledger entries" /> : (
            <TableWrap>
              <thead><tr><th>Date</th><th>Description</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id}><td>{fmtDate(r.date)}</td><td>{r.description}</td>
                    <td className="r num">{r.debit ? inr(r.debit) : ''}</td><td className="r num">{r.credit ? inr(r.credit) : ''}</td>
                    <td className={`r num strong ${r.balance < -0.5 ? 'gr-adv' : ''}`}>{r.balance < -0.5 ? `Advance ${inr(-r.balance)}` : inr(r.balance)}</td></tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'docs' && (
        <Card title="Documents" sub="Generated automatically with each transaction" pad={false}>
          <div className="gr-doc-list">
            {[
              ...requests.map((r) => ({ key: r.id, label: `Storage request receipt · ${r.code}`, doc: requestDoc(r) })),
              ...issues.map((b) => ({ key: b.id, label: `Box issue receipt · ${b.code}`, doc: issueDoc(b) })),
              ...receipts.map((r) => ({ key: r.id, label: `Inward receipt · ${r.code}`, doc: receiptDoc(r) })),
              ...payments.map((p) => ({ key: p.id, label: `Payment receipt · ${p.code}`, doc: payDoc(p) })),
              { key: 'stmt', label: 'Storage statement', doc: statementDoc() },
            ].map((x) => (
              <div className="gr-doc" key={x.key}>
                <span className="row"><FileText />{x.label}</span>
                <Button size="sm" onClick={() => openDoc(x.doc)}>View</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!rateAlloc} onClose={() => setRateAlloc(null)} title={rateAlloc ? `Edit agreement rate · ${rateAlloc.code}` : ''}
        footer={<><Button onClick={() => setRateAlloc(null)}>Cancel</Button><Button variant="primary" onClick={saveRate}>Save rate</Button></>}>
        <div className="form-grid">
          <Field label="Billing basis">
            <Select value={rf.type} onChange={(e) => setRf({ ...rf, type: e.target.value as RateType })}>
              <option value="PER_CRATE">Per crate, flat</option>
              <option value="PER_DAY">Per box / day</option>
              <option value="PER_MONTH">Per box / month</option>
              <option value="PER_SEASON">Per box / season</option>
            </Select>
          </Field>
          <Field label="Rate (₹)"><Input type="number" min={0} step="0.01" value={rf.rate} onChange={(e) => setRf({ ...rf, rate: e.target.value })} /></Field>
          <Field label="Transaction ID (optional)"><Input value={rf.ref} onChange={(e) => setRf({ ...rf, ref: e.target.value })} /></Field>
          <Field label="Remarks (optional)"><Input value={rf.remarks} onChange={(e) => setRf({ ...rf, remarks: e.target.value })} /></Field>
          <label className="set-check full" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 }}>
            <input type="checkbox" checked={rf.applyLots} onChange={(e) => setRf({ ...rf, applyLots: e.target.checked })} />
            <span>Apply to existing lots <span className="muted">({rateAlloc ? lots.filter((l) => l.allocationId === rateAlloc.id).length : 0} lots). Off: only lots received from now on use the new rate.</span></span>
          </label>
          {rfErr && <div className="full"><Alert kind="error">{rfErr}</Alert></div>}
        </div>
      </Modal>

      <DocPreview open={!!doc} onClose={() => setDoc(null)} doc={doc} />
    </div>
  )
}
