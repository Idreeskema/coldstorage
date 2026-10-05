import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, Boxes, CheckCircle2, ChevronRight, Info, PackageCheck, PackageOpen, Receipt, Truck,
  Wallet, Warehouse, XCircle, ClipboardCheck, Archive, ArrowDownToLine, ArrowUpFromLine, IndianRupee,
} from 'lucide-react'
import { useDerived, useSession, useStore } from '../../core/store'
import { buildLedger, type Data } from '../../core/calc'
import { addDays, fmtDate, fmtDateShort, fmtTime, greeting, inr, monthLabel, num, today } from '../../core/format'
import type { Activity } from '../../core/types'
import { Button, Card, EmptyState, Kpi, SegBar, Timeline, type TimelineItem } from '../../ui'
import './dashboard.css'

const C = {
  primary: '#1f4d36', accent: '#6ba43a', muted: '#9aa396', amber: '#d19a3a', blue: '#2f6a8a',
  grid: '#e8e4da', text: '#6b7568',
}
const tick = { fontSize: 11, fill: C.text }
const tip = { contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid #e8e4da', boxShadow: 'none' }, cursor: { fill: 'rgba(31,77,54,0.05)' } }

type Sev = 'critical' | 'warning' | 'info' | 'success'
interface AlertItem { id: string; sev: Sev; title: string; desc: string; to: string }
const SEV_ORDER: Record<Sev, number> = { critical: 0, warning: 1, info: 2, success: 3 }
const SEV_ICON = { critical: XCircle, warning: AlertTriangle, info: Info, success: CheckCircle2 }
const SEV_LABEL: Record<Sev, string> = { critical: 'Critical', warning: 'Warning', info: 'Info', success: 'OK' }

function activityLink(a: Activity): string {
  switch (a.entityType) {
    case 'grower': return `/admin/growers/${a.entityId}`
    case 'lot': return `/admin/inventory/${a.entityId}`
    case 'dispatch': return '/admin/dispatch'
    case 'payment': return a.growerId ? `/admin/payments?grower=${a.growerId}` : '/admin/payments'
    case 'receipt': return a.growerId ? `/admin/receipts?grower=${a.growerId}` : '/admin/receipts'
    case 'request': return '/admin/requests'
    case 'allocation': return a.growerId ? `/admin/boxes?grower=${a.growerId}&allocation=${a.entityId}` : '/admin/boxes'
    case 'boxIssue': return a.growerId ? `/admin/boxes?grower=${a.growerId}` : '/admin/boxes'
    default: return '/admin/settings'
  }
}

export default function DashboardPage() {
  const nav = useNavigate()
  const session = useSession()
  const d = useDerived()
  const s = d.store
  const data = useStore() as unknown as Data
  const { growers, receipts, dispatches, payments, activities, settings } = data
  const t = today()

  /* ---- chart data ---- */
  const storageHistory = useMemo(() => {
    const inByDay = new Map<string, number>()
    const outByDay = new Map<string, number>()
    for (const r of receipts) inByDay.set(r.receivedDate, (inByDay.get(r.receivedDate) ?? 0) + r.boxes)
    for (const x of dispatches) if (x.status === 'COMPLETED' && x.completedDate)
      outByDay.set(x.completedDate, (outByDay.get(x.completedDate) ?? 0) + x.quantity)
    const start = addDays(t, -29)
    let run = 0
    for (const [k, v] of inByDay) if (k < start) run += v
    for (const [k, v] of outByDay) if (k < start) run -= v
    const out: { date: string; label: string; stored: number }[] = []
    for (let i = 0; i < 30; i++) {
      const day = addDays(start, i)
      run += (inByDay.get(day) ?? 0) - (outByDay.get(day) ?? 0)
      out.push({ date: day, label: fmtDateShort(day), stored: run })
    }
    return out
  }, [receipts, dispatches, t])

  const flow = useMemo(() => {
    const out: { label: string; inward: number; outward: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const day = addDays(t, -i)
      out.push({
        label: fmtDateShort(day),
        inward: receipts.filter((r) => r.receivedDate === day).reduce((a, r) => a + r.boxes, 0),
        outward: dispatches.filter((x) => x.status === 'COMPLETED' && x.completedDate === day).reduce((a, x) => a + x.quantity, 0),
      })
    }
    return out
  }, [receipts, dispatches, t])

  const revenue = useMemo(() => {
    const months: { key: string; label: string; billed: number; collected: number }[] = []
    const base = new Date()
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(base.getFullYear(), base.getMonth() - i, 1)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      months.push({ key, label: monthLabel(`${key}-01`), billed: 0, collected: 0 })
    }
    for (const g of growers)
      for (const row of buildLedger(data, g.id)) {
        const m = months.find((x) => x.key === row.date.slice(0, 7))
        if (!m) continue
        if (row.kind === 'CHARGE') m.billed += row.debit
        else m.collected += row.credit
      }
    return months
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growers, d.lots, dispatches, payments])

  const topGrowers = useMemo(
    () => growers
      .map((g) => ({ id: g.id, name: g.name, stored: d.growerStats.get(g.id)?.stored ?? 0 }))
      .filter((g) => g.stored > 0)
      .sort((a, b) => b.stored - a.stored)
      .slice(0, 6),
    [growers, d.growerStats],
  )

  /* ---- alerts ---- */
  const alerts = useMemo(() => {
    const a: AlertItem[] = []
    const full = s.chambers.filter((c) => c.pct >= 90)
    for (const c of full)
      a.push({ id: `ch-${c.chamber.id}`, sev: 'critical', title: `Chamber ${c.chamber.id} is ${c.pct.toFixed(0)}% full`, desc: `${num(c.available)} boxes of space left`, to: `/admin/chambers/${c.chamber.id}` })
    if (s.capacity > 0 && s.available / s.capacity < 0.1)
      a.push({ id: 'cap', sev: 'critical', title: 'Store capacity almost fully committed', desc: `Only ${num(s.available)} boxes unallocated`, to: '/admin/chambers' })
    if (s.growersWithDue > 0)
      a.push({ id: 'due', sev: 'warning', title: `${s.growersWithDue} grower${s.growersWithDue > 1 ? 's' : ''} with dues`, desc: `${inr(s.outstanding)} outstanding`, to: '/admin/payments?status=due' })
    if (s.awaitingReturn > 0)
      a.push({ id: 'unret', sev: 'warning', title: `${num(s.awaitingReturn)} boxes not yet returned`, desc: 'Issued to growers, apples not received', to: '/admin/boxes' })
    if (s.lotsNearingEnd > 0)
      a.push({ id: 'end', sev: 'warning', title: `${s.lotsNearingEnd} lot${s.lotsNearingEnd > 1 ? 's' : ''} near contract end`, desc: 'Release date within 30 days', to: '/admin/inventory?status=READY' })
    if (s.pendingDispatches > 0)
      a.push({ id: 'disp', sev: 'info', title: `${s.pendingDispatches} dispatch request${s.pendingDispatches > 1 ? 's' : ''} pending`, desc: 'Waiting for gate-pass completion', to: '/admin/dispatch?status=PENDING' })
    if (s.pendingRequests > 0)
      a.push({ id: 'req', sev: 'info', title: `${s.pendingRequests} storage request${s.pendingRequests > 1 ? 's' : ''} to review`, desc: 'Approve and allocate capacity', to: '/admin/requests?status=PENDING' })
    if (s.pendingGrowers > 0)
      a.push({ id: 'gr', sev: 'info', title: `${s.pendingGrowers} grower registration${s.pendingGrowers > 1 ? 's' : ''} awaiting approval`, desc: 'New sign-ups', to: '/admin/growers?filter=pending' })
    if (s.pendingDispatches === 0 && s.pendingRequests === 0 && s.pendingGrowers === 0)
      a.push({ id: 'ok', sev: 'success', title: 'Approval queues are clear', desc: 'No pending requests, registrations or dispatches', to: '/admin/requests' })
    if (full.length === 0)
      a.push({ id: 'okch', sev: 'success', title: 'All chambers below 90% utilisation', desc: `${s.chambers.length} chambers monitored`, to: '/admin/chambers' })
    return a.sort((x, y) => SEV_ORDER[x.sev] - SEV_ORDER[y.sev])
  }, [s])

  /* ---- today's operations ---- */
  const sorted = useMemo(() => [...activities].sort((a, b) => b.timestamp.localeCompare(a.timestamp)), [activities])
  const todays = sorted.filter((a) => a.timestamp.slice(0, 10) === t)
  const shown = (todays.length ? todays : sorted.slice(0, 6)).slice(0, 12)
  const timeline: TimelineItem[] = shown.map((a) => ({
    id: a.id,
    time: todays.length ? fmtTime(a.timestamp) : fmtDateShort(a.timestamp),
    title: a.title,
    desc: a.description,
    tone: a.status === 'warning' ? 'warning' : a.status === 'info' ? 'info' : 'success',
    onClick: () => nav(activityLink(a)),
  }))

  const firstName = (session?.userName ?? 'Manager').split(' ')[0]
  const stored = s.stored
  const utilPct = s.capacity ? (stored / s.capacity) * 100 : 0

  return (
    <div className="page">
      <div className="dash-greet">
        <h1>{greeting()}, {firstName}</h1>
        <div className="dash-meta">
          <span>{settings.storeName}</span>
          <span>Season {settings.season}</span>
          <span>{fmtDate(t)}</span>
        </div>
      </div>

      <div className="dash-actions">
        <Button variant="primary" icon={<PackageOpen />} onClick={() => nav('/admin/boxes')}>Issue boxes</Button>
        <Button variant="primary" icon={<ArrowDownToLine />} onClick={() => nav('/admin/receipts')}>Receive apples</Button>
        <Button icon={<IndianRupee />} onClick={() => nav('/admin/payments?new=1')}>Record payment</Button>
        <Button icon={<ClipboardCheck />} onClick={() => nav('/admin/requests?status=PENDING')}>
          Approve requests {s.pendingRequests > 0 && <span className="dash-count">{s.pendingRequests}</span>}
        </Button>
      </div>

      <div className="dash-kpis">
        <Kpi label="Total Capacity" icon={<Warehouse />} value={num(s.capacity)} unit="boxes" to="/admin/chambers"
          foot={`${utilPct.toFixed(0)}% physically occupied`} progress={utilPct} />
        <Kpi label="Allocated" icon={<Archive />} value={num(s.allocated)} unit="boxes" to="/admin/requests"
          foot={`${num(s.reserved)} yet to arrive`} />
        <Kpi label="Currently Stored" icon={<Boxes />} value={num(stored)} unit="boxes" to="/admin/inventory?status=IN_STORAGE"
          foot={`${num(s.dispatched)} dispatched so far`} />
        <Kpi label="Available Capacity" icon={<PackageCheck />} value={num(s.available)} unit="boxes" to="/admin/chambers"
          foot="Not stored, not reserved" tone={s.capacity && s.available / s.capacity < 0.1 ? 'bad' : undefined} />
        <Kpi label="Boxes Awaiting Return" icon={<Receipt />} value={num(s.awaitingReturn)} unit="boxes" to="/admin/boxes"
          foot={`${num(s.issued)} issued · ${num(s.received)} received`} tone={s.awaitingReturn > 0 ? 'warn' : undefined} />
        <Kpi label="Today's Inward" icon={<ArrowDownToLine />} value={num(s.todayInward)} unit="boxes" to="/admin/receipts?date=today"
          foot="Apples received today" />
        <Kpi label="Today's Outward" icon={<ArrowUpFromLine />} value={num(s.todayOutward)} unit="boxes" to="/admin/dispatch?date=today"
          foot={s.pendingDispatches ? `${s.pendingDispatches} request${s.pendingDispatches > 1 ? 's' : ''} pending` : 'Dispatched today'} />
        <Kpi label="Outstanding" icon={<Wallet />} value={inr(s.outstanding)} to="/admin/payments?status=due"
          foot={`${s.growersWithDue} grower${s.growersWithDue === 1 ? '' : 's'} with dues`} tone={s.outstanding > 0 ? 'bad' : undefined} />
      </div>

      <div className="grid cols-main dash-section">
        <Card title="Capacity" sub="Where every box of capacity stands today">
          <div className="dash-cap-nums">
            <div><b>{num(s.capacity)}</b><small>Total capacity</small></div>
            <div><b>{num(stored)}</b><small>Stored</small></div>
            <div><b>{num(s.reserved)}</b><small>Reserved</small></div>
            <div><b>{num(s.available)}</b><small>Available</small></div>
          </div>
          <SegBar total={s.capacity} segments={[
            { label: 'Stored', value: stored, color: C.primary, onClick: () => nav('/admin/inventory?status=IN_STORAGE') },
            { label: 'Allocated, not yet stored', value: s.reserved, color: C.amber, onClick: () => nav('/admin/boxes') },
            { label: 'Available', value: s.available, color: '#8a9a86', onClick: () => nav('/admin/chambers') },
          ]} />
        </Card>

        <Card title="Alerts" sub="Live from store data" pad={false}>
          <div className="dash-alerts">
            {alerts.map((al) => {
              const Icon = SEV_ICON[al.sev]
              return (
                <Link key={al.id} to={al.to} className={`dash-alert ${al.sev}`}>
                  <span className="dash-sev"><Icon /></span>
                  <div>
                    <div className="dash-alert-title"><span className="dash-sevtag">{SEV_LABEL[al.sev]}</span>{al.title}</div>
                    <div className="dash-alert-desc">{al.desc}</div>
                  </div>
                  <span className="dash-chev"><ChevronRight /></span>
                </Link>
              )
            })}
          </div>
        </Card>
      </div>

      <div className="grid cols-main dash-section">
        <Card title="Storage utilisation" sub="Boxes in store, last 30 days"
          action={<span className="muted num">Now {num(stored)} boxes</span>}>
          <div className="dash-chart tall">
            <ResponsiveContainer>
              <AreaChart data={storageHistory} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: C.grid }} interval={4} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => num(Number(v))} />
                <Tooltip {...tip} formatter={(v) => [`${num(Number(v))} boxes`, 'Stored']} />
                <Area type="monotone" dataKey="stored" stroke={C.primary} strokeWidth={2} fill={C.primary} fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Today's operations" sub={todays.length ? `${todays.length} event${todays.length > 1 ? 's' : ''} today` : 'Nothing logged yet today'}
          action={<Link to="/admin/notifications" className="link" style={{ fontSize: 12.5 }}>All activity</Link>} pad={false}>
          {shown.length === 0 ? (
            <EmptyState title="No activity yet" text="Receipts, dispatches and payments appear here as they happen." />
          ) : (
            <>
              {!todays.length && <div className="dash-empty-note">No events today. Showing the latest activity.</div>}
              <div className="dash-timeline-wrap dash-scroll"><Timeline items={timeline} /></div>
            </>
          )}
        </Card>
      </div>

      <div className="grid cols-2 dash-section">
        <Card title="Inward vs outward" sub="Boxes per day, last 14 days"
          action={<div className="dash-legend"><span><i style={{ background: C.primary }} />Inward</span><span><i style={{ background: C.muted }} />Outward</span></div>}>
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={flow} margin={{ top: 6, right: 4, left: -8, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: C.grid }} interval={1} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => num(Number(v))} />
                <Tooltip {...tip} formatter={(v, n) => [`${num(Number(v))} boxes`, n === 'inward' ? 'Inward' : 'Outward']} />
                <Bar dataKey="inward" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={14} />
                <Bar dataKey="outward" fill={C.muted} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Revenue" sub="Storage charges billed vs payments collected, by month"
          action={<div className="dash-legend"><span><i style={{ background: C.primary }} />Billed</span><span><i style={{ background: C.accent }} />Collected</span></div>}>
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={revenue} margin={{ top: 6, right: 4, left: -4, bottom: 0 }} barGap={3}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: C.grid }} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={52}
                  tickFormatter={(v) => { const n = Number(v); return n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n) }} />
                <Tooltip {...tip} formatter={(v, n) => [inr(Number(v)), n === 'billed' ? 'Billed' : 'Collected']} />
                <Bar dataKey="billed" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={24} />
                <Bar dataKey="collected" fill={C.accent} radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid cols-2 dash-section">
        <Card title="Top growers by stored boxes" sub="Click a bar to open the grower">
          {topGrowers.length === 0 ? (
            <EmptyState title="Nothing in storage" text="Stored boxes per grower will appear here." icon={<Truck />} />
          ) : (
            <div className="dash-chart">
              <ResponsiveContainer>
                <BarChart data={topGrowers} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => num(Number(v))} />
                  <YAxis type="category" dataKey="name" tick={tick} tickLine={false} axisLine={false} width={116}
                    tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)} />
                  <Tooltip {...tip} formatter={(v) => [`${num(Number(v))} boxes`, 'Stored']} />
                  <Bar dataKey="stored" fill={C.primary} radius={[0, 3, 3, 0]} maxBarSize={18} cursor="pointer"
                    onClick={(_: unknown, i: number) => topGrowers[i] && nav(`/admin/growers/${topGrowers[i].id}`)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Lot aging" sub="Days in storage, active lots only">
          <div className="dash-aging">
            {s.aging.map((b) => {
              const share = stored ? (b.boxes / stored) * 100 : 0
              return (
                <Link key={b.bucket} to={`/admin/inventory?bucket=${encodeURIComponent(b.bucket)}`}
                  className={`dash-age ${b.bucket === '90+' && b.lots > 0 ? 'old' : ''}`}>
                  <div className="dash-age-label">{b.bucket} days</div>
                  <div className="dash-age-val">{num(b.boxes)}<small>boxes</small></div>
                  <div className="dash-age-foot">{b.lots} lot{b.lots === 1 ? '' : 's'} · {inr(b.charges)}</div>
                  <div className="progress"><span style={{ width: `${share}%`, background: b.bucket === '90+' ? 'var(--red)' : undefined }} /></div>
                </Link>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
