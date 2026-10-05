import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, FileText, Plus, X } from 'lucide-react'
import {
  Alert, Button, Card, Chips, DocPreview, EmptyState, Field, Input, Kpi, Modal, PageHeader, Select, StatusPill,
  TableWrap, Textarea, toast, type DocSpec,
} from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { fmtDate, num, today } from '../../core/format'
import type { Dispatch } from '../../core/types'
import './dispatch.css'

type Filter = 'all' | 'PENDING' | 'COMPLETED' | 'REJECTED'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'PENDING', label: 'Pending' }, { id: 'COMPLETED', label: 'Completed' }, { id: 'REJECTED', label: 'Rejected' },
]

export default function DispatchPage() {
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const dispatches = useStore((s) => s.dispatches)
  const approveDispatch = useStore((s) => s.approveDispatch)
  const rejectDispatch = useStore((s) => s.rejectDispatch)
  const requestDispatch = useStore((s) => s.requestDispatch)
  const [sp, setSp] = useSearchParams()

  const raw = (sp.get('status') ?? '').toUpperCase()
  const status: Filter = FILTERS.some((f) => f.id === raw) ? (raw as Filter) : 'all'
  const todayOnly = sp.get('date') === 'today'

  const [approving, setApproving] = useState<Dispatch | null>(null)
  const [vehicle, setVehicle] = useState('')
  const [approveErr, setApproveErr] = useState('')
  const [pass, setPass] = useState<Dispatch | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ growerId: '', lotId: '', qty: '', notes: '' })
  const [formErr, setFormErr] = useState('')

  const gName = (id: string) => growers.find((g) => g.id === id)?.name ?? 'Unknown'
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setSp(next, { replace: true })
  }

  const pending = useMemo(
    () => dispatches.filter((x) => x.status === 'PENDING').sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    [dispatches],
  )

  /** cumulative boxes dispatched from the lot up to and including this dispatch */
  const remainingAfter = (x: Dispatch) => {
    const lot = d.lotById.get(x.lotId)
    if (!lot) return 0
    if (x.status === 'COMPLETED') {
      const done = dispatches
        .filter((o) => o.lotId === x.lotId && o.status === 'COMPLETED' && o.completedDate)
        .sort((a, b) => a.completedDate!.localeCompare(b.completedDate!) || a.code.localeCompare(b.code))
      let left = lot.boxesReceived
      for (const o of done) { left -= o.quantity; if (o.id === x.id) break }
      return left
    }
    return lot.current - x.quantity
  }

  const history = useMemo(
    () =>
      dispatches
        .filter((x) => status === 'all' || x.status === status)
        .filter((x) => !todayOnly || x.completedDate === today() || x.requestedAt.slice(0, 10) === today())
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [dispatches, status, todayOnly],
  )

  const startApprove = (x: Dispatch) => { setApproving(x); setVehicle(x.vehicle ?? ''); setApproveErr('') }
  const confirmApprove = () => {
    if (!approving) return
    const res = approveDispatch(approving.id, vehicle.trim() || undefined)
    if (!res.ok) {
      setApproveErr(res.error ?? 'Could not approve dispatch')
      toast(res.error ?? 'Could not approve dispatch', 'error')
      return
    }
    toast(`${approving.code} approved — gate pass issued`)
    const done = useStore.getState().dispatches.find((o) => o.id === approving.id) ?? null
    setApproving(null)
    setPass(done)
  }
  const reject = (x: Dispatch) => {
    const res = rejectDispatch(x.id)
    if (!res.ok) return toast(res.error ?? 'Could not reject', 'error')
    toast(`${x.code} rejected`)
  }

  const growerLots = d.lots.filter((l) => l.growerId === form.growerId && l.current > 0)
  const selLot = d.lotById.get(form.lotId)
  const available = selLot ? selLot.current - selLot.pendingDispatch : 0
  const qty = Number(form.qty)
  const qtyErr = selLot && form.qty !== '' && qty > available
    ? `Only ${num(available)} boxes are available in ${selLot.code}${selLot.pendingDispatch ? ` (${num(selLot.pendingDispatch)} already requested)` : ''}`
    : ''

  const openCreate = () => { setForm({ growerId: '', lotId: '', qty: '', notes: '' }); setFormErr(''); setCreating(true) }
  const submitCreate = () => {
    if (!form.growerId) return setFormErr('Select a grower')
    if (!form.lotId) return setFormErr('Select a lot')
    if (!(qty > 0)) return setFormErr('Enter the number of boxes to dispatch')
    if (qtyErr) return setFormErr(qtyErr)
    const res = requestDispatch(form.growerId, form.lotId, qty, form.notes.trim() || undefined)
    if (!res.ok) {
      setFormErr(res.error ?? 'Could not create dispatch')
      toast(res.error ?? 'Could not create dispatch', 'error')
      return
    }
    toast('Dispatch request created and awaiting approval')
    setCreating(false)
  }

  const gatePass = (x: Dispatch): DocSpec => {
    const lot = d.lotById.get(x.lotId)
    return {
      title: 'Gate Pass — Outward', code: x.code, date: fmtDate(x.completedDate ?? x.requestedAt.slice(0, 10)),
      rows: [
        ['Grower', gName(x.growerId)],
        ['Lot', lot?.code ?? '—'],
        ['Variety / grade', lot ? `${lot.variety} · ${lot.grade}` : '—'],
        ['Chamber', lot?.chamberId ?? '—'],
        ['Boxes dispatched', num(x.quantity)],
        ['Remaining in lot', num(remainingAfter(x))],
        ['Vehicle', x.vehicle || '—'],
        ['Status', x.status === 'COMPLETED' ? 'Approved' : x.status === 'PENDING' ? 'Pending approval' : 'Rejected'],
      ],
      footer: 'Present this gate pass at the exit gate — computer generated',
    }
  }

  const todayOut = d.store.todayOutward

  return (
    <div className="page">
      <PageHeader
        title="Dispatch / Outward"
        sub="Approve release requests and track gate passes"
        actions={<Button variant="primary" icon={<Plus />} onClick={openCreate}>New dispatch</Button>}
      />

      <div className="grid cols-3">
        <Kpi label="Pending approvals" value={pending.length} tone={pending.length > 0 ? 'warn' : undefined} foot={`${num(pending.reduce((s, x) => s + x.quantity, 0))} boxes requested`} />
        <Kpi label="Dispatched today" value={num(todayOut)} unit="boxes" to="/admin/dispatch?status=COMPLETED&date=today" />
        <Kpi label="Total dispatched" value={num(d.store.dispatched)} unit="boxes" foot={`${dispatches.filter((x) => x.status === 'COMPLETED').length} completed dispatches`} />
      </div>

      <div className="dsp-section">
        <h2 className="dsp-h">Pending approvals</h2>
        {pending.length === 0 ? (
          <Card><EmptyState icon={<Check />} title="Nothing waiting" text="All dispatch requests have been handled." /></Card>
        ) : (
          <div className="dsp-cards">
            {pending.map((x) => {
              const lot = d.lotById.get(x.lotId)
              const stock = lot?.current ?? 0
              const left = stock - x.quantity
              const over = left < 0
              return (
                <div key={x.id} className="card dsp-card">
                  <div className="row spread">
                    <div>
                      <div className="strong">{gName(x.growerId)}</div>
                      <div className="muted dsp-sm"><span className="mono">{x.code}</span> · {lot?.code} · requested {fmtDate(x.requestedAt.slice(0, 10))}</div>
                    </div>
                    <StatusPill status="PENDING" />
                  </div>
                  <div className="dsp-stats">
                    <div><span>Requested</span><b className="num">{num(x.quantity)}</b></div>
                    <div><span>Lot stock</span><b className="num">{num(stock)}</b></div>
                    <div><span>Remaining after</span><b className={`num ${over ? 'dsp-bad' : ''}`}>{num(left)}</b></div>
                  </div>
                  {over && <Alert kind="error">Requested quantity exceeds the {num(stock)} boxes currently in {lot?.code}.</Alert>}
                  {x.notes && <div className="muted dsp-sm">Note: {x.notes}</div>}
                  <div className="row dsp-btns">
                    <Button variant="danger" icon={<X />} onClick={() => reject(x)}>Reject</Button>
                    <Button variant="primary" icon={<Check />} onClick={() => startApprove(x)}>Approve</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="dsp-section">
        <Card
          pad={false}
          title="Dispatch history"
          sub={`${history.length} record${history.length === 1 ? '' : 's'}`}
          action={
            <div className="row wrap">
              <Chips options={FILTERS} value={status} onChange={(v) => setParam('status', v)} />
              <Chips options={[{ id: 'all', label: 'Any date' }, { id: 'today', label: 'Today' }]} value={todayOnly ? 'today' : 'all'} onChange={(v) => setParam('date', v)} />
            </div>
          }
        >
          {history.length === 0 ? (
            <EmptyState title="No dispatches found" text="Change the filters to see more." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Gate pass</th><th>Grower</th><th>Lot</th><th>Date</th>
                  <th className="r">Boxes</th><th>Original → dispatched → remaining</th><th>Status</th><th className="r">Pass</th>
                </tr>
              </thead>
              <tbody>
                {history.map((x) => {
                  const lot = d.lotById.get(x.lotId)
                  return (
                    <tr key={x.id}>
                      <td className="mono">{x.code}</td>
                      <td>{gName(x.growerId)}</td>
                      <td>{lot ? <Link className="link mono" to={`/admin/inventory/${lot.id}`}>{lot.code}</Link> : '—'}</td>
                      <td>{fmtDate(x.completedDate ?? x.requestedAt.slice(0, 10))}</td>
                      <td className="r num strong">{num(x.quantity)}</td>
                      <td className="num dsp-flow">
                        {lot && x.status !== 'REJECTED'
                          ? <>{num(lot.boxesReceived)} <i>→</i> {num(x.quantity)} <i>→</i> <b>{num(remainingAfter(x))}</b></>
                          : <span className="muted">—</span>}
                      </td>
                      <td><StatusPill status={x.status} /></td>
                      <td className="r">
                        {x.status === 'COMPLETED'
                          ? <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => setPass(x)}>Gate pass</Button>
                          : <span className="muted">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <Modal
        open={!!approving}
        title="Approve dispatch"
        onClose={() => setApproving(null)}
        footer={<>
          <Button onClick={() => setApproving(null)}>Cancel</Button>
          <Button variant="primary" icon={<Check />} onClick={confirmApprove}>Approve and issue gate pass</Button>
        </>}
      >
        {approving && (
          <div className="stack">
            <div>
              <div className="strong">{gName(approving.growerId)}</div>
              <div className="muted">{num(approving.quantity)} boxes from {d.lotById.get(approving.lotId)?.code} · {approving.code}</div>
            </div>
            <Field label="Vehicle number (optional)">
              <Input value={vehicle} placeholder="e.g. JK02 AB 1234" onChange={(e) => setVehicle(e.target.value)} />
            </Field>
            {approveErr && <Alert kind="error">{approveErr}</Alert>}
          </div>
        )}
      </Modal>

      <Modal
        open={creating}
        title="New dispatch"
        onClose={() => setCreating(false)}
        footer={<>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" onClick={submitCreate}>Create request</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="Grower" full>
            <Select value={form.growerId} onChange={(e) => { setForm({ growerId: e.target.value, lotId: '', qty: '', notes: form.notes }); setFormErr('') }}>
              <option value="">Select grower…</option>
              {growers.filter((g) => d.lots.some((l) => l.growerId === g.id && l.current > 0)).map((g) => <option key={g.id} value={g.id}>{g.name} · {g.code}</option>)}
            </Select>
          </Field>
          <Field label="Lot" full hint={selLot ? `${num(selLot.current)} boxes in storage · ${selLot.chamberId}` : undefined}>
            <Select value={form.lotId} disabled={!form.growerId} onChange={(e) => { setForm({ ...form, lotId: e.target.value, qty: '' }); setFormErr('') }}>
              <option value="">{form.growerId ? 'Select lot…' : 'Select a grower first'}</option>
              {growerLots.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.variety} · {num(l.current)} boxes</option>)}
            </Select>
          </Field>
          <Field label="Quantity (boxes)" error={qtyErr} hint={selLot ? `Available: ${num(available)}` : undefined}>
            <Input type="number" min={1} inputMode="numeric" value={form.qty} disabled={!selLot} placeholder="0" onChange={(e) => { setForm({ ...form, qty: e.target.value }); setFormErr('') }} />
          </Field>
          <Field label="Remaining after dispatch">
            <Input readOnly value={selLot && qty > 0 && !qtyErr ? num(available - qty) : '—'} />
          </Field>
          <Field label="Notes (optional)" full>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {formErr && formErr !== qtyErr && <div className="full"><Alert kind="error">{formErr}</Alert></div>}
        </div>
      </Modal>

      <DocPreview open={!!pass} onClose={() => setPass(null)} doc={pass ? gatePass(pass) : null} />
    </div>
  )
}
