import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, ExternalLink } from 'lucide-react'
import { useDerived, useStore } from '../../core/store'
import { buildTradeRows } from '../../core/calc'
import { fmtDate, inr, num } from '../../core/format'
import { Button, Card, EmptyState, Kpi, PageHeader, StatusPill } from '../../ui'
import { BalanceCell } from './TradeLedgerPage'
import './trade.css'

const METHOD: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank Transfer', CHEQUE: 'Cheque', OTHER: 'Other' }

export default function CustomerDashboardPage() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const state = useStore()
  const d = useDerived()
  const trade = useMemo(() => buildTradeRows(state, d), [state, d])
  const [q, setQ] = useState('')
  const { growers, boxIssues, receipts, payments, allocations } = state

  const withTxn = useMemo(() => new Set(trade.map((t) => t.growerId)), [trade])
  const options = useMemo(
    () => growers.filter((g) => withTxn.has(g.id)).sort((a, b) => a.name.localeCompare(b.name))
      .filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase())),
    [growers, withTxn, q],
  )
  const selId = sp.get('id') ?? ''
  const grower = growers.find((g) => g.id === selId)
  const txnOf = useMemo(() => new Map(trade.map((t) => [t.allocationId, t.txnNo])), [trade])

  /* overall summary */
  const s = d.store
  const overall = {
    customers: growers.length, txns: trade.length,
    given: trade.reduce((a, t) => a + t.given, 0), received: trade.reduce((a, t) => a + t.received, 0),
    paid: trade.reduce((a, t) => a + t.paid, 0),
  }

  const mine = grower ? trade.filter((t) => t.growerId === grower.id) : []
  const tot = {
    given: mine.reduce((a, t) => a + t.given, 0), received: mine.reduce((a, t) => a + t.received, 0),
    amount: mine.reduce((a, t) => a + t.amount, 0), paid: mine.reduce((a, t) => a + t.paid, 0),
  }
  const balance = tot.amount - tot.paid
  const moves = useMemo(() => {
    if (!grower) return []
    const rows = [
      ...boxIssues.filter((b) => b.growerId === grower.id).map((b) => ({
        id: b.id, date: b.date, kind: 'Given' as const, txn: txnOf.get(b.allocationId) ?? '', qty: b.quantity,
        from: b.fromLocation, to: undefined as string | undefined, driver: b.driver, remark: b.notes,
      })),
      ...receipts.filter((r) => r.growerId === grower.id).map((r) => ({
        id: r.id, date: r.receivedDate, kind: 'Received' as const, txn: txnOf.get(r.allocationId) ?? '', qty: r.boxes,
        from: r.sourceLocation, to: r.destination, driver: r.driver, remark: r.remark ?? r.notes,
      })),
    ]
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [grower, boxIssues, receipts, txnOf])
  const pays = grower ? payments.filter((p) => p.growerId === grower.id).sort((a, b) => b.date.localeCompare(a.date)) : []
  const payTxn = (id?: string) => (id && allocations.some((a) => a.id === id) ? txnOf.get(id) : undefined)

  return (
    <div className="page">
      <PageHeader title="Customer Dashboard" sub="Crates, billing and payments for one customer across all their agreements"
        actions={<Button onClick={() => nav('/admin/trade')}>Trade ledger</Button>} />

      <Card title="Overall Business Summary">
        <div className="trade-summary">
          <Sum label="Total customers" v={num(overall.customers)} />
          <Sum label="Transactions" v={num(overall.txns)} />
          <Sum label="Crates given" v={num(overall.given)} />
          <Sum label="Crates received" v={num(overall.received)} />
          <Sum label="All payments" v={inr(overall.paid)} />
          <Sum label="All outstanding" v={inr(s.outstanding)} tone="bad" sub={`${s.growersWithDue} customers owe`} />
          <Sum label="Advances held" v={inr(s.advances)} tone="ok" sub={`${s.growersWithAdvance} customers`} />
        </div>
      </Card>

      <section className="card trade-picker">
        <label htmlFor="trade-cust">Customer</label>
        <input className="input sm" placeholder="Type to search customers…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        <select id="trade-cust" className="select sm" value={selId} onChange={(e) => setSp(e.target.value ? { id: e.target.value } : {})}>
          <option value="">Select a customer ({options.length})</option>
          {options.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        {grower && (
          <div className="row wrap trade-links">
            <Link className="link" to={`/admin/growers/${grower.id}`}><ExternalLink size={13} /> Grower page</Link>
            <Link className="link" to={`/admin/ledger/${grower.id}`}><BookOpen size={13} /> Ledger</Link>
            <Link className="link" to={`/admin/trade?q=${encodeURIComponent(grower.name)}`}>Trade ledger rows</Link>
          </div>
        )}
      </section>

      {!grower ? (
        <section className="card"><EmptyState title="Select a customer" text="Pick a customer above to see their crates, amounts and payments." /></section>
      ) : (
        <>
          <div className="grid cols-6 trade-kpis">
            <Kpi label="Crates given" value={num(tot.given)} />
            <Kpi label="Crates received" value={num(tot.received)} />
            <Kpi label="Difference" value={num(tot.given - tot.received)} tone={tot.given - tot.received > 0 ? 'warn' : undefined}
              foot={tot.given - tot.received > 0 ? 'crates pending return' : 'all returned'} />
            <Kpi label="Total amount" value={inr(tot.amount)} />
            <Kpi label="Paid" value={inr(tot.paid)} />
            <Kpi label={balance < -0.5 ? 'Advance' : 'Outstanding'} value={inr(Math.abs(balance))} tone={balance > 0.5 ? 'bad' : undefined}
              foot={balance < -0.5 ? 'credit held for customer' : balance > 0.5 ? 'to collect' : 'settled'} />
          </div>

          <Card title="Agreements" sub={`${mine.length} transaction${mine.length === 1 ? '' : 's'}`} pad={false}>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Txn No</th><th className="r">Agreement</th><th className="r">Rate</th><th className="r">Given</th><th className="r">Received</th><th className="r">Difference</th><th className="r">Amount</th><th className="r">Paid</th><th className="r">Balance</th></tr></thead>
                <tbody>
                  {mine.map((t) => (
                    <tr key={t.allocationId}>
                      <td className="mono">{t.txnNo}</td><td className="r num">{num(t.agreement)}</td>
                      <td className="r num">{t.rateMissing ? <span className="muted">—</span> : `₹${t.rate}`}</td>
                      <td className="r num">{num(t.given)}</td><td className="r num">{num(t.received)}</td>
                      <td className={`r num ${t.difference > 0 ? 'trade-pending' : ''}`}>{num(t.difference)}</td>
                      <td className="r num">{t.rateMissing ? '—' : inr(t.amount)}</td><td className="r num">{inr(t.paid)}</td>
                      <td className="r num"><BalanceCell v={t.balance} missing={t.rateMissing && t.paid === 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid cols-2 trade-hist">
            <Card title="Crate movement" sub={`${moves.length} entries`} pad={false}>
              {moves.length === 0 ? <EmptyState title="No movements yet" /> : (
                <div className="table-wrap trade-scroll">
                  <table className="tbl">
                    <thead><tr><th>Date</th><th>Txn</th><th>Type</th><th className="r">Crates</th><th>From → To</th><th>Driver</th><th>Remark</th></tr></thead>
                    <tbody>
                      {moves.map((m) => (
                        <tr key={m.id}>
                          <td className="num">{fmtDate(m.date)}</td><td className="mono">{m.txn}</td>
                          <td><StatusPill status={m.kind} tone={m.kind === 'Given' ? 'blue' : 'green'} /></td>
                          <td className="r num">{num(m.qty)}</td>
                          <td>{m.from || '—'}{m.to ? ` → ${m.to}` : ''}</td><td>{m.driver || '—'}</td><td className="trade-remarks" title={m.remark}>{m.remark || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Payments" sub={`${pays.length} payments · ${inr(tot.paid)}`} pad={false}>
              {pays.length === 0 ? <EmptyState title="No payments yet" /> : (
                <div className="table-wrap trade-scroll">
                  <table className="tbl">
                    <thead><tr><th>Date</th><th>Txn</th><th className="r">Amount</th><th>Mode</th><th>Reference</th></tr></thead>
                    <tbody>
                      {pays.map((p) => (
                        <tr key={p.id}>
                          <td className="num">{fmtDate(p.date)}</td>
                          <td className="mono">{payTxn(p.allocationId) ?? <span className="muted" title="Not tagged to an agreement">untagged</span>}</td>
                          <td className="r num">{inr(p.amount)}</td><td>{METHOD[p.method]}</td><td>{p.reference || p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Sum({ label, v, sub, tone }: { label: string; v: string; sub?: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="trade-sum">
      <div className="trade-sum-l">{label}</div>
      <div className={`trade-sum-v num ${tone ?? ''}`}>{v}</div>
      {sub && <div className="trade-sum-s">{sub}</div>}
    </div>
  )
}
