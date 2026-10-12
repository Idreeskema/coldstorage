import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell as PieCell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { Button, Card, EmptyState, Input, PageHeader, StatusPill, toast } from '../../ui'
import { useDerived, useStore } from '../../core/store'
import { fmtDate, fmtDateShort, inr, num, rateLabel, today } from '../../core/format'
import './reports.css'

/* ---------- report model ---------- */

type Cell = string | number | null
type Kind = 'text' | 'num' | 'inr' | 'pct' | 'date' | 'status' | 'mono'
interface Col { label: string; kind?: Kind }
interface ReportData {
  cols: Col[]
  rows: Cell[][]
  totals?: Cell[]
  links?: (string | undefined)[] // optional per-row route
  chart?: ReactNode
  kpis?: { label: string; value: string }[]
  empty?: string
}
interface ReportDef { id: string; label: string; desc: string; dated: boolean; dateLabel?: string }

const REPORTS: ReportDef[] = [
  { id: 'storage', label: 'Storage Utilization', desc: 'Capacity split into stored, reserved and available boxes', dated: false },
  { id: 'growers', label: 'Grower-wise Inventory', desc: 'Allocation, issue, receipt and stock position per grower', dated: false },
  { id: 'inward', label: 'Daily Inward', desc: 'Apple boxes received into the store each day', dated: true, dateLabel: 'Received date' },
  { id: 'outward', label: 'Daily Outward', desc: 'Boxes dispatched out of the store each day', dated: true, dateLabel: 'Dispatch date' },
  { id: 'alloc', label: 'Box Allocation', desc: 'Allocations with issue and receipt progress', dated: true, dateLabel: 'Allocation date' },
  { id: 'issue', label: 'Box Issue', desc: 'Empty boxes issued to growers', dated: true, dateLabel: 'Issue date' },
  { id: 'movement', label: 'Crate Movement', desc: 'Crates given to and received from growers, with route, driver and remarks', dated: true, dateLabel: 'Movement date' },
  { id: 'charges', label: 'Storage Charges', desc: 'Charges accrued per lot to date (per-crate lots are a flat charge)', dated: true, dateLabel: 'Storage start date' },
  { id: 'payments', label: 'Payment Collection', desc: 'Payments received from growers', dated: true, dateLabel: 'Payment date' },
  { id: 'outstanding', label: 'Outstanding Payments', desc: 'Growers with charges still unpaid, and advances held', dated: false },
  { id: 'chambers', label: 'Chamber Utilization', desc: 'Occupancy, rack fill and holding time per chamber', dated: false },
  { id: 'aging', label: 'Lot Aging', desc: 'Lots in storage grouped by days stored', dated: false },
  { id: 'dispatch', label: 'Dispatch Report', desc: 'All dispatch requests and their outcome', dated: true, dateLabel: 'Request date' },
]

const C = { primary: '#1f4d36', accent: '#6ba43a', amber: '#d19a3a', blue: '#2f6a8a', grid: '#e8e4da', faint: '#9aa396' }

const fmtCell = (v: Cell, kind: Kind = 'text'): string => {
  if (v === null || v === '') return '—'
  if (typeof v === 'string') return kind === 'date' ? fmtDate(v) : v
  if (kind === 'inr') return inr(v)
  if (kind === 'pct') return `${v.toFixed(1)}%`
  return num(v)
}

const csvEscape = (v: Cell) => {
  const s = v === null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : v
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(name: string, r: ReportData) {
  const lines = [r.cols.map((c) => csvEscape(c.label)).join(',')]
  for (const row of r.rows) lines.push(row.map(csvEscape).join(','))
  if (r.totals) lines.push(r.totals.map(csvEscape).join(','))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------- small chart helpers ---------- */

const axis = { fontSize: 11.5, fill: C.faint }
function BarTrend({ data, xKey, yKey, color = C.primary, money, unit }: {
  data: Record<string, string | number>[]; xKey: string; yKey: string; color?: string; money?: boolean; unit?: string
}) {
  return (
    <div className="rep-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={axis} tickLine={false} axisLine={{ stroke: C.grid }} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={money ? 56 : 44}
            tickFormatter={(v) => (money ? (v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`) : num(Number(v)))} />
          <Tooltip cursor={{ fill: 'rgba(31,77,54,0.06)' }}
            formatter={(v) => [money ? inr(Number(v)) : `${num(Number(v))}${unit ? ` ${unit}` : ''}`, '']}
            separator="" contentStyle={{ borderRadius: 8, border: `1px solid ${C.grid}`, fontSize: 12.5 }} />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------- page ---------- */

export default function ReportsPage() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const d = useDerived()
  const growers = useStore((s) => s.growers)
  const allocations = useStore((s) => s.allocations)
  const boxIssues = useStore((s) => s.boxIssues)
  const receipts = useStore((s) => s.receipts)
  const dispatches = useStore((s) => s.dispatches)
  const payments = useStore((s) => s.payments)
  const settings = useStore((s) => s.settings)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const def = REPORTS.find((r) => r.id === sp.get('report')) ?? REPORTS[0]

  useEffect(() => {
    if (!menu) return
    const h = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menu])

  const gName = useMemo(() => new Map(growers.map((g) => [g.id, g.name])), [growers])
  const gn = (id: string) => gName.get(id) ?? 'Unknown'

  const report: ReportData = useMemo(() => {
    const inRange = (iso: string) => {
      const day = iso.slice(0, 10)
      return (!from || day >= from) && (!to || day <= to)
    }
    const sum = (rows: Cell[][], i: number) => rows.reduce((s, r) => s + (Number(r[i]) || 0), 0)
    const st = d.store
    const completed = dispatches.filter((x) => x.status === 'COMPLETED' && x.completedDate)
    const lotCode = (id: string) => d.lotById.get(id)?.code ?? '—'
    const allocCode = (id: string) => allocations.find((a) => a.id === id)?.code ?? '—'

    switch (def.id) {
      case 'storage': {
        const slices = [
          { name: 'Stored', value: st.stored, color: C.primary },
          { name: 'Reserved', value: st.reserved, color: C.amber },
          { name: 'Available', value: st.available, color: C.accent },
        ]
        const rows: Cell[][] = slices.map((s) => [s.name, s.value, st.capacity ? (s.value / st.capacity) * 100 : 0])
        return {
          cols: [{ label: 'Capacity bucket' }, { label: 'Boxes', kind: 'num' }, { label: '% of capacity', kind: 'pct' }],
          rows,
          totals: ['Total capacity', st.capacity, 100],
          kpis: [
            { label: 'Total capacity', value: num(st.capacity) },
            { label: 'Stored', value: num(st.stored) },
            { label: 'Reserved (allocated, not received)', value: num(st.reserved) },
            { label: 'Available', value: num(st.available) },
          ],
          chart: (
            <div className="rep-chart rep-chart-pie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="none">
                    {slices.map((s) => <PieCell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => num(Number(v))} contentStyle={{ borderRadius: 8, border: `1px solid ${C.grid}`, fontSize: 12.5 }} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="rep-legend">
                {slices.map((s) => <li key={s.name}><i style={{ background: s.color }} />{s.name}<b className="num">{num(s.value)}</b></li>)}
              </ul>
            </div>
          ),
        }
      }

      case 'growers': {
        const links: string[] = []
        const rows: Cell[][] = []
        for (const g of growers) {
          const s = d.growerStats.get(g.id)
          if (!s || (s.allocated === 0 && s.lots === 0)) continue
          rows.push([g.name, g.code, s.allocated, s.issued, s.received, s.dispatched, s.stored, s.awaitingReturn, s.activeLots])
          links.push(`/admin/growers/${g.id}`)
        }
        return {
          cols: [{ label: 'Grower' }, { label: 'Code', kind: 'mono' }, { label: 'Allocated', kind: 'num' }, { label: 'Issued', kind: 'num' },
            { label: 'Received', kind: 'num' }, { label: 'Dispatched', kind: 'num' }, { label: 'In storage', kind: 'num' },
            { label: 'Boxes awaiting return', kind: 'num' }, { label: 'Active lots', kind: 'num' }],
          rows, links,
          totals: ['Total', null, ...[2, 3, 4, 5, 6, 7, 8].map((i) => sum(rows, i))],
          empty: 'No growers have an allocation or stored lot yet.',
        }
      }

      case 'inward': {
        const by = new Map<string, { n: number; boxes: number; g: Set<string> }>()
        for (const r of receipts.filter((x) => inRange(x.receivedDate))) {
          const e = by.get(r.receivedDate) ?? { n: 0, boxes: 0, g: new Set<string>() }
          e.n++; e.boxes += r.boxes; e.g.add(r.growerId)
          by.set(r.receivedDate, e)
        }
        const days = [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
        const rows: Cell[][] = days.map(([day, e]) => [day, e.n, e.g.size, e.boxes])
        return {
          cols: [{ label: 'Date', kind: 'date' }, { label: 'Receipts', kind: 'num' }, { label: 'Growers', kind: 'num' }, { label: 'Boxes received', kind: 'num' }],
          rows, totals: ['Total', sum(rows, 1), null, sum(rows, 3)],
          chart: rows.length > 1 ? <BarTrend data={days.map(([day, e]) => ({ day: fmtDateShort(day), boxes: e.boxes }))} xKey="day" yKey="boxes" unit="boxes" /> : undefined,
          empty: 'No apples were received in this date range.',
        }
      }

      case 'outward': {
        const by = new Map<string, { n: number; boxes: number; g: Set<string> }>()
        for (const x of completed.filter((q) => inRange(q.completedDate!))) {
          const e = by.get(x.completedDate!) ?? { n: 0, boxes: 0, g: new Set<string>() }
          e.n++; e.boxes += x.quantity; e.g.add(x.growerId)
          by.set(x.completedDate!, e)
        }
        const days = [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
        const rows: Cell[][] = days.map(([day, e]) => [day, e.n, e.g.size, e.boxes])
        return {
          cols: [{ label: 'Date', kind: 'date' }, { label: 'Dispatches', kind: 'num' }, { label: 'Growers', kind: 'num' }, { label: 'Boxes dispatched', kind: 'num' }],
          rows, totals: ['Total', sum(rows, 1), null, sum(rows, 3)],
          chart: rows.length > 1 ? <BarTrend data={days.map(([day, e]) => ({ day: fmtDateShort(day), boxes: e.boxes }))} xKey="day" yKey="boxes" color={C.blue} unit="boxes" /> : undefined,
          empty: 'No dispatches were completed in this date range.',
        }
      }

      case 'alloc': {
        const list = allocations.filter((a) => inRange(a.createdAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const rows: Cell[][] = list.map((a) => {
          const s = d.allocStats.get(a.id)
          return [a.createdAt.slice(0, 10), a.code, gn(a.growerId), a.boxes, s?.issued ?? 0, s?.remainingToIssue ?? 0, s?.received ?? 0, s?.awaitingReturn ?? 0, s?.status ?? '']
        })
        return {
          cols: [{ label: 'Date', kind: 'date' }, { label: 'Allocation', kind: 'mono' }, { label: 'Grower' }, { label: 'Allocated', kind: 'num' },
            { label: 'Issued', kind: 'num' }, { label: 'Remaining to issue', kind: 'num' }, { label: 'Apples received', kind: 'num' },
            { label: 'Awaiting return', kind: 'num' }, { label: 'Status', kind: 'status' }],
          rows, links: list.map((a) => `/admin/boxes?allocation=${a.id}`),
          totals: ['Total', null, null, ...[3, 4, 5, 6, 7].map((i) => sum(rows, i)), null],
          empty: 'No allocations were made in this date range.',
        }
      }

      case 'issue': {
        const list = boxIssues.filter((b) => inRange(b.date)).sort((a, b) => b.date.localeCompare(a.date))
        const rows: Cell[][] = list.map((b) => [b.date, b.code, gn(b.growerId), allocCode(b.allocationId), b.boxType, b.quantity, b.issuedBy, b.vehicle ?? null])
        const byDay = new Map<string, number>()
        for (const b of list) byDay.set(b.date, (byDay.get(b.date) ?? 0) + b.quantity)
        const trend = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, q]) => ({ day: fmtDateShort(day), boxes: q }))
        return {
          cols: [{ label: 'Date', kind: 'date' }, { label: 'Issue no.', kind: 'mono' }, { label: 'Grower' }, { label: 'Allocation', kind: 'mono' },
            { label: 'Box type' }, { label: 'Boxes', kind: 'num' }, { label: 'Issued by' }, { label: 'Vehicle' }],
          rows, totals: ['Total', null, null, null, null, sum(rows, 5), null, null],
          chart: trend.length > 1 ? <BarTrend data={trend} xKey="day" yKey="boxes" unit="boxes" /> : undefined,
          empty: 'No boxes were issued in this date range.',
        }
      }

      case 'charges': {
        const list = d.lots.filter((l) => inRange(l.storageStartDate)).sort((a, b) => b.accrued - a.accrued)
        const rows: Cell[][] = list.map((l) => [l.code, l.growerName, l.storageStartDate, l.rateType === 'PER_CRATE' ? null : l.days, l.boxesReceived, l.current,
          rateLabel(l.rateType, l.rate), l.accrued])
        return {
          cols: [{ label: 'Lot', kind: 'mono' }, { label: 'Grower' }, { label: 'Storage start', kind: 'date' }, { label: 'Days', kind: 'num' },
            { label: 'Boxes received', kind: 'num' }, { label: 'In storage', kind: 'num' }, { label: 'Rate' }, { label: 'Charges to date', kind: 'inr' }],
          rows, links: list.map((l) => `/admin/inventory/${l.id}`),
          totals: ['Total', null, null, null, sum(rows, 4), sum(rows, 5), null, sum(rows, 7)],
          chart: rows.length > 0 ? (
            <BarTrend money xKey="name" yKey="charges" color={C.accent}
              data={list.slice(0, 10).map((l) => ({ name: l.code.replace('LOT-', ''), charges: Math.round(l.accrued) }))} />
          ) : undefined,
          empty: 'No lots started storage in this date range.',
        }
      }

      case 'movement': {
        type Leg = { date: string; kind: string; ref: string; growerId: string; alloc: string; crates: number; from: string; to: string; driver: string | null; vehicle: string | null; remark: string | null }
        const legs: Leg[] = [
          ...boxIssues.filter((b) => inRange(b.date)).map((b): Leg => ({
            date: b.date, kind: 'Given', ref: b.code, growerId: b.growerId, alloc: allocCode(b.allocationId), crates: b.quantity,
            from: b.fromLocation || 'Store', to: gn(b.growerId), driver: b.driver ?? null, vehicle: b.vehicle ?? null, remark: b.notes ?? null,
          })),
          ...receipts.filter((r) => inRange(r.receivedDate)).map((r): Leg => ({
            date: r.receivedDate, kind: 'Received', ref: r.code, growerId: r.growerId, alloc: allocCode(r.allocationId), crates: r.boxes,
            from: r.sourceLocation || gn(r.growerId), to: r.destination || 'Store', driver: r.driver ?? null, vehicle: r.vehicle ?? null,
            remark: [r.remark, r.notes].filter(Boolean).join(' · ') || null,
          })),
        ].sort((a, b) => b.date.localeCompare(a.date) || a.ref.localeCompare(b.ref))
        const rows: Cell[][] = legs.map((l) => [l.date, l.kind, l.ref, gn(l.growerId), l.alloc, l.crates, l.from, l.to, l.driver, l.vehicle, l.remark])
        const given = legs.filter((l) => l.kind === 'Given').reduce((s, l) => s + l.crates, 0)
        const recv = legs.filter((l) => l.kind === 'Received').reduce((s, l) => s + l.crates, 0)
        return {
          cols: [{ label: 'Date', kind: 'date' }, { label: 'Movement', kind: 'status' }, { label: 'Ref', kind: 'mono' }, { label: 'Grower' }, { label: 'Agreement', kind: 'mono' },
            { label: 'Crates', kind: 'num' }, { label: 'From' }, { label: 'To' }, { label: 'Driver' }, { label: 'Vehicle' }, { label: 'Remark' }],
          rows, totals: ['Total', null, null, null, null, sum(rows, 5), null, null, null, null, null],
          kpis: [
            { label: 'Crates given', value: num(given) },
            { label: 'Crates received', value: num(recv) },
            { label: 'Difference (given − received)', value: num(given - recv) },
            { label: 'Movements', value: num(legs.length) },
          ],
          empty: 'No crate movements in this date range.',
        }
      }

      case 'payments': {
        const list = payments.filter((p) => inRange(p.date)).sort((a, b) => b.date.localeCompare(a.date))
        const rows: Cell[][] = list.map((p) => [p.date, p.code, gn(p.growerId), p.method, p.reference ?? null, p.amount])
        const byMethod = new Map<string, number>()
        for (const p of list) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
        return {
          cols: [{ label: 'Date', kind: 'date' }, { label: 'Receipt no.', kind: 'mono' }, { label: 'Grower' }, { label: 'Method' }, { label: 'Reference' }, { label: 'Amount', kind: 'inr' }],
          rows, totals: ['Total collected', null, null, null, null, sum(rows, 5)],
          chart: byMethod.size > 0 ? (
            <BarTrend money xKey="method" yKey="amount" color={C.primary}
              data={[...byMethod.entries()].map(([method, amount]) => ({ method, amount }))} />
          ) : undefined,
          empty: 'No payments were received in this date range.',
        }
      }

      case 'outstanding': {
        const list = growers.map((g) => ({ g, s: d.growerStats.get(g.id)! })).filter((x) => x.s && Math.abs(x.s.due) > 1)
          .sort((a, b) => b.s.due - a.s.due)
        const rows: Cell[][] = list.map(({ g, s }) => [g.name, g.code, g.phone, s.charges, s.paid, Math.max(0, s.due), Math.max(0, -s.due), s.due > 1 && s.charges ? (s.due / s.charges) * 100 : 0])
        const dues = list.filter(({ s }) => s.due > 1)
        return {
          cols: [{ label: 'Grower' }, { label: 'Code', kind: 'mono' }, { label: 'Mobile' }, { label: 'Total charges', kind: 'inr' },
            { label: 'Paid', kind: 'inr' }, { label: 'Outstanding', kind: 'inr' }, { label: 'Advance held', kind: 'inr' }, { label: '% unpaid', kind: 'pct' }],
          rows, links: list.map(({ g }) => `/admin/ledger/${g.id}`),
          totals: ['Total', null, null, sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6), null],
          kpis: [
            { label: 'Total charges', value: inr(st.totalCharges) },
            { label: 'Collected', value: inr(st.paid) },
            { label: 'Outstanding', value: inr(st.outstanding) },
            { label: 'Advances held', value: inr(st.advances) },
          ],
          chart: dues.length > 0 ? (
            <BarTrend money xKey="name" yKey="due" color={C.amber}
              data={dues.slice(0, 8).map(({ g, s }) => ({ name: g.name.split(' ')[0], due: Math.round(s.due) }))} />
          ) : undefined,
          empty: 'No outstanding payments or advances. Every grower is settled.',
        }
      }

      case 'chambers': {
        const rows: Cell[][] = st.chambers.map((c) => [
          c.chamber.id, c.chamber.tempC, c.chamber.capacity, c.occupied, c.available, c.pct, c.lotCount, c.growerCount, c.avgDays,
          c.racks.filter((r) => r.state === 'FULL').length, c.racks.filter((r) => r.state === 'PARTIAL').length, c.racks.filter((r) => r.state === 'EMPTY').length,
        ])
        return {
          cols: [{ label: 'Chamber', kind: 'mono' }, { label: 'Temp (°C)' }, { label: 'Capacity', kind: 'num' }, { label: 'Occupied', kind: 'num' },
            { label: 'Available', kind: 'num' }, { label: 'Utilization', kind: 'pct' }, { label: 'Lots', kind: 'num' }, { label: 'Growers', kind: 'num' },
            { label: 'Avg. days stored', kind: 'num' }, { label: 'Racks full', kind: 'num' }, { label: 'Racks partial', kind: 'num' }, { label: 'Racks empty', kind: 'num' }],
          rows, links: st.chambers.map((c) => `/admin/chambers/${c.chamber.id}`),
          totals: ['All chambers', null, sum(rows, 2), sum(rows, 3), sum(rows, 4), sum(rows, 2) ? (sum(rows, 3) / sum(rows, 2)) * 100 : 0, sum(rows, 6), null, null, sum(rows, 9), sum(rows, 10), sum(rows, 11)],
          chart: rows.length > 0 ? <BarTrend xKey="chamber" yKey="pct" color={C.accent} unit="%" data={st.chambers.map((c) => ({ chamber: c.chamber.id, pct: Math.round(c.pct) }))} /> : undefined,
          empty: 'No chambers are configured.',
        }
      }

      case 'aging': {
        const label: Record<string, string> = { '0-30': '0–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days' }
        const totalBoxes = st.aging.reduce((s, a) => s + a.boxes, 0)
        const rows: Cell[][] = st.aging.map((a) => [label[a.bucket], a.lots, a.boxes, totalBoxes ? (a.boxes / totalBoxes) * 100 : 0, a.charges])
        return {
          cols: [{ label: 'Age bucket' }, { label: 'Lots', kind: 'num' }, { label: 'Boxes in storage', kind: 'num' }, { label: '% of boxes', kind: 'pct' }, { label: 'Est. charges', kind: 'inr' }],
          rows, links: st.aging.map((a) => `/admin/inventory?bucket=${encodeURIComponent(a.bucket)}`),
          totals: ['Total', sum(rows, 1), sum(rows, 2), totalBoxes ? 100 : 0, sum(rows, 4)],
          chart: <BarTrend xKey="bucket" yKey="boxes" unit="boxes" data={st.aging.map((a) => ({ bucket: label[a.bucket], boxes: a.boxes }))} />,
        }
      }

      default: {
        const list = dispatches.filter((x) => inRange(x.requestedAt)).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        const rows: Cell[][] = list.map((x) => [x.requestedAt.slice(0, 10), x.code, gn(x.growerId), lotCode(x.lotId), x.quantity, x.status, x.completedDate ?? null, x.vehicle ?? null])
        const done = list.filter((x) => x.status === 'COMPLETED').reduce((s, x) => s + x.quantity, 0)
        return {
          cols: [{ label: 'Requested', kind: 'date' }, { label: 'Gate pass', kind: 'mono' }, { label: 'Grower' }, { label: 'Lot', kind: 'mono' },
            { label: 'Boxes', kind: 'num' }, { label: 'Status', kind: 'status' }, { label: 'Completed', kind: 'date' }, { label: 'Vehicle' }],
          rows, totals: ['Total requested', null, null, null, sum(rows, 4), null, null, null],
          kpis: [
            { label: 'Requests', value: num(list.length) },
            { label: 'Boxes dispatched', value: num(done) },
            { label: 'Pending', value: num(list.filter((x) => x.status === 'PENDING').length) },
            { label: 'Rejected', value: num(list.filter((x) => x.status === 'REJECTED').length) },
          ],
          empty: 'No dispatch requests in this date range.',
        }
      }
    }
  }, [def.id, from, to, d, growers, allocations, boxIssues, receipts, dispatches, payments, gName])

  const rangeLabel = !def.dated ? `As of ${fmtDate(today())}` : from || to ? `${from ? fmtDate(from) : 'Start'} to ${to ? fmtDate(to) : fmtDate(today())}` : 'All dates'
  const fileName = `${def.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}.csv`

  const select = (id: string) => {
    const next = new URLSearchParams(sp)
    next.set('report', id)
    setSp(next, { replace: true })
  }
  const exportCsv = () => {
    setMenu(false)
    if (!report.rows.length) return toast('Nothing to export for this report', 'error')
    downloadCsv(fileName, report)
    toast(`${fileName} downloaded`)
  }
  const placeholder = (what: string) => { setMenu(false); toast(`${what} export is a placeholder in this POC. Use CSV or Print.`) }

  const cellEl = (v: Cell, c: Col, link?: string, first?: boolean): ReactNode => {
    if (c.kind === 'status' && typeof v === 'string') return <StatusPill status={v.replace(/ /g, '_')} label={v} />
    const text = fmtCell(v, c.kind)
    if (first && link) return <Link to={link} className="link">{text}</Link>
    return text
  }
  const rightAlign = (k?: Kind) => k === 'num' || k === 'inr' || k === 'pct'

  return (
    <div className="page rep-page">
      <PageHeader
        title="Reports"
        sub={`${settings.storeName} · ${settings.season}`}
        actions={
          <>
            <Button icon={<Printer />} onClick={() => window.print()}>Print</Button>
            <div className="rep-menu" ref={menuRef}>
              <Button variant="primary" icon={<Download />} onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                Export <ChevronDown />
              </Button>
              {menu && (
                <div className="rep-menu-pop" role="menu">
                  <button role="menuitem" onClick={exportCsv}><FileText />CSV (.csv)</button>
                  <button role="menuitem" onClick={() => placeholder('Excel')}><FileSpreadsheet />Excel (.xlsx)</button>
                  <button role="menuitem" onClick={() => placeholder('PDF')}><FileText />PDF (.pdf)</button>
                </div>
              )}
            </div>
          </>
        }
      />

      <div className="rep-layout">
        <nav className="rep-nav rep-noprint" aria-label="Reports">
          {REPORTS.map((r, i) => (
            <button key={r.id} className={`rep-nav-item ${r.id === def.id ? 'on' : ''}`} onClick={() => select(r.id)} aria-current={r.id === def.id}>
              <span className="rep-nav-n">{i + 1}</span>{r.label}
            </button>
          ))}
        </nav>

        <div className="rep-main">
          <div className="card rep-filters rep-noprint">
            {def.dated ? (
              <>
                <div className="rep-filter"><label>From</label><Input type="date" className="sm" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
                <div className="rep-filter"><label>To</label><Input type="date" className="sm" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
                <Button size="sm" variant="ghost" disabled={!from && !to} onClick={() => { setFrom(''); setTo('') }}>Clear</Button>
                <span className="muted rep-filter-note">Filters by {def.dateLabel?.toLowerCase()}</span>
              </>
            ) : (
              <span className="muted">Snapshot report — reflects current store data as of {fmtDate(today())}; date filters do not apply.</span>
            )}
          </div>

          <div className="rep-print">
            <div className="rep-doc-head">
              <div>
                <h2>{def.label}</h2>
                <div className="muted">{def.desc}</div>
              </div>
              <div className="rep-doc-meta">
                <div>{settings.storeName}</div>
                <div className="muted">{rangeLabel} · {report.rows.length} {report.rows.length === 1 ? 'row' : 'rows'}</div>
              </div>
            </div>

            {report.kpis && (
              <div className="rep-kpis">
                {report.kpis.map((k) => (
                  <div className="card rep-kpi" key={k.label}>
                    <div className="rep-kpi-l">{k.label}</div>
                    <div className="rep-kpi-v num">{k.value}</div>
                  </div>
                ))}
              </div>
            )}

            {report.chart && <Card className="rep-chart-card" title="Trend" sub={def.id === 'aging' ? 'Boxes by age bucket' : undefined}>{report.chart}</Card>}

            <Card pad={false} className="rep-table-card">
              {report.rows.length === 0 ? (
                <EmptyState title="No data" text={report.empty ?? 'Nothing to show for this report.'} />
              ) : (
                <div className="table-wrap">
                  <table className="tbl rep-tbl">
                    <thead>
                      <tr>{report.cols.map((c) => <th key={c.label} className={rightAlign(c.kind) ? 'r' : ''}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, i) => {
                        const link = report.links?.[i]
                        return (
                          <tr key={i} className={link ? 'click' : ''} onClick={link ? () => nav(link) : undefined}>
                            {row.map((v, j) => {
                              const c = report.cols[j]
                              const cls = `${rightAlign(c.kind) ? 'r num' : ''} ${c.kind === 'mono' ? 'mono' : ''} ${j === 0 ? 'strong' : ''}`
                              return <td key={j} className={cls}>{cellEl(v, c, link, j === 0)}</td>
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                    {report.totals && (
                      <tfoot>
                        <tr>
                          {report.totals.map((v, j) => {
                            const c = report.cols[j]
                            return <td key={j} className={rightAlign(c.kind) ? 'r num' : ''}>{v === null ? '' : fmtCell(v, c.kind)}</td>
                          })}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Card>
            {def.id === 'aging' && <p className="muted rep-hint rep-noprint">Select a bucket row to open the matching lots in Inventory.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
