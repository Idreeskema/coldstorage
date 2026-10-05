import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, PackagePlus } from 'lucide-react'
import {
  Alert, Button, Card, DocPreview, EmptyState, Field, Input, Modal, PageHeader, Progress, Select,
  StatusPill, TableWrap, Textarea, toast, type DocSpec,
} from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { fmtDate, num, today } from '../../core/format'
import type { BoxIssue, BoxType } from '../../core/types'
import './boxes.css'

export default function BoxesPage() {
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const allocations = useStore((s) => s.allocations)
  const boxIssues = useStore((s) => s.boxIssues)
  const session = useStore((s) => s.session)
  const issueBoxes = useStore((s) => s.issueBoxes)
  const [params, setParams] = useSearchParams()

  const [formOpen, setFormOpen] = useState(false)
  const [doc, setDoc] = useState<DocSpec | null>(null)
  const [growerId, setGrowerId] = useState('')
  const [allocationId, setAllocationId] = useState('')
  const [date, setDate] = useState(today())
  const [qty, setQty] = useState('')
  const [boxType, setBoxType] = useState<BoxType>('Wooden')
  const [issuedBy, setIssuedBy] = useState(session?.userName ?? '')
  const [vehicle, setVehicle] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [growerFilter, setGrowerFilter] = useState(params.get('grower') ?? '')

  const gName = useMemo(() => new Map(growers.map((g) => [g.id, g.name])), [growers])
  const allocById = useMemo(() => new Map(allocations.map((a) => [a.id, a])), [allocations])
  const s = d.store

  const openForm = (gid = '', aid = '') => {
    setGrowerId(gid)
    setAllocationId(aid)
    setQty('')
    setNotes('')
    setVehicle('')
    setDate(today())
    setError('')
    setFormOpen(true)
  }

  // Prefill from ?grower= & ?allocation=
  useEffect(() => {
    const g = params.get('grower') ?? '', a = params.get('allocation') ?? ''
    if (a && allocById.has(a)) openForm(allocById.get(a)!.growerId, a)
    else if (g && params.get('issue')) openForm(g, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = useMemo(
    () =>
      allocations
        .filter((a) => !growerFilter || a.growerId === growerFilter)
        .map((a) => ({ a, st: d.allocStats.get(a.id)! }))
        .filter((r) => r.st)
        .sort((x, y) => y.st.remainingToIssue - x.st.remainingToIssue || x.a.code.localeCompare(y.a.code)),
    [allocations, d.allocStats, growerFilter],
  )
  const growerAllocs = allocations.filter((a) => a.growerId === growerId)
  const selStats = allocationId ? d.allocStats.get(allocationId) : undefined
  const growersWithAlloc = growers.filter((g) => allocations.some((a) => a.growerId === g.id))

  const issueDoc = (i: BoxIssue): DocSpec => {
    const al = allocById.get(i.allocationId)
    return {
      title: 'Box Issue Receipt',
      code: i.code,
      date: fmtDate(i.date),
      rows: [
        ['Grower', gName.get(i.growerId) ?? '—'],
        ['Allocation', al?.code ?? '—'],
        ['Boxes issued', num(i.quantity)],
        ['Box type', i.boxType],
        ['Issued by', i.issuedBy],
        ['Vehicle', i.vehicle || '—'],
        ['Notes', i.notes || '—'],
      ],
      footer: 'Empty boxes issued against allocation — to be returned filled with apples',
    }
  }

  const submit = () => {
    setError('')
    const q = Number(qty)
    if (!growerId) return setError('Select a grower')
    if (!allocationId) return setError('Select an allocation')
    if (!Number.isInteger(q) || q <= 0) return setError('Enter a whole number of boxes')
    if (!issuedBy.trim()) return setError('Enter who is issuing the boxes')
    const res = issueBoxes({ allocationId, quantity: q, date, boxType, issuedBy: issuedBy.trim(), vehicle: vehicle.trim() || undefined, notes: notes.trim() || undefined })
    if (!res.ok) {
      setError(res.error ?? 'Could not issue boxes')
      toast(res.error ?? 'Could not issue boxes', 'error')
      return
    }
    toast(`${num(q)} boxes issued`)
    const created = useStore.getState().boxIssues.find((b) => b.id === res.id)
    setFormOpen(false)
    if (created) setDoc(issueDoc(created))
    if (params.get('allocation') || params.get('issue')) setParams((p) => { p.delete('allocation'); p.delete('issue'); return p }, { replace: true })
  }

  const history = [...boxIssues]
    .filter((b) => !growerFilter || b.growerId === growerFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code))

  return (
    <div className="page">
      <PageHeader
        title="Box Management"
        sub="Allocation reserves space. Issuing hands out empty boxes. Apples come back in those boxes and are stored."
        actions={<Button variant="primary" icon={<PackagePlus />} onClick={() => openForm(growerFilter)}>Issue boxes</Button>}
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="box-concepts">
          <div className="box-concept c1">
            <div className="tag">Allocated</div>
            <div className="val">{num(s.allocated)}</div>
            <div className="def">Reservation of space — no boxes handed over yet</div>
          </div>
          <div className="box-concept c2">
            <div className="tag">Issued</div>
            <div className="val">{num(s.issued)}</div>
            <div className="def">Empty boxes physically handed to growers</div>
          </div>
          <div className="box-concept c3">
            <div className="tag">Apple received</div>
            <div className="val">{num(s.received)}</div>
            <div className="def">Boxes returned filled with apples</div>
          </div>
          <div className="box-concept c4">
            <div className="tag">Stored</div>
            <div className="val">{num(s.stored)}</div>
            <div className="def">Received minus dispatched, in chambers now</div>
          </div>
        </div>
        <div className="box-derived">
          <span>Remaining to issue <b>{num(s.remainingToIssue)}</b> <span className="faint">(allocated − issued)</span></span>
          <span className={s.awaitingReturn > 0 ? 'warn' : ''}>Unreturned <b>{num(s.awaitingReturn)}</b> <span className="faint">(issued − received)</span></span>
        </div>
      </div>

      <Card
        pad={false}
        title="Allocations"
        sub="Box accountability per allocation"
        action={
          <Select className="sm" style={{ width: 200 }} value={growerFilter} onChange={(e) => setGrowerFilter(e.target.value)} aria-label="Filter by grower">
            <option value="">All growers</option>
            {growersWithAlloc.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="No allocations" text="Allocations appear here once a storage request is approved." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Grower</th><th>Allocation</th><th className="r">Allocated</th><th className="r">Issued</th>
                <th className="r">Received</th><th className="r">Remaining to issue</th><th className="r">Awaiting return</th>
                <th>Progress</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, st }) => (
                <tr key={a.id}>
                  <td className="strong">{gName.get(a.growerId)}</td>
                  <td className="mono">{a.code}</td>
                  <td className="r num">{num(st.allocated)}</td>
                  <td className="r num">{num(st.issued)}</td>
                  <td className="r num">{num(st.received)}</td>
                  <td className="r num">{num(st.remainingToIssue)}</td>
                  <td className="r num" style={st.awaitingReturn > 0 ? { color: 'var(--amber)', fontWeight: 600 } : undefined}>{num(st.awaitingReturn)}</td>
                  <td>
                    <div className="box-progress">
                      <Progress value={st.allocated ? (st.issued / st.allocated) * 100 : 0} />
                      <small>{st.allocated ? Math.round((st.issued / st.allocated) * 100) : 0}% issued</small>
                    </div>
                  </td>
                  <td><StatusPill status={st.status} /></td>
                  <td className="r">
                    <Button size="sm" variant={st.remainingToIssue > 0 ? 'primary' : 'secondary'} disabled={st.remainingToIssue === 0} onClick={() => openForm(a.growerId, a.id)}>Issue</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <div style={{ height: 18 }} />

      <Card pad={false} title="Issue history" sub={`${history.length} box issue receipts`}>
        {history.length === 0 ? (
          <EmptyState title="No boxes issued yet" />
        ) : (
          <TableWrap>
            <thead>
              <tr><th>Receipt</th><th>Date</th><th>Grower</th><th>Allocation</th><th className="r">Boxes</th><th>Type</th><th>Issued by</th><th>Vehicle</th><th /></tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.code}</td>
                  <td>{fmtDate(b.date)}</td>
                  <td className="strong">{gName.get(b.growerId)}</td>
                  <td className="mono">{allocById.get(b.allocationId)?.code}</td>
                  <td className="r num">{num(b.quantity)}</td>
                  <td>{b.boxType}</td>
                  <td>{b.issuedBy}</td>
                  <td>{b.vehicle || '—'}</td>
                  <td className="r"><Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setDoc(issueDoc(b))}>Receipt</Button></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Issue empty boxes"
        footer={<>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Issue boxes</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="Grower" full>
            <Select value={growerId} onChange={(e) => { setGrowerId(e.target.value); setAllocationId('') }}>
              <option value="">Select grower…</option>
              {growersWithAlloc.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.village}</option>)}
            </Select>
          </Field>
          <Field label="Allocation" full>
            <Select value={allocationId} disabled={!growerId} onChange={(e) => setAllocationId(e.target.value)}>
              <option value="">{growerId ? 'Select allocation…' : 'Select a grower first'}</option>
              {growerAllocs.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {num(d.allocStats.get(a.id)?.remainingToIssue ?? 0)} left to issue</option>
              ))}
            </Select>
          </Field>
          {selStats && (
            <div className="full box-remain">
              <span>Allocated <b>{num(selStats.allocated)}</b></span>
              <span>Issued <b>{num(selStats.issued)}</b></span>
              <span>Remaining to issue <b>{num(selStats.remainingToIssue)}</b></span>
            </div>
          )}
          <Field label="Issue date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Boxes to issue" hint={selStats ? `Up to ${num(selStats.remainingToIssue)}` : undefined}>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 500" />
          </Field>
          <Field label="Box type">
            <Select value={boxType} onChange={(e) => setBoxType(e.target.value as BoxType)}>
              <option>Wooden</option><option>Carton</option>
            </Select>
          </Field>
          <Field label="Issued by"><Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} /></Field>
          <Field label="Vehicle (optional)" full><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="JK01 AB 1234" /></Field>
          <Field label="Notes (optional)" full><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error && <div className="full"><Alert kind="error">{error}</Alert></div>}
        </div>
      </Modal>

      <DocPreview open={!!doc} onClose={() => setDoc(null)} doc={doc} />
    </div>
  )
}
