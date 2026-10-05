import { useState } from 'react'
import { Clock } from 'lucide-react'
import { useStore } from '../../core/store'
import { requestStatusLabel } from '../../core/calc'
import { addDays, fmtDate, fmtDateShort, num, today } from '../../core/format'
import { Button, EmptyState, Field, Input, Select, StatusPill, Textarea, toast } from '../../ui'
import { useMe } from './shared'

const VARIETIES = ['Royal Delicious', 'American Delicious', 'Red Delicious', 'Golden Delicious', 'Kullu Delicious', 'Gala', 'Kashmiri Ambri', 'Other']

export default function GrowerRequestPage() {
  const { gid, grower, active } = useMe()
  const allRequests = useStore((s) => s.requests)
  const createRequest = useStore((s) => s.createRequest)
  const mine = allRequests.filter((r) => r.growerId === gid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const blank = {
    boxes: '', apples: '', start: addDays(today(), 7), end: addDays(today(), 21), preferred: '',
    months: '6', variety: VARIETIES[0], notes: '',
  }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }))

  const submit = () => {
    const e: Record<string, string> = {}
    if (!(Number(f.boxes) > 0)) e.boxes = 'Enter the boxes you need'
    if (!f.start) e.start = 'Required'
    if (!f.end) e.end = 'Required'
    else if (f.end < f.start) e.end = 'Must be after arrival start'
    if (!(Number(f.months) > 0)) e.months = 'Enter duration in months'
    setErrors(e)
    if (Object.keys(e).length) return
    const res = createRequest({
      growerId: gid, requestedBoxes: Number(f.boxes), expectedApples: f.apples ? Number(f.apples) : undefined,
      arrivalStart: f.start, arrivalEnd: f.end, preferredStart: f.preferred || undefined,
      durationMonths: Number(f.months), variety: f.variety, notes: f.notes.trim() || undefined,
    })
    if (!res.ok) return toast(res.error ?? 'Could not submit request', 'error')
    toast('Storage request submitted')
    setF(blank)
  }

  return (
    <>
      <div className="ga-head"><h1>Request storage</h1></div>

      {!active ? (
        <div className="ga-banner">
          <Clock />
          <div><b>{grower?.status === 'PENDING' ? 'Awaiting approval' : 'Account not active'}</b><br />
            {grower?.status === 'PENDING' ? 'Storage requests open once the store approves your registration.' : 'Please contact the store to reactivate your account.'}</div>
        </div>
      ) : null}

      <div className="ga-card">
        <fieldset disabled={!active} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="ga-form">
            <div className="ga-two">
              <Field label="Boxes required" error={errors.boxes}>
                <Input type="number" inputMode="numeric" min={1} value={f.boxes} onChange={(e) => set('boxes', e.target.value)} />
              </Field>
              <Field label="Expected apples (boxes)">
                <Input type="number" inputMode="numeric" min={0} value={f.apples} onChange={(e) => set('apples', e.target.value)} />
              </Field>
            </div>
            <div className="ga-two">
              <Field label="Arrival from" error={errors.start}><Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
              <Field label="Arrival to" error={errors.end}><Input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} /></Field>
            </div>
            <div className="ga-two">
              <Field label="Preferred start"><Input type="date" value={f.preferred} onChange={(e) => set('preferred', e.target.value)} /></Field>
              <Field label="Duration (months)" error={errors.months}>
                <Input type="number" inputMode="numeric" min={1} max={12} value={f.months} onChange={(e) => set('months', e.target.value)} />
              </Field>
            </div>
            <Field label="Variety">
              <Select value={f.variety} onChange={(e) => set('variety', e.target.value)}>
                {VARIETIES.map((v) => <option key={v}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Notes"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the store should know" /></Field>
            <Button variant="primary" size="lg" block onClick={submit} disabled={!active}>Submit request</Button>
          </div>
        </fieldset>
      </div>

      <div className="m-section">My requests</div>
      {mine.length === 0 ? (
        <EmptyState title="No requests yet" text="Submitted requests and their approval status appear here." />
      ) : (
        <div className="ga-list">
          {mine.map((r) => (
            <div key={r.id} className="m-list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <b>{r.code}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {num(r.requestedBoxes)} boxes · {r.variety} · {r.durationMonths} mo<br />
                  Arrival {fmtDateShort(r.arrivalStart)} to {fmtDate(r.arrivalEnd)}
                  {r.allocatedBoxes > 0 && <><br />{num(r.allocatedBoxes)} boxes allocated</>}
                </div>
              </div>
              <StatusPill status={r.status} label={requestStatusLabel[r.status]} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
