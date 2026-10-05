import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useDerived, useStore } from '../../core/store'
import { requestStatusLabel } from '../../core/calc'
import type { RequestStatus, StorageRequest } from '../../core/types'
import { addDays, fmtDate, fmtDateShort, num, today } from '../../core/format'
import {
  Alert, Button, Card, Chips, EmptyState, Field, Input, Modal, PageHeader, Select, StatusPill, TableWrap, Textarea, toast,
} from '../../ui'
import './requests.css'

type Filter = 'ALL' | RequestStatus
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All' }, { id: 'PENDING', label: 'Pending' }, { id: 'APPROVED', label: 'Approved' },
  { id: 'PARTIALLY_ALLOCATED', label: 'Partially Allocated' }, { id: 'FULLY_ALLOCATED', label: 'Fully Allocated' },
  { id: 'ACTIVE', label: 'Active' }, { id: 'COMPLETED', label: 'Completed' }, { id: 'REJECTED', label: 'Rejected' },
]
const FLOW: RequestStatus[] = ['PENDING', 'APPROVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'ACTIVE', 'COMPLETED']
const VARIETIES = ['Kashmiri Delicious', 'Royal Delicious', 'American', 'Kullu Delicious', 'Ambri', 'Golden', 'Maharaji']

export default function RequestsPage() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const d = useDerived()
  const requests = useStore((s) => s.requests)
  const growers = useStore((s) => s.growers)
  const allocations = useStore((s) => s.allocations)
  const createRequest = useStore((s) => s.createRequest)
  const approveRequest = useStore((s) => s.approveRequest)
  const rejectRequest = useStore((s) => s.rejectRequest)

  const filter = (FILTERS.some((f) => f.id === sp.get('status')) ? sp.get('status') : 'ALL') as Filter
  const [selId, setSelId] = useState<string | null>(null)
  const [boxes, setBoxes] = useState('')
  const [err, setErr] = useState('')
  const [reason, setReason] = useState('')
  const [newOpen, setNewOpen] = useState(sp.get('new') === '1')

  const gName = (id: string) => growers.find((g) => g.id === id)?.name ?? 'Unknown'
  const rows = useMemo(
    () => requests.filter((r) => filter === 'ALL' || r.status === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests, filter],
  )
  const sel = requests.find((r) => r.id === selId) ?? null
  const alloc = sel?.allocationId ? allocations.find((a) => a.id === sel.allocationId) : undefined
  const st = alloc ? d.allocStats.get(alloc.id) : undefined
  const avail = d.store.available
  const ask = sel ? sel.requestedBoxes - sel.allocatedBoxes : 0
  const closed = !sel || sel.status === 'REJECTED' || sel.status === 'COMPLETED'

  const select = (r: StorageRequest) => {
    setSelId(r.id); setErr(''); setReason('')
    setBoxes(String(Math.max(0, Math.min(r.requestedBoxes - r.allocatedBoxes, d.store.available))))
  }

  const setStatus = (v: Filter) => {
    const n = new URLSearchParams(sp)
    if (v === 'ALL') n.delete('status'); else n.set('status', v)
    setSp(n, { replace: true })
  }

  const approve = () => {
    if (!sel) return
    const n = Number(boxes)
    const res = approveRequest(sel.id, n)
    if (!res.ok) return setErr(res.error ?? 'Could not allocate')
    setErr('')
    toast(`${num(n)} boxes allocated`)
    const after = useStore.getState().requests.find((r) => r.id === sel.id)
    setBoxes(String(Math.max(0, (after ? after.requestedBoxes - after.allocatedBoxes : 0))))
  }
  const reject = () => {
    if (!sel) return
    const res = rejectRequest(sel.id, reason || undefined)
    if (!res.ok) return setErr(res.error ?? 'Could not reject')
    toast('Request rejected')
    setSelId(null)
  }

  const flowIdx = sel ? FLOW.indexOf(sel.status) : -1

  return (
    <div className="page">
      <PageHeader
        title="Storage requests"
        sub={`${d.store.pendingRequests} pending · ${num(avail)} boxes of capacity available`}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setNewOpen(true)}>New request</Button>}
      />
      <Card pad={false}>
        <div className="toolbar"><Chips options={FILTERS} value={filter} onChange={setStatus} /></div>
        {rows.length === 0 ? <EmptyState title="No requests" text="No storage requests match this status." /> : (
          <TableWrap>
            <thead><tr><th>Request</th><th>Grower</th><th className="r">Requested</th><th className="r">Allocated</th>
              <th>Arrival window</th><th>Duration</th><th>Variety</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => select(r)}>
                  <td className="mono">{r.code}</td>
                  <td className="strong">{gName(r.growerId)}</td>
                  <td className="r num">{num(r.requestedBoxes)}</td>
                  <td className="r num">{num(r.allocatedBoxes)}</td>
                  <td>{fmtDateShort(r.arrivalStart)} – {fmtDate(r.arrivalEnd)}</td>
                  <td>{r.durationMonths} mo</td>
                  <td>{r.variety}</td>
                  <td><StatusPill status={r.status} label={requestStatusLabel[r.status]} /></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal open={!!sel} onClose={() => setSelId(null)} wide
        title={sel ? `${sel.code} · ${gName(sel.growerId)}` : ''}
        footer={sel && (
          <>
            <Button onClick={() => nav(`/admin/growers/${sel.growerId}`)}>View grower</Button>
            {sel.status === 'PENDING' && <Button variant="danger" onClick={reject}>Reject</Button>}
            {!closed && ask > 0 && <Button variant="primary" onClick={approve}>{sel.allocatedBoxes > 0 ? 'Top up allocation' : 'Approve'}</Button>}
          </>
        )}>
        {sel && (
          <>
            <div className="rq-flow">
              {sel.status === 'REJECTED'
                ? <span className="now" style={{ background: 'var(--red)' }}>Rejected</span>
                : FLOW.map((s, i) => <span key={s} className={i < flowIdx ? 'done' : i === flowIdx ? 'now' : ''}>{requestStatusLabel[s]}</span>)}
            </div>
            <div className="rq-cap">
              <div><small>Requested</small><b>{num(sel.requestedBoxes)}</b></div>
              <div><small>Already allocated</small><b>{num(sel.allocatedBoxes)}</b></div>
              <div className={avail < ask ? 'bad' : ''}><small>Available capacity (live)</small><b>{num(avail)}</b></div>
            </div>
            <dl className="kv" style={{ marginBottom: 14 }}>
              <dt>Arrival window</dt><dd>{fmtDate(sel.arrivalStart)} – {fmtDate(sel.arrivalEnd)}</dd>
              <dt>Duration</dt><dd>{sel.durationMonths} months</dd>
              <dt>Variety</dt><dd>{sel.variety}</dd>
              {sel.expectedApples ? <><dt>Expected apples</dt><dd>{num(sel.expectedApples)} boxes</dd></> : null}
              {sel.notes ? <><dt>Notes</dt><dd>{sel.notes}</dd></> : null}
            </dl>

            {!closed && ask > 0 && (
              <>
                {avail < ask && <div style={{ marginBottom: 12 }}><Alert kind="warning">Only {num(avail)} boxes of capacity are free. You can allocate part of this request now and top up later.</Alert></div>}
                <Field label={sel.allocatedBoxes > 0 ? 'Boxes to add' : 'Boxes to allocate'} hint={`Up to ${num(Math.min(ask, avail))} now`}>
                  <Input type="number" min={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} />
                </Field>
                {sel.status === 'PENDING' && (
                  <div style={{ marginTop: 12 }}>
                    <Field label="Rejection reason (optional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  </div>
                )}
                {err && <div style={{ marginTop: 12 }}><Alert kind="error">{err}</Alert></div>}
              </>
            )}

            {alloc && st && (
              <div className="rq-alloc">
                <div className="row spread wrap">
                  <div><b className="mono">{alloc.code}</b> <span className="muted">· allocation card</span></div>
                  <StatusPill status={st.status} />
                </div>
                <div className="rq-alloc-nums">
                  <div><small>Requested</small><b>{num(sel.requestedBoxes)}</b></div>
                  <div><small>Allocated</small><b>{num(st.allocated)}</b></div>
                  <div><small>Issued</small><b>{num(st.issued)}</b></div>
                  <div><small>Returned with apples</small><b>{num(st.received)}</b></div>
                  <div><small>Remaining to issue</small><b>{num(st.remainingToIssue)}</b></div>
                </div>
                <Button variant="primary" size="sm" disabled={st.remainingToIssue === 0}
                  onClick={() => nav(`/admin/boxes?grower=${sel.growerId}&allocation=${alloc.id}`)}>Issue boxes</Button>
              </div>
            )}
          </>
        )}
      </Modal>

      {newOpen && <NewRequestModal initialGrower={sp.get('grower') ?? ''} onClose={() => {
        setNewOpen(false)
        if (sp.get('new')) { const n = new URLSearchParams(sp); n.delete('new'); n.delete('grower'); setSp(n, { replace: true }) }
      }} onCreate={(r) => createRequest(r)} />}
    </div>
  )
}

function NewRequestModal({ initialGrower, onClose, onCreate }: {
  initialGrower: string; onClose: () => void; onCreate: (r: Parameters<ReturnType<typeof useStore.getState>['createRequest']>[0]) => { ok: boolean; error?: string }
}) {
  const growers = useStore((s) => s.growers).filter((g) => g.status !== 'INACTIVE')
  const [f, setF] = useState({
    growerId: initialGrower, requestedBoxes: '', expectedApples: '', arrivalStart: addDays(today(), 7),
    arrivalEnd: addDays(today(), 21), durationMonths: '6', variety: VARIETIES[0], notes: '',
  })
  const [err, setErr] = useState('')
  useEffect(() => { setErr('') }, [f])
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = () => {
    if (!f.growerId) return setErr('Select a grower')
    const res = onCreate({
      growerId: f.growerId, requestedBoxes: Number(f.requestedBoxes), arrivalStart: f.arrivalStart, arrivalEnd: f.arrivalEnd,
      durationMonths: Number(f.durationMonths) || 6, variety: f.variety, notes: f.notes || undefined,
      expectedApples: f.expectedApples ? Number(f.expectedApples) : undefined,
    })
    if (!res.ok) return setErr(res.error ?? 'Could not create request')
    toast('Storage request created')
    onClose()
  }
  return (
    <Modal open title="New storage request" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create request</Button></>}>
      <div className="form-grid">
        <Field label="Grower" full>
          <Select value={f.growerId} onChange={set('growerId')}>
            <option value="">Select grower…</option>
            {growers.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.village}</option>)}
          </Select>
        </Field>
        <Field label="Boxes required"><Input type="number" min={1} value={f.requestedBoxes} onChange={set('requestedBoxes')} /></Field>
        <Field label="Expected apples (boxes)"><Input type="number" min={0} value={f.expectedApples} onChange={set('expectedApples')} /></Field>
        <Field label="Arrival from"><Input type="date" value={f.arrivalStart} onChange={set('arrivalStart')} /></Field>
        <Field label="Arrival until"><Input type="date" value={f.arrivalEnd} onChange={set('arrivalEnd')} /></Field>
        <Field label="Storage duration">
          <Select value={f.durationMonths} onChange={set('durationMonths')}>
            {[3, 4, 5, 6, 7, 8].map((m) => <option key={m} value={m}>{m} months</option>)}
          </Select>
        </Field>
        <Field label="Variety">
          <Select value={f.variety} onChange={set('variety')}>{VARIETIES.map((v) => <option key={v}>{v}</option>)}</Select>
        </Field>
        <Field label="Notes" full><Textarea value={f.notes} onChange={set('notes')} /></Field>
        {err && <div className="full"><Alert kind="error">{err}</Alert></div>}
      </div>
    </Modal>
  )
}
