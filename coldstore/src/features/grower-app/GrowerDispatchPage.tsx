import { useState } from 'react'
import { useStore } from '../../core/store'
import { fmtDate, num } from '../../core/format'
import { Button, DocPreview, EmptyState, Field, Input, Select, StatusPill, Textarea, toast, type DocSpec } from '../../ui'
import { gatePassDoc, useMe } from './shared'

export default function GrowerDispatchPage() {
  const { gid, grower, lots, dv } = useMe()
  const dispatches = useStore((s) => s.dispatches)
  const requestDispatch = useStore((s) => s.requestDispatch)
  const mine = dispatches.filter((d) => d.growerId === gid).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))

  const avail = lots.filter((l) => l.current - l.pendingDispatch > 0)
  const [lotId, setLotId] = useState('')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [doc, setDoc] = useState<DocSpec | null>(null)

  const lot = avail.find((l) => l.id === lotId)
  const free = lot ? lot.current - lot.pendingDispatch : 0

  const submit = () => {
    if (!lot) return setErr('Select a lot')
    const q = Number(qty)
    if (!(q > 0)) return setErr('Enter the number of boxes')
    if (q > free) return setErr(`Only ${num(free)} boxes are available for dispatch from ${lot.code}`)
    const res = requestDispatch(gid, lot.id, q, notes.trim() || undefined)
    if (!res.ok) return setErr(res.error ?? 'Could not submit')
    setErr(''); setQty(''); setNotes(''); setLotId('')
    toast('Dispatch request sent to the store')
  }

  return (
    <>
      <div className="ga-head"><h1>Request dispatch</h1></div>

      <div className="ga-card">
        {avail.length === 0 ? (
          <div className="muted">You have no boxes available for dispatch right now.</div>
        ) : (
          <div className="ga-form">
            <Field label="Lot">
              <Select value={lotId} onChange={(e) => { setLotId(e.target.value); setQty(''); setErr('') }}>
                <option value="">Select lot…</option>
                {avail.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.variety} · {num(l.current - l.pendingDispatch)} boxes</option>)}
              </Select>
            </Field>
            <Field label="Boxes to dispatch" error={err}
              hint={lot ? `${num(free)} available${lot.pendingDispatch ? ` (${num(lot.pendingDispatch)} already requested)` : ''}` : undefined}>
              <Input type="number" inputMode="numeric" min={1} max={free || undefined} value={qty} disabled={!lot}
                onChange={(e) => { setQty(e.target.value); setErr('') }} />
            </Field>
            {lot && (
              <Button size="sm" onClick={() => setQty(String(free))}>Dispatch all {num(free)}</Button>
            )}
            <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Vehicle, pickup time, buyer…" /></Field>
            <Button variant="primary" size="lg" block onClick={submit}>Send request</Button>
          </div>
        )}
      </div>

      <div className="m-section">My dispatch requests</div>
      {mine.length === 0 ? (
        <EmptyState title="No dispatch requests" text="Requests you send will be tracked here until the store releases them." />
      ) : (
        <div className="ga-list">
          {mine.map((d) => {
            const l = dv.lotById.get(d.lotId)
            return (
              <div key={d.id} className="ga-card" style={{ gap: 8 }}>
                <div className="ga-card-head">
                  <div><b>{d.code}</b><div className="muted" style={{ fontSize: 12.5 }}>{l?.code ?? '—'} · {num(d.quantity)} boxes</div></div>
                  <StatusPill status={d.status} label={d.status === 'PENDING' ? 'Awaiting store' : undefined} />
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Requested {fmtDate(d.requestedAt)}{d.completedDate ? ` · Released ${fmtDate(d.completedDate)}` : ''}
                </div>
                {d.status === 'COMPLETED' && (
                  <Button size="sm" onClick={() => setDoc(gatePassDoc(d, l, grower?.name ?? ''))}>View gate pass</Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <DocPreview open={!!doc} doc={doc} onClose={() => setDoc(null)} />
    </>
  )
}
