import { useMemo, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { useStore } from '../../core/store'
import { buildLedger } from '../../core/calc'
import { fmtDate, inr, today } from '../../core/format'
import { Button, DocPreview, EmptyState, Field, Input, Modal, toast, type DocSpec } from '../../ui'
import { paymentDoc, useMe } from './shared'

export default function GrowerPaymentsPage() {
  const { gid, grower, stats } = useMe()
  const state = useStore((s) => s)
  const recordPayment = useStore((s) => s.recordPayment)
  const [doc, setDoc] = useState<DocSpec | null>(null)
  const [pay, setPay] = useState(false)
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')

  const ledger = useMemo(() => buildLedger(state, gid).reverse(), [state, gid])
  const payments = useMemo(
    () => state.payments.filter((p) => p.growerId === gid).sort((a, b) => b.date.localeCompare(a.date)),
    [state.payments, gid],
  )
  const due = Math.max(0, Math.round(stats.due))

  const openPay = () => { setAmount(due > 0 ? String(due) : ''); setErr(''); setPay(true) }
  const submit = () => {
    const amt = Number(amount)
    if (!(amt > 0)) return setErr('Enter an amount')
    const res = recordPayment({
      growerId: gid, amount: amt, date: today(), method: 'UPI', reference: `UPI${Date.now().toString().slice(-9)}`,
      notes: 'Paid from grower app (mock UPI)',
    })
    if (!res.ok) return setErr(res.error ?? 'Payment failed')
    toast(`Payment of ${inr(amt)} recorded`)
    setPay(false)
  }

  return (
    <>
      <div className="ga-head"><h1>Payments</h1></div>

      <div className="ga-money">
        <div><small>Charges</small><b>{inr(stats.charges)}</b></div>
        <div><small>Paid</small><b>{inr(stats.paid)}</b></div>
        <div className={due > 0 ? 'due' : 'clear'}><small>Due</small><b>{inr(due)}</b></div>
      </div>
      <Button variant="primary" size="lg" block onClick={openPay} disabled={due <= 0 && stats.charges <= 0}>
        {due > 0 ? `Make payment · ${inr(due)}` : 'Make payment'}
      </Button>

      <div className="m-section">Ledger</div>
      {ledger.length === 0 ? (
        <EmptyState title="No entries yet" text="Charges start once your apples are in storage." />
      ) : (
        <div className="ga-card" style={{ padding: '4px 14px' }}>
          {ledger.map((r) => (
            <div className="ga-ledger" key={r.id}>
              <div style={{ minWidth: 0 }}>
                {r.description}
                <small>{fmtDate(r.date)}{r.ref ? ` · ${r.ref}` : ''}</small>
              </div>
              <div className={`amt ${r.kind === 'PAYMENT' ? 'cr' : ''}`}>
                {r.kind === 'PAYMENT' ? '−' : '+'}{inr(r.kind === 'PAYMENT' ? r.credit : r.debit)}
                <small>Bal {inr(r.balance)}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="m-section">Payment history</div>
      {payments.length === 0 ? (
        <div className="m-list-item muted">No payments recorded yet.</div>
      ) : (
        <div className="ga-list">
          {payments.map((p) => (
            <button key={p.id} className="m-list-item ga-item" onClick={() => setDoc(paymentDoc(p, grower?.name ?? ''))}>
              <div className="grow"><b>{inr(p.amount)}</b><span>{p.method}{p.reference ? ` · ${p.reference}` : ''}</span></div>
              <div className="end"><span className="muted" style={{ fontSize: 12.5 }}>{fmtDate(p.date)}</span><span className="link" style={{ fontSize: 12 }}>Receipt</span></div>
            </button>
          ))}
        </div>
      )}

      <Modal open={pay} onClose={() => setPay(false)} title="Make payment"
        footer={<><Button size="lg" onClick={() => setPay(false)}>Cancel</Button><Button variant="primary" size="lg" onClick={submit}>Pay with UPI</Button></>}>
        <div className="ga-form">
          <div className="ga-sheet-total"><span className="muted">Outstanding</span><br /><b>{inr(due)}</b></div>
          <Field label="Amount to pay (₹)" error={err}>
            <Input type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="ga-upi">
            <Smartphone />
            <b>UPI payment (demo)</b>
            <span className="muted" style={{ fontSize: 12.5 }}>No real transaction happens. Tapping Pay records the payment with a mock UPI reference.</span>
          </div>
        </div>
      </Modal>

      <DocPreview open={!!doc} doc={doc} onClose={() => setDoc(null)} />
    </>
  )
}
