import { useMemo, useState } from 'react'
import { Lock, RotateCcw } from 'lucide-react'
import { Alert, Button, Card, Field, Input, Modal, PageHeader, Select, toast } from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { estimateCharge } from '../../core/calc'
import { inr, num, rateLabel } from '../../core/format'
import type { RateType } from '../../core/types'
import './settings.css'

type Model = RateType | 'CUSTOM'
const MODELS: { id: Model; label: string; hint: string }[] = [
  { id: 'PER_DAY', label: 'Per box / day', hint: 'Charged for every day a box is in the store' },
  { id: 'PER_MONTH', label: 'Per box / month', hint: 'Pro-rated per 30-day cycle' },
  { id: 'PER_SEASON', label: 'Per box / season', hint: 'One flat charge per box received' },
  { id: 'CUSTOM', label: 'Custom rate', hint: 'Choose the billing basis yourself' },
]
const basisWord = (t: RateType) => (t === 'PER_DAY' ? 'day' : t === 'PER_MONTH' ? 'month' : 'season')

const PERMISSIONS: { label: string; def: boolean }[] = [
  { label: 'Register growers', def: true },
  { label: 'Approve storage requests', def: false },
  { label: 'Issue empty boxes', def: true },
  { label: 'Receive apples', def: true },
  { label: 'Approve dispatch', def: false },
  { label: 'Record payments', def: false },
  { label: 'View ledger and charges', def: false },
  { label: 'View reports', def: false },
  { label: 'Change storage rate and settings', def: false },
]

export default function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const lots = useStore((s) => s.lots)
  const updateSettings = useStore((s) => s.updateSettings)
  const resetDemo = useStore((s) => s.resetDemo)
  const d = useDerived()

  /* pricing */
  const [model, setModel] = useState<Model>(settings.rateType)
  const [basis, setBasis] = useState<RateType>(settings.rateType)
  const [rate, setRate] = useState(String(settings.rate))
  const [apply, setApply] = useState(false)
  const [previewBoxes, setPreviewBoxes] = useState('2000')

  const rateType: RateType = model === 'CUSTOM' ? basis : model
  const rateNum = Number(rate)
  const rateOk = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum >= 0
  const boxes = Math.max(0, Number(previewBoxes) || 0)
  const dirty = rateType !== settings.rateType || (rateOk && rateNum !== settings.rate)
  const lotsAffected = lots.length

  const preview = useMemo(
    () => [30, 90].map((days) => ({ days, charge: estimateCharge(boxes, days, rateType, rateOk ? rateNum : 0) })),
    [boxes, rateType, rateNum, rateOk],
  )

  const savePricing = () => {
    if (!rateOk) return toast('Enter a valid rate', 'error')
    const res = updateSettings({ rateType, rate: rateNum }, apply)
    if (!res.ok) return toast(res.error ?? 'Could not save pricing', 'error')
    toast(apply ? `Rate updated and applied to ${num(lotsAffected)} existing lots` : 'Rate updated for new lots')
    setApply(false)
  }

  /* store details */
  const [name, setName] = useState(settings.storeName)
  const [season, setSeason] = useState(settings.season)
  const [capacity, setCapacity] = useState(String(settings.capacity))
  const occupied = d.store.stored + d.store.reserved
  const capNum = Number(capacity)
  const capErr = !(capNum > 0) ? 'Enter the total capacity in boxes'
    : capNum < occupied ? `Capacity cannot be below ${num(occupied)} boxes (stored + reserved)` : undefined
  const detailsDirty = name !== settings.storeName || season !== settings.season || capNum !== settings.capacity

  const saveDetails = () => {
    if (!name.trim()) return toast('Store name is required', 'error')
    if (capErr) return toast(capErr, 'error')
    const res = updateSettings({ storeName: name.trim(), season: season.trim(), capacity: Math.round(capNum) })
    if (!res.ok) return toast(res.error ?? 'Could not save details', 'error')
    toast('Store details saved')
  }

  /* permissions (visual only) */
  const [perm, setPerm] = useState<Record<string, boolean>>(() => Object.fromEntries(PERMISSIONS.map((p) => [p.label, p.def])))

  /* reset */
  const [confirmReset, setConfirmReset] = useState(false)
  const doReset = () => {
    resetDemo()
    setConfirmReset(false)
    setModel(useStore.getState().settings.rateType)
    setBasis(useStore.getState().settings.rateType)
    setRate(String(useStore.getState().settings.rate))
    const s = useStore.getState().settings
    setName(s.storeName); setSeason(s.season); setCapacity(String(s.capacity))
    toast('Demo data reset to the original sample set')
  }

  return (
    <div className="page set-page">
      <PageHeader title="Settings" sub="Storage pricing, store details and access" />

      <div className="set-grid">
        <Card
          title="Storage pricing"
          sub={<>Current rate: <b>{rateLabel(settings.rateType, settings.rate)}</b></>}
          action={<button className="btn primary" disabled={!dirty || !rateOk} onClick={savePricing}>Save pricing</button>}
        >
          <div className="stack">
            <div className="set-radios" role="radiogroup" aria-label="Billing model">
              {MODELS.map((m) => (
                <label key={m.id} className={`set-radio ${model === m.id ? 'on' : ''}`}>
                  <input type="radio" name="billing" checked={model === m.id} onChange={() => setModel(m.id)} />
                  <span><b>{m.label}</b><small>{m.hint}</small></span>
                </label>
              ))}
            </div>

            <div className="form-grid">
              {model === 'CUSTOM' && (
                <Field label="Billing basis">
                  <Select value={basis} onChange={(e) => setBasis(e.target.value as RateType)}>
                    <option value="PER_DAY">Per box / day</option>
                    <option value="PER_MONTH">Per box / month</option>
                    <option value="PER_SEASON">Per box / season</option>
                  </Select>
                </Field>
              )}
              <Field label={`Rate (₹ per box per ${basisWord(rateType)})`} error={rateOk ? undefined : 'Enter a valid rate'}>
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              </Field>
            </div>

            <label className="set-check">
              <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
              <span>
                Apply to existing lots
                <small>{apply ? `All ${num(lotsAffected)} lots, including stored ones, will be re-priced.` : 'Off: only lots received from now on use the new rate. Existing lots keep their own rate.'}</small>
              </span>
            </label>

            <div className="set-preview">
              <div className="set-preview-head">
                <span>Charge preview</span>
                <label className="set-preview-boxes">
                  <Input type="number" className="sm" min={0} value={previewBoxes} onChange={(e) => setPreviewBoxes(e.target.value)} aria-label="Boxes for preview" /> boxes
                </label>
              </div>
              {rateType === 'PER_SEASON' ? (
                <div className="set-preview-row">
                  <span>{num(boxes)} boxes × {inr(rateOk ? rateNum : 0)} per season</span>
                  <b className="num">{inr(preview[0].charge)}</b>
                </div>
              ) : (
                preview.map((p) => (
                  <div className="set-preview-row" key={p.days}>
                    <span>{num(boxes)} boxes × {p.days} days</span>
                    <b className="num">{inr(p.charge)}</b>
                  </div>
                ))
              )}
              <div className="muted set-preview-note">Estimate at {rateLabel(rateType, rateOk ? rateNum : 0)}. Actual charges depend on each lot's dispatch dates.</div>
            </div>
          </div>
        </Card>

        <Card title="Store details" action={<button className="btn primary" disabled={!detailsDirty} onClick={saveDetails}>Save details</button>}>
          <div className="stack">
            <Field label="Store name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="form-grid">
              <Field label="Season"><Input value={season} onChange={(e) => setSeason(e.target.value)} /></Field>
              <Field label="Total capacity (boxes)" error={capErr} hint={`Stored ${num(d.store.stored)} · reserved ${num(d.store.reserved)}`}>
                <Input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </Field>
            </div>
            <dl className="kv">
              <dt>Currency</dt><dd>{settings.currency}</dd>
              <dt>Chambers</dt><dd>{d.store.chambers.length} · {num(d.store.chambers.reduce((s, c) => s + c.chamber.capacity, 0))} boxes of rack space</dd>
            </dl>
          </div>
        </Card>
      </div>

      <Card
        title="Staff permissions"
        sub="Preview only. Toggles are not enforced in this POC."
        pad={false}
        className="set-card"
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Action</th><th className="r">Manager</th><th className="r">Staff</th></tr></thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="r"><span className="set-locked"><Lock />Always</span></td>
                  <td className="r">
                    <label className="set-switch">
                      <input type="checkbox" checked={perm[p.label]} onChange={(e) => setPerm({ ...perm, [p.label]: e.target.checked })} aria-label={`Staff: ${p.label}`} />
                      <span />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="set-grid">
        <Card title="About this POC">
          <ul className="set-notes">
            <li>Frontend-only proof of concept. Data lives in this browser (local storage) and is seeded with sample growers, lots and payments.</li>
            <li>All stock, capacity and charge figures come from one calculation layer, so every screen shows the same numbers.</li>
            <li>Business rules enforced: allocation within free capacity, issue within allocation, receipt within issued boxes (manager override), dispatch within lot stock.</li>
            <li>PDF and Excel exports, SMS and WhatsApp alerts, and permission enforcement are placeholders.</li>
          </ul>
        </Card>
        <Card title="Demo data" sub="Start over with the original sample data">
          <div className="stack">
            <p className="muted">Resetting removes every grower, request, receipt, dispatch and payment you added and restores the rate and store details above to their defaults.</p>
            <div><Button variant="danger" icon={<RotateCcw />} onClick={() => setConfirmReset(true)}>Reset demo data</Button></div>
          </div>
        </Card>
      </div>

      <Modal
        open={confirmReset}
        title="Reset demo data?"
        onClose={() => setConfirmReset(false)}
        footer={<>
          <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          <Button variant="danger" onClick={doReset}>Yes, reset everything</Button>
        </>}
      >
        <Alert kind="warning">This cannot be undone. All changes you have made in this browser will be replaced by the sample data set.</Alert>
      </Modal>
    </div>
  )
}
