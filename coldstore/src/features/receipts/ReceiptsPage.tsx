import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, PackageCheck, X } from 'lucide-react'
import {
  Alert, Button, Card, DocPreview, EmptyState, Field, Input, Modal, PageHeader, QrCode, Select,
  TableWrap, Textarea, toast, type DocSpec,
} from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { estimateCharge } from '../../core/calc'
import { fmtDate, inr, num, rateLabel, today } from '../../core/format'
import type { AppleReceipt } from '../../core/types'
import './receipts.css'

const VARIETIES = ['Red Delicious', 'Ambri', 'Royal Delicious', 'American Trel', 'Golden Delicious', 'Kullu Delicious']
const GRADES = ['A', 'B', 'C']

export default function ReceiptsPage() {
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const allocations = useStore((s) => s.allocations)
  const receipts = useStore((s) => s.receipts)
  const lots = useStore((s) => s.lots)
  const session = useStore((s) => s.session)
  const receiveApples = useStore((s) => s.receiveApples)
  const [params, setParams] = useSearchParams()

  const isManager = session?.role === 'MANAGER'
  const dateFilter = params.get('date') === 'today'
  const growerFilter = params.get('grower') ?? ''

  const [formOpen, setFormOpen] = useState(false)
  const [doc, setDoc] = useState<DocSpec | null>(null)
  const [result, setResult] = useState<{ receiptId: string; lotId: string; allocId: string } | null>(null)

  const [growerId, setGrowerId] = useState('')
  const [allocationId, setAllocationId] = useState('')
  const [date, setDate] = useState(today())
  const [boxes, setBoxes] = useState('')
  const [variety, setVariety] = useState(VARIETIES[0])
  const [grade, setGrade] = useState('A')
  const [weight, setWeight] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [chamberId, setChamberId] = useState('')
  const [rack, setRack] = useState('1')
  const [notes, setNotes] = useState('')
  const [destination, setDestination] = useState('')
  const [sourceLocation, setSourceLocation] = useState('')
  const [remark, setRemark] = useState('')
  const [override, setOverride] = useState(false)
  const [error, setError] = useState('')

  const gName = useMemo(() => new Map(growers.map((g) => [g.id, g.name])), [growers])
  const allocById = useMemo(() => new Map(allocations.map((a) => [a.id, a])), [allocations])
  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots])
  const chambers = d.store.chambers
  const locations = useStore((s) => s.settings.locations)
  const chamberStat = chambers.find((c) => c.chamber.id === chamberId)

  const openForm = (gid = '', aid = '') => {
    const al = aid ? allocById.get(aid) : undefined
    setGrowerId(al ? al.growerId : gid)
    setAllocationId(aid)
    setBoxes(''); setNotes(''); setVehicle(''); setDriver(''); setWeight(''); setRack('1')
    setSourceLocation(''); setRemark(''); setDestination(locations.sites[0] ?? '')
    setOverride(false); setError(''); setDate(today())
    if (al) {
      const rq = useStore.getState().requests.find((r) => r.id === al.requestId)
      if (rq?.variety && VARIETIES.includes(rq.variety)) setVariety(rq.variety)
    }
    setChamberId('') // '' = auto-assign
    setFormOpen(true)
  }

  useEffect(() => {
    const a = params.get('allocation')
    if (a && allocById.has(a)) openForm('', a)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const growersWithAlloc = growers.filter((g) => allocations.some((a) => a.growerId === g.id))
  const growerAllocs = allocations.filter((a) => a.growerId === growerId)
  const st = allocationId ? d.allocStats.get(allocationId) : undefined
  const q = Number(boxes) || 0
  const exceeds = !!st && q > st.awaitingReturn
  const selAlloc = allocationId ? allocById.get(allocationId) : undefined
  const estCharge = selAlloc && q > 0 ? estimateCharge(q, 30, selAlloc.rateType, selAlloc.rate) : 0
  const chamberText = (id: string) => id || 'Unassigned'

  const list = useMemo(
    () =>
      [...receipts]
        .filter((r) => (!dateFilter || r.receivedDate === today()) && (!growerFilter || r.growerId === growerFilter))
        .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate) || b.code.localeCompare(a.code)),
    [receipts, dateFilter, growerFilter],
  )
  const totalBoxes = list.reduce((s, r) => s + r.boxes, 0)

  const receiptDoc = (r: AppleReceipt): DocSpec => {
    const lot = lotById.get(r.lotId)
    return {
      title: 'Apple Inward Receipt',
      code: r.code,
      date: fmtDate(r.receivedDate),
      rows: [
        ['Grower', gName.get(r.growerId) ?? '—'],
        ['Allocation', allocById.get(r.allocationId)?.code ?? '—'],
        ['Lot', lot?.code ?? '—'],
        ['Boxes received', num(r.boxes)],
        ['Variety / grade', `${r.variety} · Grade ${r.grade}`],
        ['Approx. weight', r.weightKg ? `${num(r.weightKg)} kg` : '—'],
        ['Chamber / rack', r.chamberId ? `${r.chamberId} · from R${String(r.rackStart).padStart(2, '0')}` : 'Unassigned'],
        ['Destination', r.destination || '—'],
        ['Received from', r.sourceLocation || '—'],
        ['Remark', r.remark || '—'],
        ['Vehicle / driver', [r.vehicle, r.driver].filter(Boolean).join(' · ') || '—'],
        ['Storage starts', fmtDate(lot?.storageStartDate)],
        ...(r.override ? ([['Note', 'Manager override: received above issued boxes']] as [string, string][]) : []),
      ],
      footer: 'Storage period and charges start from the arrival date',
    }
  }

  const submit = () => {
    setError('')
    if (!growerId) return setError('Select a grower')
    if (!allocationId) return setError('Select an allocation')
    if (!Number.isInteger(q) || q <= 0) return setError('Enter a whole number of boxes received')
    const rk = Number(rack)
    if (chamberId && (!Number.isInteger(rk) || rk < 1 || (chamberStat && rk > chamberStat.chamber.racks)))
      return setError(`Starting rack must be between 1 and ${chamberStat?.chamber.racks ?? 1}`)
    if (exceeds && !override) return setError('Boxes exceed issued boxes awaiting return. A manager override is required.')
    const res = receiveApples({
      allocationId, boxes: q, variety, grade, weightKg: Number(weight) || undefined, date,
      vehicle: vehicle.trim() || undefined, driver: driver.trim() || undefined, chamberId: chamberId || undefined, rackStart: chamberId ? rk : undefined,
      destination: destination.trim() || undefined, sourceLocation: sourceLocation.trim() || undefined, remark: remark.trim() || undefined,
      notes: notes.trim() || undefined, override: exceeds ? override : undefined,
    })
    if (!res.ok) {
      setError(res.error ?? 'Could not record receipt')
      toast(res.error ?? 'Could not record receipt', 'error')
      return
    }
    const lot = useStore.getState().lots.find((l) => l.id === res.id)!
    toast(`${num(q)} boxes received as ${lot.code}`)
    setFormOpen(false)
    setResult({ receiptId: lot.receiptId, lotId: lot.id, allocId: allocationId })
  }

  const resultReceipt = result ? receipts.find((r) => r.id === result.receiptId) : undefined
  const resultLot = result ? d.lotById.get(result.lotId) : undefined
  const resultStats = result ? d.allocStats.get(result.allocId) : undefined

  return (
    <div className="page">
      <PageHeader
        title="Apple Receipts"
        sub="Inward entries — each receipt creates a lot and starts the storage clock"
        actions={<Button variant="primary" icon={<PackageCheck />} onClick={() => openForm(growerFilter)}>Receive apples</Button>}
      />

      <Card
        pad={false}
        title={dateFilter ? "Today's receipts" : 'All receipts'}
        sub={`${list.length} receipts · ${num(totalBoxes)} boxes`}
        action={
          <div className="row wrap">
            <Select className="sm" style={{ width: 170 }} value={growerFilter} aria-label="Grower"
              onChange={(e) => setParams((p) => { e.target.value ? p.set('grower', e.target.value) : p.delete('grower'); return p }, { replace: true })}>
              <option value="">All growers</option>
              {growersWithAlloc.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Select className="sm" style={{ width: 130 }} value={dateFilter ? 'today' : 'all'} aria-label="Date"
              onChange={(e) => setParams((p) => { e.target.value === 'today' ? p.set('date', 'today') : p.delete('date'); return p }, { replace: true })}>
              <option value="all">All dates</option>
              <option value="today">Today</option>
            </Select>
            {(dateFilter || growerFilter) && <Button size="sm" variant="ghost" icon={<X />} onClick={() => setParams({}, { replace: true })}>Clear</Button>}
          </div>
        }
      >
        {list.length === 0 ? (
          <EmptyState title="No receipts found" text={dateFilter ? 'No apples have arrived today yet.' : 'Receive the first consignment to create a lot.'}
            action={<Button variant="primary" onClick={() => openForm(growerFilter)}>Receive apples</Button>} />
        ) : (
          <TableWrap>
            <thead>
              <tr><th>Receipt</th><th>Date</th><th>Grower</th><th>Lot</th><th className="r">Boxes</th><th>Variety</th><th>Grade</th><th>Chamber</th><th>Destination</th><th>Driver</th><th>Remark</th><th>Vehicle</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.code}</td>
                  <td>{fmtDate(r.receivedDate)}</td>
                  <td className="strong">{gName.get(r.growerId)}<span className="rcp-sub">{allocById.get(r.allocationId)?.code}</span></td>
                  <td><Link className="link mono" to={`/admin/inventory/${r.lotId}`}>{lotById.get(r.lotId)?.code ?? '—'}</Link></td>
                  <td className="r num">{num(r.boxes)}{r.override && <span className="rcp-sub" style={{ color: 'var(--amber)' }}>override</span>}</td>
                  <td>{r.variety}</td>
                  <td>{r.grade}</td>
                  <td>{r.chamberId ? r.chamberId : <span className="pill amber">Unassigned</span>}</td>
                  <td>{r.destination || '—'}{r.sourceLocation && <span className="rcp-sub">from {r.sourceLocation}</span>}</td>
                  <td>{r.driver || '—'}</td>
                  <td>{r.remark || '—'}</td>
                  <td>{r.vehicle || '—'}</td>
                  <td className="r"><Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setDoc(receiptDoc(r))}>Receipt</Button></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        wide
        title="Receive apples"
        footer={<>
          <Button onClick={() => setFormOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Receive &amp; create lot</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="Grower">
            <Select value={growerId} onChange={(e) => { setGrowerId(e.target.value); setAllocationId(''); setOverride(false) }}>
              <option value="">Select grower…</option>
              {growersWithAlloc.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.village}</option>)}
            </Select>
          </Field>
          <Field label="Allocation">
            <Select value={allocationId} disabled={!growerId} onChange={(e) => { setAllocationId(e.target.value); setOverride(false) }}>
              <option value="">{growerId ? 'Select allocation…' : 'Select a grower first'}</option>
              {growerAllocs.map((a) => <option key={a.id} value={a.id}>{a.code} · {num(d.allocStats.get(a.id)?.awaitingReturn ?? 0)} awaiting return</option>)}
            </Select>
          </Field>
          {st && (
            <div className="full rcp-live">
              <div><small>Allocated</small><b>{num(st.allocated)}</b></div>
              <div><small>Issued</small><b>{num(st.issued)}</b></div>
              <div><small>Returned</small><b>{num(st.received)}</b></div>
              <div className="hot"><small>Awaiting return</small><b>{num(st.awaitingReturn)}</b></div>
            </div>
          )}
          <Field label="Arrival date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Boxes received"><Input type="number" min={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} placeholder="e.g. 400" /></Field>
          {st && exceeds && q > 0 && (
            <div className="full">
              <Alert kind="warning">
                <div>
                  Receiving {num(q)} boxes but only {num(st.awaitingReturn)} issued boxes are awaiting return.
                  {isManager ? (
                    <label className="rcp-override">
                      <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                      Override: accept {num(q - st.awaitingReturn)} boxes above issued
                    </label>
                  ) : (
                    <div style={{ marginTop: 4 }}>A manager override is required to continue.</div>
                  )}
                </div>
              </Alert>
            </div>
          )}
          <Field label="Variety">
            <Select value={variety} onChange={(e) => setVariety(e.target.value)}>
              {!VARIETIES.includes(variety) && <option>{variety}</option>}
              {VARIETIES.map((v) => <option key={v}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Grade">
            <Select value={grade} onChange={(e) => setGrade(e.target.value)}>{GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}</Select>
          </Field>
          <Field label="Approx. weight (kg)" hint="Optional"><Input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
          <Field label="Vehicle"><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="JK01 AB 1234" /></Field>
          <Field label="Driver"><Input value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
          <Field label="Destination site">
            <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">—</option>
              {locations.sites.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field label="Received from (pickup)" hint="Pick or type a new one">
            <Input list="rcp-pickups" value={sourceLocation} onChange={(e) => setSourceLocation(e.target.value)} placeholder="e.g. Sumbal" />
            <datalist id="rcp-pickups">{locations.pickupPoints.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Remark" full><Input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Variety / weight notes" /></Field>
          {selAlloc && (
            <div className="full rcp-live">
              <div><small>Agreement rate</small><b>{rateLabel(selAlloc.rateType, selAlloc.rate)}</b></div>
              <div className="hot">
                <small>{selAlloc.rateType === 'PER_CRATE' ? `Estimated charge · ${num(q)} × ₹${selAlloc.rate} flat` : 'Estimated charge · 30-day preview'}</small>
                <b>{q > 0 ? inr(estCharge) : '—'}</b>
              </div>
            </div>
          )}
          <Field label="Chamber" hint={chamberStat ? `${num(chamberStat.available)} boxes free of ${num(chamberStat.chamber.capacity)}` : 'Emptiest chamber with room is chosen on save'}>
            <Select value={chamberId} onChange={(e) => setChamberId(e.target.value)}>
              <option value="">Auto-assign (emptiest chamber)</option>
              {chambers.map((c) => <option key={c.chamber.id} value={c.chamber.id}>{c.chamber.id} · {num(c.available)} free</option>)}
            </Select>
          </Field>
          <Field label="Starting rack" hint={chamberStat ? `Racks 1–${chamberStat.chamber.racks}` : 'Set automatically'}>
            <Input type="number" min={1} max={chamberStat?.chamber.racks} disabled={!chamberId} value={rack} onChange={(e) => setRack(e.target.value)} />
          </Field>
          <Field label="Notes" full><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition on arrival, packing, remarks" /></Field>
          {error && <div className="full"><Alert kind="error">{error}</Alert></div>}
        </div>
      </Modal>

      <Modal
        open={!!result}
        onClose={() => setResult(null)}
        title="Apples received"
        footer={<>
          <Button onClick={() => setResult(null)}>Done</Button>
          <Button variant="primary" onClick={() => resultReceipt && setDoc(receiptDoc(resultReceipt))}>View inward receipt</Button>
        </>}
      >
        {resultLot && resultStats && (
          <>
            <div className="rcp-lot">
              <QrCode value={resultLot.code} size={72} />
              <div>
                <div className="muted">Lot created</div>
                <Link className="code link" to={`/admin/inventory/${resultLot.id}`} onClick={() => setResult(null)}>{resultLot.code}</Link>
                <div className="muted">{num(resultLot.boxesReceived)} boxes · {chamberText(resultLot.chamberId)}{resultLot.chamberId ? ` · ${resultLot.rackLabel}` : ''}</div>
              </div>
            </div>
            <div className="rcp-result">
              <div className="rcp-result-stats">
                <div><small>Issued</small><b>{num(resultStats.issued)}</b></div>
                <div><small>Returned (received)</small><b>{num(resultStats.received)}</b></div>
                <div><small>Still outstanding</small><b style={resultStats.awaitingReturn > 0 ? { color: 'var(--amber)' } : undefined}>{num(resultStats.awaitingReturn)}</b></div>
                <div><small>Stored in this lot</small><b>{num(resultLot.current)}</b></div>
              </div>
            </div>
          </>
        )}
      </Modal>

      <DocPreview open={!!doc} onClose={() => setDoc(null)} doc={doc} />
    </div>
  )
}
