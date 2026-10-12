import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, Plus, Receipt, X } from 'lucide-react'
import {
  Alert, Button, Card, Chips, DocPreview, EmptyState, Field, Input, Kpi, Modal, PageHeader, Select, StatusPill,
  TableWrap, Textarea, toast, type DocSpec,
} from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { fmtDate, inr, rateLabel, today } from '../../core/format'
import { buildTradeRows } from '../../core/calc'
import type { Payment, PayMethod } from '../../core/types'
import './payments.css'

export const METHOD_LABEL: Record<PayMethod, string> = {
  CASH: 'Cash', UPI: 'UPI', BANK: 'Bank Transfer', CHEQUE: 'Cheque', OTHER: 'Other',
}

type Filter = 'all' | 'due' | 'partial' | 'paid' | 'advance'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'due', label: 'Due' }, { id: 'partial', label: 'Partial' }, { id: 'paid', label: 'Paid' },
  { id: 'advance', label: 'Advance' },
]

export const payStatus = (paid: number, due: number): 'Paid' | 'Partial' | 'Pending' | 'Advance' =>
  due < -1 ? 'Advance' : due <= 1 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'

export default function PaymentsPage() {
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const payments = useStore((s) => s.payments)
  const allocations = useStore((s) => s.allocations)
  const data = useStore((s) => s)
  const trade = useMemo(() => buildTradeRows(data, d), [data, d])
  const recordPayment = useStore((s) => s.recordPayment)
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()

  const rawStatus = sp.get('status') as Filter | null
  const status: Filter = rawStatus && FILTERS.some((f) => f.id === rawStatus) ? rawStatus : 'all'
  const growerFilter = sp.get('grower') ?? ''

  const [modal, setModal] = useState(false)
  const [receipt, setReceipt] = useState<Payment | null>(null)
  const [afterSave, setAfterSave] = useState<Payment | null>(null)
  const [form, setForm] = useState({ growerId: '', allocationId: '', amount: '', date: today(), method: 'CASH' as PayMethod, reference: '', notes: '' })
  const [error, setError] = useState('')

  const gName = (id: string) => growers.find((g) => g.id === id)?.name ?? 'Unknown'
  const gCode = (id: string) => growers.find((g) => g.id === id)?.code ?? ''

  const openModal = (growerId = '') => {
    setForm({ growerId, allocationId: '', amount: '', date: today(), method: 'CASH', reference: '', notes: '' })
    setError('')
    setModal(true)
  }

  // auto-open from ?new=1 (prefill ?grower=)
  useEffect(() => {
    if (sp.get('new') === '1') {
      openModal(sp.get('grower') ?? '')
      const next = new URLSearchParams(sp)
      next.delete('new')
      setSp(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setSp(next, { replace: true })
  }

  const rows = useMemo(
    () =>
      growers
        .map((g) => ({ g, s: d.growerStats.get(g.id)! }))
        .filter((r) => r.s && (r.s.charges > 0 || r.s.paid > 0))
        .filter((r) => !growerFilter || r.g.id === growerFilter)
        .filter((r) => {
          if (status === 'due') return r.s.due > 1
          if (status === 'partial') return r.s.paid > 0 && r.s.due > 1
          if (status === 'paid') return r.s.due <= 1 && r.s.due >= -1
          if (status === 'advance') return r.s.due < -1
          return true
        })
        .sort((a, b) => b.s.due - a.s.due),
    [growers, d.growerStats, status, growerFilter],
  )

  const history = useMemo(
    () =>
      payments
        .filter((p) => !growerFilter || p.growerId === growerFilter)
        .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code)),
    [payments, growerFilter],
  )

  const selStats = form.growerId ? d.growerStats.get(form.growerId) : undefined
  const amountNum = Number(form.amount)
  const growerAllocs = form.growerId ? allocations.filter((a) => a.growerId === form.growerId) : []
  const selTrade = form.allocationId ? trade.find((t) => t.allocationId === form.allocationId) : undefined
  const selAlloc = form.allocationId ? allocations.find((a) => a.id === form.allocationId) : undefined
  const allocLabel = (id?: string) => { const a = allocations.find((x) => x.id === id); return a ? (a.externalRef ?? a.code) : '—' }
  /** Signed balance for the scope being paid against: the agreement when one is chosen, else the whole grower. */
  const scopeDue = selTrade ? selTrade.balance : selStats?.due ?? 0

  const submit = () => {
    if (!form.growerId) return setError('Select a grower')
    if (!(amountNum > 0)) return setError('Enter a payment amount greater than zero')
    const res = recordPayment({
      growerId: form.growerId, allocationId: form.allocationId || undefined, amount: amountNum, date: form.date, method: form.method,
      reference: form.reference.trim() || undefined, notes: form.notes.trim() || undefined,
    })
    if (!res.ok) {
      setError(res.error ?? 'Could not record payment')
      toast(res.error ?? 'Could not record payment', 'error')
      return
    }
    toast(`${inr(amountNum)} received from ${gName(form.growerId)}`)
    setModal(false)
    const created = useStore.getState().payments.find((p) => p.id === res.id) ?? null
    setAfterSave(created)
  }

  const receiptDoc = (p: Payment): DocSpec => {
    const st = d.growerStats.get(p.growerId)
    return {
      title: 'Payment Receipt', code: p.code, date: fmtDate(p.date),
      rows: [
        ['Grower', `${gName(p.growerId)} (${gCode(p.growerId)})`],
        ['Amount received', inr(p.amount)],
        ['Payment method', METHOD_LABEL[p.method]],
        ['Reference', p.reference || '—'],
        ['Notes', p.notes || '—'],
        ['Agreement', p.allocationId ? allocLabel(p.allocationId) : 'Not tagged'],
        st && st.due < -1 ? ['Advance held', inr(-st.due)] : ['Outstanding balance', st ? inr(Math.max(0, st.due)) : '—'],
      ],
    }
  }

  const kpi = d.store
  return (
    <div className="page">
      <PageHeader
        title="Payments"
        sub="Storage charges, collections and outstanding dues by grower"
        actions={<Button variant="primary" icon={<Plus />} onClick={() => openModal(growerFilter)}>Record payment</Button>}
      />

      <div className="grid cols-4">
        <Kpi label="Total charges" value={inr(kpi.totalCharges)} foot="Accrued to date" />
        <Kpi label="Collected" value={inr(kpi.paid)} foot={`${payments.length} payments`} />
        <Kpi label="Outstanding" value={inr(kpi.outstanding)} tone={kpi.outstanding > 0 ? 'bad' : undefined} foot={`Advances held ${inr(kpi.advances)}`} to="/admin/payments?status=due" />
        <Kpi label="Growers with dues" value={kpi.growersWithDue} tone={kpi.growersWithDue > 0 ? 'warn' : undefined} foot="Tap to filter" to="/admin/payments?status=due" />
      </div>

      <div className="pay-section">
        <Card
          pad={false}
          title="Grower-wise dues"
          sub={`${rows.length} grower${rows.length === 1 ? '' : 's'}`}
          action={<Chips options={FILTERS} value={status} onChange={(v) => setParam('status', v)} />}
        >
          {growerFilter && (
            <div className="toolbar">
              <span className="pay-chip-filter">
                Grower: <b>{gName(growerFilter)}</b>
                <button aria-label="Clear grower filter" onClick={() => setParam('grower', '')}><X /></button>
              </span>
            </div>
          )}
          {rows.length === 0 ? (
            <EmptyState title="No growers match" text="Try a different status filter." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Grower</th><th className="r">Total charges</th><th className="r">Paid</th>
                  <th className="r">Balance</th><th>Status</th><th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ g, s }) => {
                  const st = payStatus(s.paid, s.due)
                  return (
                    <tr key={g.id}>
                      <td>
                        <Link to={`/admin/growers/${g.id}`} className="strong link">{g.name}</Link>
                        <div className="muted pay-sub">{g.code} · {g.village}</div>
                      </td>
                      <td className="r num">{inr(s.charges)}</td>
                      <td className="r num">{inr(s.paid)}</td>
                      <td className={`r num strong ${s.due > 1 ? 'pay-due' : s.due < -1 ? 'pay-adv' : ''}`}>
                        {s.due < -1 ? `Advance ${inr(-s.due)}` : inr(Math.max(0, s.due))}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <StatusPill status={st} />
                          {s.due > 1 && <StatusPill status="Due" />}
                        </div>
                      </td>
                      <td className="r">
                        <div className="row pay-actions">
                          <Button size="sm" variant={s.due > 1 ? 'primary' : 'secondary'} icon={<Plus />} onClick={() => openModal(g.id)}>Record payment</Button>
                          <Button size="sm" icon={<BookOpen />} onClick={() => nav(`/admin/ledger/${g.id}`)}>Ledger</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="pay-section">
        <Card pad={false} title="Payment history" sub={`${history.length} payment${history.length === 1 ? '' : 's'}`}>
          {history.length === 0 ? (
            <EmptyState title="No payments recorded" text="Recorded payments will appear here." />
          ) : (
            <TableWrap>
              <thead>
                <tr><th>Code</th><th>Grower</th><th>Agreement</th><th>Date</th><th>Method</th><th>Reference</th><th className="r">Amount</th><th className="r">Receipt</th></tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.code}</td>
                    <td>{gName(p.growerId)}</td>
                    <td className="mono">{p.allocationId ? allocLabel(p.allocationId) : <span className="muted">—</span>}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td className="muted">{p.reference || '—'}</td>
                    <td className="r num strong">{inr(p.amount)}</td>
                    <td className="r"><Button size="sm" variant="ghost" icon={<Receipt />} onClick={() => setReceipt(p)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <Modal
        open={modal}
        title="Record payment"
        onClose={() => setModal(false)}
        footer={<>
          <Button onClick={() => setModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Save payment</Button>
        </>}
      >
        <div className="form-grid">
          <Field label="Grower" full>
            <Select value={form.growerId} onChange={(e) => { setForm({ ...form, growerId: e.target.value, allocationId: '' }); setError('') }}>
              <option value="">Select grower…</option>
              {growers.filter((g) => g.status !== 'PENDING').map((g) => <option key={g.id} value={g.id}>{g.name} · {g.code}</option>)}
            </Select>
          </Field>
          {selStats && growerAllocs.length > 0 && (
            <Field label="Against agreement (optional)" full hint={selAlloc ? `${rateLabel(selAlloc.rateType, selAlloc.rate)} · ${selTrade ? `balance ${selTrade.balance < -1 ? `advance ${inr(-selTrade.balance)}` : inr(Math.max(0, selTrade.balance))}` : ''}` : 'Leave blank to apply to the grower account (credited to the first agreement)'}>
              <Select value={form.allocationId} onChange={(e) => { setForm({ ...form, allocationId: e.target.value }); setError('') }}>
                <option value="">Not tagged to an agreement</option>
                {growerAllocs.map((a) => {
                  const t = trade.find((x) => x.allocationId === a.id)
                  return <option key={a.id} value={a.id}>{a.externalRef ?? a.code} · {rateLabel(a.rateType, a.rate)}{t ? ` · ${t.balance < -1 ? `adv ${inr(-t.balance)}` : `due ${inr(Math.max(0, t.balance))}`}` : ''}</option>
                })}
              </Select>
            </Field>
          )}
          {selStats && (
            <div className="full pay-outstanding">
              <span className="muted">{scopeDue < -1 ? 'Advance held' : 'Outstanding balance'}{selTrade ? ' (agreement)' : ''}</span>
              <b className={`num ${scopeDue < -1 ? 'pay-adv' : ''}`}>{inr(Math.abs(scopeDue) < 1 ? 0 : Math.abs(scopeDue))}</b>
              {scopeDue > 1 && (
                <button className="link" onClick={() => setForm({ ...form, amount: String(Math.round(scopeDue)) })}>Pay full amount</button>
              )}
            </div>
          )}
          <Field label="Amount (₹)">
            <Input type="number" min={0} inputMode="numeric" value={form.amount} placeholder="0" onChange={(e) => { setForm({ ...form, amount: e.target.value }); setError('') }} />
          </Field>
          <Field label="Payment date">
            <Input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Method">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as PayMethod })}>
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </Select>
          </Field>
          <Field label="Reference (optional)">
            <Input value={form.reference} placeholder="UPI ref, cheque no." onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Notes (optional)" full>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {selStats && amountNum > Math.max(0, scopeDue) && scopeDue > 1 && (
            <div className="full"><Alert kind="warning">This amount is more than the outstanding balance and will be held as an advance.</Alert></div>
          )}
          {error && <div className="full"><Alert kind="error">{error}</Alert></div>}
        </div>
      </Modal>

      <Modal
        open={!!afterSave}
        title="Payment recorded"
        onClose={() => setAfterSave(null)}
        footer={<>
          <Button onClick={() => setAfterSave(null)}>Done</Button>
          <Button variant="primary" icon={<Receipt />} onClick={() => { setReceipt(afterSave); setAfterSave(null) }}>Preview receipt</Button>
        </>}
      >
        {afterSave && (
          <Alert kind="success">
            {inr(afterSave.amount)} received from {gName(afterSave.growerId)} as {afterSave.code}. Would you like to view the payment receipt?
          </Alert>
        )}
      </Modal>

      <DocPreview open={!!receipt} onClose={() => setReceipt(null)} doc={receipt ? receiptDoc(receipt) : null} />
    </div>
  )
}

