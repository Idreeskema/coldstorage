import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Boxes, X } from 'lucide-react'
import { Button, Card, Chips, EmptyState, PageHeader, SearchInput, Select, StatusPill, TableWrap } from '../../ui'
import { useDerived } from '../../core/store'
import { useStore } from '../../core/store'
import { fmtDate, inr, num, rateLabel } from '../../core/format'
import type { AgeBucket, LotStatus } from '../../core/calc'
import './inventory.css'

const PAGE_SIZE = 15
type StatusFilter = 'ACTIVE' | LotStatus
const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: 'ACTIVE', label: 'All active' },
  { id: 'IN_STORAGE', label: 'In Storage' },
  { id: 'PARTIAL', label: 'Partially Dispatched' },
  { id: 'READY', label: 'Ready' },
  { id: 'COMPLETED', label: 'Completed' },
]
const BUCKETS: AgeBucket[] = ['0-30', '31-60', '61-90', '90+']

export default function InventoryPage() {
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)

  const get = (k: string) => params.get(k) ?? ''
  const status = (get('status') || 'ACTIVE') as StatusFilter
  const grower = get('grower'), chamber = get('chamber'), bucket = get('bucket'), variety = get('variety'), grade = get('grade'), q = get('q')

  const set = (k: string, v: string) => {
    setParams((p) => { v && !(k === 'status' && v === 'ACTIVE') ? p.set(k, v) : p.delete(k); return p }, { replace: true })
    setPage(1)
  }
  const [search, setSearch] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => { if (search !== q) set('q', search) }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => setSearch(q), [q])

  const varieties = useMemo(() => [...new Set(d.lots.map((l) => l.variety))].sort(), [d.lots])
  const grades = useMemo(() => [...new Set(d.lots.map((l) => l.grade))].sort(), [d.lots])
  const lotGrowers = useMemo(() => growers.filter((g) => d.lots.some((l) => l.growerId === g.id)), [growers, d.lots])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return d.lots
      .filter((l) => (status === 'ACTIVE' ? l.status !== 'COMPLETED' : l.status === status))
      .filter((l) => !grower || l.growerId === grower)
      .filter((l) => !chamber || l.chamberId === chamber)
      .filter((l) => !bucket || l.ageBucket === bucket)
      .filter((l) => !variety || l.variety === variety)
      .filter((l) => !grade || l.grade === grade)
      .filter((l) => !needle || `${l.code} ${l.growerName} ${l.growerCode} ${l.variety}`.toLowerCase().includes(needle))
      .sort((a, b) => b.days - a.days || a.code.localeCompare(b.code))
  }, [d.lots, status, grower, chamber, bucket, variety, grade, q])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const slice = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  const totBoxes = filtered.reduce((s, l) => s + l.current, 0)
  const totAccrued = filtered.reduce((s, l) => s + l.accrued, 0)
  const hasFilter = !!(grower || chamber || bucket || variety || grade || q || get('status'))

  return (
    <div className="page">
      <PageHeader title="Storage Inventory" sub="Every lot in the cold store with live storage age and accrued charges" />

      <div className="inv-aging">
        {d.store.aging.map((a) => (
          <button key={a.bucket} className={`inv-age ${bucket === a.bucket ? 'on' : ''}`} onClick={() => set('bucket', bucket === a.bucket ? '' : a.bucket)}>
            <div className="t"><span>{a.bucket} days</span><span>{a.lots} lots</span></div>
            <div className="b">{num(a.boxes)}<small>boxes</small></div>
            <div className="f">Est. charges {inr(a.charges)}</div>
          </button>
        ))}
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <Chips options={STATUS_CHIPS} value={status} onChange={(v) => set('status', v)} />
          <div className="grow" />
          <SearchInput value={search} onChange={setSearch} placeholder="Search lot, grower, variety" width={250} />
        </div>
        <div className="inv-filters">
          <Select className="sm" value={grower} onChange={(e) => set('grower', e.target.value)} aria-label="Grower">
            <option value="">All growers</option>
            {lotGrowers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select className="sm" value={chamber} onChange={(e) => set('chamber', e.target.value)} aria-label="Chamber">
            <option value="">All chambers</option>
            {d.store.chambers.map((c) => <option key={c.chamber.id} value={c.chamber.id}>{c.chamber.id}</option>)}
          </Select>
          <Select className="sm" value={variety} onChange={(e) => set('variety', e.target.value)} aria-label="Variety">
            <option value="">All varieties</option>
            {varieties.map((v) => <option key={v}>{v}</option>)}
          </Select>
          <Select className="sm" value={grade} onChange={(e) => set('grade', e.target.value)} aria-label="Grade">
            <option value="">All grades</option>
            {grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </Select>
          <Select className="sm" value={bucket} onChange={(e) => set('bucket', e.target.value)} aria-label="Storage age">
            <option value="">Any storage age</option>
            {BUCKETS.map((b) => <option key={b} value={b}>{b} days</option>)}
          </Select>
          {hasFilter && <Button size="sm" variant="ghost" icon={<X />} onClick={() => { setParams({}, { replace: true }); setPage(1) }}>Clear filters</Button>}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Boxes />} title="No lots match these filters" text="Try clearing a filter or switching the status chip." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th>Lot</th><th>Grower</th><th>Variety</th><th>Grade</th><th className="r">Boxes</th><th>Chamber / rack</th>
                <th>Storage start</th><th className="r">Days</th><th>Rate</th><th className="r">Accrued charge</th><th>Status</th>
              </tr>
            </thead>
            <tbody className="inv-table">
              {slice.map((l) => (
                <tr key={l.id} className="click" onClick={() => nav(`/admin/inventory/${l.id}`)}>
                  <td className="mono strong">{l.code}</td>
                  <td>{l.growerName}<span className="inv-sub">{l.growerCode}</span></td>
                  <td>{l.variety}</td>
                  <td>{l.grade}</td>
                  <td className="r num">{num(l.current)}{l.dispatched > 0 && <span className="inv-sub">of {num(l.boxesReceived)}</span>}</td>
                  <td>{l.chamberId} · {l.rackLabel}</td>
                  <td>{fmtDate(l.storageStartDate)}</td>
                  <td className="r num">{l.days}</td>
                  <td>{rateLabel(l.rateType, l.rate)}</td>
                  <td className="r num strong">{inr(l.accrued)}</td>
                  <td><StatusPill status={l.status} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total · {filtered.length} lots</td>
                <td className="r num">{num(totBoxes)}</td>
                <td colSpan={4} />
                <td className="r num">{inr(totAccrued)}</td>
                <td />
              </tr>
            </tfoot>
          </TableWrap>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="pager">
            <span>Showing {(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="row">
              <Button size="sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>Previous</Button>
              <span>Page {cur} of {pages}</span>
              <Button size="sm" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
      <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
        Looking for chamber layout? <Link className="link" to="/admin/chambers">Open chambers</Link>
      </p>
    </div>
  )
}
