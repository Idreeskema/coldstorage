import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDerived } from '../../core/store'
import { fmtDate, num } from '../../core/format'
import type { ChamberStat, RackCell } from '../../core/calc'
import { Alert, Button, Card, EmptyState, PageHeader, Progress, StatusPill, TableWrap } from '../../ui'
import './chambers.css'

const tone = (pct: number) => (pct >= 90 ? 'bad' : pct >= 75 ? 'warn' : '')
const rackRange = (label: string): [number, number] | null => {
  const m = label.match(/R(\d+)(?:–R(\d+))?/)
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null
}

function ChamberList({ chambers, unplaced }: { chambers: ChamberStat[]; unplaced: number }) {
  const total = chambers.reduce((s, c) => s + c.chamber.capacity, 0)
  const occ = chambers.reduce((s, c) => s + c.occupied, 0)
  return (
    <div className="page">
      <PageHeader title="Chambers" sub={`${chambers.length} chambers · ${num(occ)} of ${num(total)} boxes stored (${total ? ((occ / total) * 100).toFixed(0) : 0}%)`} />
      {unplaced > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="warning">
            <b className="num">{num(unplaced)}</b> boxes are in storage but not placed in any chamber.{' '}
            <Link className="link" to="/admin/inventory?chamber=unassigned">View unplaced lots</Link>
          </Alert>
        </div>
      )}
      <div className="chm-list">
        {chambers.map((c) => (
          <Link key={c.chamber.id} to={`/admin/chambers/${c.chamber.id}`} className="card chm-card">
            <div className="chm-head">
              <span className="chm-name">{c.chamber.id}</span>
              <span className={`chm-pct ${tone(c.pct)}`}>{c.pct.toFixed(0)}%</span>
            </div>
            <Progress value={c.pct} />
            <div className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
              <span className="num">{num(c.occupied)}</span> of <span className="num">{num(c.chamber.capacity)}</span> boxes · <span className="num">{num(c.available)}</span> available
            </div>
            <dl className="chm-stats">
              <div><dt>Temperature</dt><dd>{c.chamber.tempC}°C</dd></div>
              <div><dt>Lots</dt><dd>{c.lotCount}</dd></div>
              <div><dt>Growers</dt><dd>{c.growerCount}</dd></div>
              <div><dt>Avg storage</dt><dd>{c.avgDays.toFixed(0)} days</dd></div>
              <div><dt>Racks</dt><dd>{c.chamber.racks}</dd></div>
              <div><dt>Full racks</dt><dd>{c.racks.filter((r) => r.state === 'FULL').length}</dd></div>
            </dl>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ChamberDetail({ c }: { c: ChamberStat }) {
  const nav = useNavigate()
  const [hover, setHover] = useState<RackCell | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const counts = { FULL: 0, PARTIAL: 0, EMPTY: 0 }
  c.racks.forEach((r) => counts[r.state]++)
  const lots = sel === null ? c.lots : c.lots.filter((l) => {
    const r = rackRange(l.rackLabel)
    return r && sel >= r[0] && sel <= r[1]
  })
  const shown = hover ?? (sel !== null ? c.racks[sel - 1] : null)

  return (
    <div className="page">
      <PageHeader
        crumbs={[{ label: 'Chambers', to: '/admin/chambers' }, { label: c.chamber.id }]}
        title={`Chamber ${c.chamber.id}`}
        sub={`${c.pct.toFixed(0)}% full · ${c.chamber.tempC}°C`}
        actions={<Button onClick={() => nav('/admin/inventory?chamber=' + c.chamber.id)}>View in inventory</Button>}
      />
      <div className="chm-kpis">
        {[
          ['Capacity', num(c.chamber.capacity)], ['Occupied', num(c.occupied)], ['Available', num(c.available)],
          ['Lots', String(c.lotCount)], ['Growers', String(c.growerCount)], ['Avg storage days', c.avgDays.toFixed(0)],
        ].map(([l, v]) => (
          <div key={l} className="card kpi"><div className="kpi-label">{l}</div><div className="kpi-value">{v}</div></div>
        ))}
      </div>

      <Card title="Rack occupancy" sub={`${c.racks.length} racks · ${num(c.racks[0]?.capacity ?? 0)} boxes each · click a rack to filter lots`}>
        <div className="chm-racks" onMouseLeave={() => setHover(null)}>
          {c.racks.map((r) => (
            <button key={r.n} type="button" className={`chm-rack ${r.state} ${sel === r.n ? 'sel' : ''}`}
              style={{ ['--fill' as string]: `${(r.occupied / r.capacity) * 100}%` }}
              title={`${r.label}: ${num(r.occupied)} / ${num(r.capacity)} boxes`}
              onMouseEnter={() => setHover(r)} onFocus={() => setHover(r)}
              onClick={() => setSel(sel === r.n ? null : r.n)}>
              <b>{r.label}</b>
              <span>{num(r.occupied)}</span>
            </button>
          ))}
        </div>
        <div className="chm-hover">
          {shown
            ? <><b>{shown.label}</b> · {num(shown.occupied)} of {num(shown.capacity)} boxes ({((shown.occupied / shown.capacity) * 100).toFixed(0)}%) · {shown.state === 'FULL' ? 'Occupied' : shown.state === 'PARTIAL' ? 'Partially occupied' : 'Available'}</>
            : 'Hover a rack to see its occupancy.'}
        </div>
        <div className="chm-legend">
          <span><i className="FULL" />Occupied · {counts.FULL}</span>
          <span><i className="PARTIAL" />Partially · {counts.PARTIAL}</span>
          <span><i className="EMPTY" />Available · {counts.EMPTY}</span>
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card title={`Lots in ${c.chamber.id}`} sub={sel !== null ? `Filtered to ${c.racks[sel - 1].label}` : `${c.lots.length} active lots`}
          action={sel !== null ? <Button size="sm" variant="ghost" onClick={() => setSel(null)}>Clear rack filter</Button> : undefined} pad={false}>
          {lots.length === 0 ? (
            <EmptyState title="No lots here" text={sel !== null ? 'No active lots are stored in this rack.' : 'This chamber is empty.'} />
          ) : (
            <TableWrap>
              <thead>
                <tr><th>Lot</th><th>Grower</th><th>Variety</th><th>Racks</th><th className="r">Boxes</th><th className="r">Days</th><th>Release</th><th>Status</th></tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} className="click" onClick={() => nav(`/admin/inventory/${l.id}`)}>
                    <td className="strong"><Link to={`/admin/inventory/${l.id}`} className="link mono" onClick={(e) => e.stopPropagation()}>{l.code}</Link></td>
                    <td>{l.growerName}</td>
                    <td>{l.variety} · {l.grade}</td>
                    <td>{l.rackLabel}</td>
                    <td className="r num">{num(l.current)}</td>
                    <td className="r num">{l.days}</td>
                    <td>{fmtDate(l.expectedReleaseDate)}</td>
                    <td><StatusPill status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  )
}

export default function ChambersPage() {
  const { chamberId } = useParams()
  const { store } = useDerived()
  if (!chamberId) return <ChamberList chambers={store.chambers} unplaced={store.unplacedBoxes} />
  const c = store.chambers.find((x) => x.chamber.id.toLowerCase() === chamberId.toLowerCase())
  if (!c)
    return (
      <div className="page">
        <EmptyState title="Chamber not found" text={`There is no chamber "${chamberId}".`}
          action={<Link to="/admin/chambers" className="btn primary">Back to chambers</Link>} />
      </div>
    )
  return <ChamberDetail c={c} />
}
