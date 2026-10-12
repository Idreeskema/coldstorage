import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useDerived, useStore } from '../../core/store'
import { buildTradeRows, type TradeRow } from '../../core/calc'
import { inr, num, rateLabel } from '../../core/format'
import { Button, Chips, EmptyState, PageHeader, SearchInput } from '../../ui'
import './trade.css'

type Filter = 'all' | 'due' | 'advance' | 'pending'
type SortKey = 'txnNo' | 'name' | 'agreement' | 'rate' | 'given' | 'received' | 'difference' | 'amount' | 'paid' | 'balance'
const PAGE = 25

const cols: { key: SortKey; label: string; r?: boolean }[] = [
  { key: 'txnNo', label: 'Txn No' }, { key: 'name', label: 'Customer' }, { key: 'agreement', label: 'Agreement', r: true },
  { key: 'rate', label: 'Rate', r: true }, { key: 'given', label: 'Crates Given', r: true }, { key: 'received', label: 'Received', r: true },
  { key: 'difference', label: 'Difference', r: true }, { key: 'amount', label: 'Amount', r: true }, { key: 'paid', label: 'Paid', r: true },
  { key: 'balance', label: 'Balance', r: true },
]

export function BalanceCell({ v, missing }: { v: number; missing?: boolean }) {
  if (missing) return <span className="muted">No rate</span>
  if (v < -0.5) return <span className="trade-adv">Advance {inr(-v)}</span>
  if (v > 0.5) return <span className="trade-due">{inr(v)}</span>
  return <span className="muted">₹0</span>
}

export default function TradeLedgerPage() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const state = useStore()
  const d = useDerived()
  const rows = useMemo(() => buildTradeRows(state, d), [state, d])
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>((sp.get('filter') as Filter) || 'all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'txnNo', dir: 1 })
  const [page, setPage] = useState(0)

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const f = rows.filter((r) => {
      if (t && !`${r.txnNo} ${r.name} ${r.remarks ?? ''}`.toLowerCase().includes(t)) return false
      if (filter === 'due') return r.balance > 0.5
      if (filter === 'advance') return r.balance < -0.5
      if (filter === 'pending') return r.difference > 0
      return true
    })
    const { key, dir } = sort
    return [...f].sort((a, b) => {
      const x = a[key], y = b[key]
      return (typeof x === 'string' ? x.localeCompare(y as string, undefined, { numeric: true }) : (x as number) - (y as number)) * dir
    })
  }, [rows, q, filter, sort])

  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const slice = list.slice(cur * PAGE, cur * PAGE + PAGE)
  const sum = (f: (r: TradeRow) => number) => list.reduce((s, r) => s + f(r), 0)
  const tot = { agreement: sum((r) => r.agreement), given: sum((r) => r.given), received: sum((r) => r.received), difference: sum((r) => r.difference), amount: sum((r) => r.amount), paid: sum((r) => r.paid), balance: sum((r) => r.balance) }

  const toggle = (key: SortKey) => { setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: 1 })); setPage(0) }
  const counts = { all: rows.length, due: rows.filter((r) => r.balance > 0.5).length, advance: rows.filter((r) => r.balance < -0.5).length, pending: rows.filter((r) => r.difference > 0).length }

  return (
    <div className="page">
      <PageHeader title="Trade Ledger" sub="One row per agreement (Transaction ID), like the Main Transactions sheet"
        actions={<Button icon={<Users />} onClick={() => nav('/admin/customers')}>Customer dashboard</Button>} />
      <section className="card">
        <div className="toolbar">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0) }} placeholder="Search txn, customer, remarks…" />
          <Chips<Filter> value={filter} onChange={(v) => { setFilter(v); setPage(0) }} options={[
            { id: 'all', label: `All (${counts.all})` }, { id: 'due', label: `Balance due (${counts.due})` },
            { id: 'advance', label: `Advance (${counts.advance})` }, { id: 'pending', label: `Crates pending (${counts.pending})` },
          ]} />
        </div>
        {slice.length === 0 ? (
          <EmptyState title="No transactions" text={rows.length ? 'No agreement matches these filters.' : 'Import your workbook or allocate storage to see agreements here.'}
            action={!rows.length && <Button variant="primary" onClick={() => nav('/admin/import')}>Import workbook</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="tbl trade-tbl">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c.key} className={`${c.r ? 'r' : ''} trade-sort`} onClick={() => toggle(c.key)} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                      {c.label}{sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </th>
                  ))}
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.allocationId} className="click" onClick={() => nav(`/admin/growers/${r.growerId}`)}>
                    <td className="mono">{r.txnNo}</td>
                    <td className="strong">{r.name}</td>
                    <td className="r num">{num(r.agreement)}</td>
                    <td className="r num" title={rateLabel(r.rateType, r.rate)}>{r.rateMissing ? <span className="muted">—</span> : `₹${r.rate}`}</td>
                    <td className="r num">{num(r.given)}</td>
                    <td className="r num">{num(r.received)}</td>
                    <td className={`r num ${r.difference > 0 ? 'trade-pending' : ''}`}>{r.difference > 0 ? `${num(r.difference)} pending` : num(r.difference)}</td>
                    <td className="r num">{r.rateMissing ? <span className="muted">—</span> : inr(r.amount)}</td>
                    <td className="r num">
                      {inr(r.paid)}
                      {r.paidUnallocated > 0 && <div className="trade-hint" title="Payments not tagged to a specific agreement are attributed to the customer's first agreement">{inr(r.paidUnallocated)} untagged</div>}
                    </td>
                    <td className="r num"><BalanceCell v={r.balance} missing={r.rateMissing && r.paid === 0} /></td>
                    <td className="trade-remarks" title={r.remarks}>{r.remarks ?? ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total ({list.length} agreements)</td>
                  <td className="r num">{num(tot.agreement)}</td><td />
                  <td className="r num">{num(tot.given)}</td><td className="r num">{num(tot.received)}</td>
                  <td className="r num">{num(tot.difference)}</td><td className="r num">{inr(tot.amount)}</td>
                  <td className="r num">{inr(tot.paid)}</td><td className="r num"><BalanceCell v={tot.balance} /></td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="pager">
          <span>{list.length ? `${cur * PAGE + 1}–${Math.min(list.length, cur * PAGE + PAGE)} of ${list.length}` : '0 results'}</span>
          <div className="row">
            <Button size="sm" variant="ghost" disabled={cur === 0} onClick={() => setPage(cur - 1)} icon={<ChevronLeft />}>Prev</Button>
            <span>Page {cur + 1} / {pages}</span>
            <Button size="sm" variant="ghost" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next<ChevronRight size={16} /></Button>
          </div>
        </div>
      </section>
    </div>
  )
}
