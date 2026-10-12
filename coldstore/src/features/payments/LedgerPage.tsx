import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, FileText, Plus, Printer, Share2 } from 'lucide-react'
import { Button, Card, DocPreview, EmptyState, Kpi, PageHeader, Select, StatusPill, TableWrap, toast, type DocSpec } from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { buildLedger } from '../../core/calc'
import { fmtDate, inr, num, rateLabel, today } from '../../core/format'
import { payStatus } from './PaymentsPage'
import './payments.css'

export default function LedgerPage() {
  const { growerId = '' } = useParams()
  const nav = useNavigate()
  const data = useStore((s) => s)
  const d = useDerived()
  const [doc, setDoc] = useState(false)

  const grower = data.growers.find((g) => g.id === growerId)
  const stats = grower ? d.growerStats.get(grower.id) : undefined
  const [sp, setSp] = useSearchParams()
  const agreements = useMemo(() => data.allocations.filter((a) => a.growerId === growerId), [data.allocations, growerId])
  const allocParam = sp.get('allocation') ?? ''
  const allocationId = agreements.some((a) => a.id === allocParam) ? allocParam : ''
  const selAlloc = agreements.find((a) => a.id === allocationId)
  const rows = useMemo(() => (grower ? buildLedger(data, grower.id, undefined, allocationId || undefined) : []), [data, grower, allocationId])
  const money = (n: number) => (n < -0.5 ? `Advance ${inr(-n)}` : inr(n))
  const totals = useMemo(
    () => rows.reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }), { debit: 0, credit: 0 }),
    [rows],
  )
  const lots = useMemo(() => d.lots.filter((l) => l.growerId === growerId && (!allocationId || l.allocationId === allocationId)), [d.lots, growerId, allocationId])
  const balance = totals.debit - totals.credit

  const pickable = data.growers.filter((g) => g.status !== 'PENDING' || d.growerStats.get(g.id)?.charges)

  const picker = (
    <Select className="ledg-picker" value={growerId} onChange={(e) => nav(e.target.value ? `/admin/ledger/${e.target.value}` : '/admin/ledger')} aria-label="Select grower">
      <option value="">Select grower…</option>
      {pickable.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.code}</option>)}
    </Select>
  )

  if (!grower || !stats) {
    return (
      <div className="page">
        <PageHeader title="Grower ledger" sub="Charges, payments and running balance" actions={picker} />
        <Card>
          <EmptyState
            icon={<FileText />}
            title={growerId ? 'Grower not found' : 'Choose a grower'}
            text="Select a grower to view their account statement."
            action={<Link to="/admin/payments"><Button>Back to payments</Button></Link>}
          />
        </Card>
      </div>
    )
  }

  const st = payStatus(totals.credit, balance)
  const placeholder = (what: string) => toast(`${what} is a placeholder in this POC`)

  const statement: DocSpec = {
    title: 'Account Statement',
    code: `STMT-${grower.code}`,
    date: fmtDate(today()),
    rows: [
      ['Grower', `${grower.name} (${grower.code})`],
      ['Village', `${grower.village}, ${grower.district}`],
      ['Statement entries', String(rows.length)],
      ['Total charges', inr(totals.debit)],
      ['Total payments', inr(totals.credit)],
      ...(selAlloc ? [['Agreement', `${selAlloc.externalRef ?? selAlloc.code} · ${rateLabel(selAlloc.rateType, selAlloc.rate)}`] as [string, string]] : []),
      [balance < -0.5 ? 'Closing balance (advance)' : 'Closing balance', money(balance)],
    ],
    footer: `Statement as of ${fmtDate(today())} — computer generated`,
  }

  const lotTotal = lots.reduce((s, l) => s + l.accrued, 0)

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: 'Payments', to: '/admin/payments' }, { label: 'Ledger' }]}
        title={grower.name}
        sub={`${grower.code} · ${grower.village}, ${grower.district}${selAlloc ? ` · Agreement ${selAlloc.externalRef ?? selAlloc.code}` : ''}`}
        actions={<>
          {picker}
          {agreements.length > 1 && (
            <Select className="ledg-picker" value={allocationId} aria-label="Filter by agreement"
              onChange={(e) => { const n = new URLSearchParams(sp); if (e.target.value) n.set('allocation', e.target.value); else n.delete('allocation'); setSp(n, { replace: true }) }}>
              <option value="">All agreements</option>
              {agreements.map((a) => <option key={a.id} value={a.id}>{a.externalRef ?? a.code} · {rateLabel(a.rateType, a.rate)}</option>)}
            </Select>
          )}
          <Button icon={<FileText />} onClick={() => setDoc(true)}>Statement</Button>
          <Button icon={<Printer />} onClick={() => setDoc(true)}>Print</Button>
          <Button icon={<Download />} onClick={() => placeholder('PDF download')}>Download PDF</Button>
          <Button icon={<Share2 />} onClick={() => toast('Share link copied (mock)')}>Share</Button>
          <Button variant="primary" icon={<Plus />} onClick={() => nav(`/admin/payments?new=1&grower=${grower.id}`)}>Record payment</Button>
        </>}
      />

      <div className="grid cols-4 ledg-summary">
        <Kpi label="Total charges" value={inr(totals.debit)} foot={`${stats.lots} lot${stats.lots === 1 ? '' : 's'}`} />
        <Kpi label="Total paid" value={inr(totals.credit)} foot={`${rows.filter((r) => r.kind === 'PAYMENT').length} payments`} />
        {balance < -0.5
          ? <Kpi label="Advance held" value={<span className="pay-adv">{inr(-balance)}</span>} foot="Paid in excess of charges" />
          : <Kpi label="Outstanding" value={inr(Math.max(0, balance))} tone={balance > 0.5 ? 'bad' : undefined} />}
        <Kpi label="Payment status" value={<StatusPill status={st} />} foot={`${num(stats.stored)} boxes in storage`} />
      </div>

      <div className="ledg-layout">
        <Card pad={false} title="Account statement" sub="Date-wise charges and payments">
          {rows.length === 0 ? (
            <EmptyState title="No ledger entries" text="Charges appear once apples are received into storage." />
          ) : (
            <TableWrap>
              <thead>
                <tr><th>Date</th><th>Description</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                    <td className="ledg-desc">{r.description}</td>
                    <td className="r num">{r.debit ? inr(r.debit) : '—'}</td>
                    <td className="r num ledg-credit">{r.credit ? inr(r.credit) : '—'}</td>
                    <td className={`r num strong ${r.balance < -0.5 ? 'pay-adv' : ''}`}>{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Totals</td>
                  <td className="r num">{inr(totals.debit)}</td>
                  <td className="r num">{inr(totals.credit)}</td>
                  <td className={`r num ${balance < -0.5 ? 'pay-adv' : ''}`}>{money(balance)}</td>
                </tr>
              </tfoot>
            </TableWrap>
          )}
        </Card>

        <Card pad={false} title="Billing breakdown" sub="Storage charges by lot">
          {lots.length === 0 ? (
            <EmptyState title="No lots" text="This grower has no stored lots yet." />
          ) : (
            <TableWrap>
              <thead>
                <tr><th>Lot</th><th className="r">Base</th><th className="r">Other</th><th className="r">Discount</th><th className="r">Total</th></tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link to={`/admin/inventory/${l.id}`} className="link mono">{l.code}</Link>
                      <div className="muted" style={{ fontSize: 12 }}>{num(l.boxesReceived)} boxes · {l.days} days</div>
                    </td>
                    <td className="r num">{inr(l.accrued)}</td>
                    <td className="r num muted">{inr(0)}</td>
                    <td className="r num muted">{inr(0)}</td>
                    <td className="r num strong">{inr(l.accrued)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total charges</td><td className="r num">{inr(lotTotal)}</td><td className="r num">{inr(0)}</td><td className="r num">{inr(0)}</td><td className="r num">{inr(lotTotal)}</td></tr>
                <tr><td colSpan={4}>Paid</td><td className="r num ledg-credit">{inr(totals.credit)}</td></tr>
                <tr><td colSpan={4}>{balance < -0.5 ? 'Advance' : 'Outstanding'}</td><td className={`r num ${balance > 0.5 ? 'pay-due' : balance < -0.5 ? 'pay-adv' : ''}`}>{inr(Math.abs(balance))}</td></tr>
              </tfoot>
            </TableWrap>
          )}
        </Card>
      </div>

      <DocPreview open={doc} onClose={() => setDoc(false)} doc={statement} />
    </div>
  )
}
