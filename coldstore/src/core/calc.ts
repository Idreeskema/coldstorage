// Pure business calculations. Every screen derives its numbers from here so that
// the same formulas are used consistently (see spec §32):
//   Remaining to issue = Allocated − Issued
//   Unreturned boxes   = Issued − Apple received
//   Current storage    = Apple received − Dispatched
//   Reserved capacity  = Σ max(0, Allocated − Received)   (allocated, not yet in store)
//   Available capacity = Capacity − Stored − Reserved
//   Outstanding        = Total charges − Payments
import type {
  Activity, Allocation, AppleReceipt, BoxIssue, Chamber, Dispatch, Grower, Lot, Notification,
  Payment, Settings, StorageRequest,
} from './types'
import { addDays, daysBetween, today } from './format'

export interface Data {
  growers: Grower[]
  requests: StorageRequest[]
  allocations: Allocation[]
  boxIssues: BoxIssue[]
  receipts: AppleReceipt[]
  lots: Lot[]
  dispatches: Dispatch[]
  payments: Payment[]
  chambers: Chamber[]
  activities: Activity[]
  notifications: Notification[]
  settings: Settings
}

export type LotStatus = 'IN_STORAGE' | 'PARTIAL' | 'READY' | 'COMPLETED'
export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+'

export interface LotView extends Lot {
  growerName: string
  growerCode: string
  dispatched: number
  current: number
  pendingDispatch: number // quantity in PENDING dispatch requests
  days: number // days stored (frozen at last dispatch once empty)
  accrued: number // charges to date
  status: LotStatus
  rackLabel: string
  ageBucket: AgeBucket
  daysToRelease: number
}

export interface AllocStats {
  allocationId: string
  allocated: number
  issued: number
  received: number
  remainingToIssue: number // allocated − issued
  awaitingReturn: number // issued − received (empty boxes still with grower)
  remainingAllocation: number // allocated − received
  status: 'Not Issued' | 'Partially Issued' | 'Fully Issued' | 'Apples Received' | 'Completed'
}

export interface GrowerStats {
  growerId: string
  allocated: number
  issued: number
  received: number
  dispatched: number
  stored: number
  awaitingReturn: number
  charges: number
  paid: number
  due: number
  lots: number
  activeLots: number
}

export interface RackCell {
  n: number
  label: string
  capacity: number
  occupied: number
  state: 'FULL' | 'PARTIAL' | 'EMPTY'
}

export interface ChamberStat {
  chamber: Chamber
  occupied: number
  available: number
  pct: number
  lotCount: number
  growerCount: number
  avgDays: number
  racks: RackCell[]
  lots: LotView[]
}

export interface StoreStats {
  capacity: number
  allocated: number
  issued: number
  received: number
  dispatched: number
  stored: number
  awaitingReturn: number // issued − received
  remainingToIssue: number
  reserved: number // allocated but not yet in store
  available: number
  todayInward: number
  todayOutward: number
  totalCharges: number
  paid: number
  outstanding: number
  growersWithDue: number
  pendingRequests: number
  pendingGrowers: number
  pendingDispatches: number
  lotsNearingEnd: number
  chambers: ChamberStat[]
  aging: { bucket: AgeBucket; lots: number; boxes: number; charges: number }[]
}

export interface Derived {
  lots: LotView[]
  lotById: Map<string, LotView>
  growerStats: Map<string, GrowerStats>
  allocStats: Map<string, AllocStats>
  store: StoreStats
}

/* ---------- charges ---------- */

/** Storage charge for one lot as of a date. Dispatched boxes stop accruing on their dispatch date. */
export function lotCharge(lot: Lot, dispatches: Dispatch[], asOf: string): number {
  if (asOf < lot.storageStartDate) return 0
  if (lot.rateType === 'PER_SEASON') return lot.rate * lot.boxesReceived
  const done = dispatches
    .filter((d) => d.lotId === lot.id && d.status === 'COMPLETED' && d.completedDate)
    .sort((a, b) => a.completedDate!.localeCompare(b.completedDate!))
  let remaining = lot.boxesReceived
  let prev = lot.storageStartDate
  let boxDays = 0
  for (const d of done) {
    const when = d.completedDate! > asOf ? asOf : d.completedDate! < prev ? prev : d.completedDate!
    boxDays += remaining * daysBetween(prev, when)
    prev = when
    if (d.completedDate! <= asOf) remaining -= d.quantity
  }
  if (remaining > 0) boxDays += remaining * Math.max(0, daysBetween(prev, asOf))
  return lot.rateType === 'PER_DAY' ? lot.rate * boxDays : (lot.rate * boxDays) / 30
}

/** Quick estimate for the "charge calculator": boxes × days at a rate. */
export function estimateCharge(boxes: number, days: number, rateType: Lot['rateType'], rate: number) {
  if (rateType === 'PER_SEASON') return boxes * rate
  return rateType === 'PER_DAY' ? boxes * days * rate : (boxes * days * rate) / 30
}

export const bucketOf = (days: number): AgeBucket =>
  days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'

/* ---------- ledger ---------- */

export interface LedgerRow {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  balance: number
  ref?: string
  kind: 'CHARGE' | 'PAYMENT'
}

/** Charges are billed per 30-day cycle per lot, with the running cycle shown as "accrued to date". */
export function buildLedger(data: Data, growerId: string, asOf = today()): LedgerRow[] {
  const rows: Omit<LedgerRow, 'balance'>[] = []
  const lots = data.lots.filter((l) => l.growerId === growerId)
  for (const lot of lots) {
    if (lot.rateType === 'PER_SEASON') {
      rows.push({
        id: `c-${lot.id}`, date: lot.storageStartDate, kind: 'CHARGE',
        description: `Season storage charge — ${lot.code}`, ref: lot.code,
        debit: lotCharge(lot, data.dispatches, asOf), credit: 0,
      })
      continue
    }
    let prevDate = lot.storageStartDate
    let prevCharge = 0
    let cycle = 1
    for (;;) {
      const end = addDays(lot.storageStartDate, 30 * cycle)
      if (end > asOf) break
      const c = lotCharge(lot, data.dispatches, end)
      if (c - prevCharge > 0.5)
        rows.push({
          id: `c-${lot.id}-${cycle}`, date: end, kind: 'CHARGE', ref: lot.code,
          description: `Storage charge — ${lot.code} (days ${30 * (cycle - 1) + 1}–${30 * cycle})`,
          debit: c - prevCharge, credit: 0,
        })
      prevCharge = c
      prevDate = end
      cycle++
    }
    const now = lotCharge(lot, data.dispatches, asOf)
    if (now - prevCharge > 0.5)
      rows.push({
        id: `c-${lot.id}-run`, date: asOf, kind: 'CHARGE', ref: lot.code,
        description: `Storage accrued to date — ${lot.code} (${daysBetween(prevDate, asOf)} days into cycle)`,
        debit: now - prevCharge, credit: 0,
      })
  }
  for (const p of data.payments.filter((p) => p.growerId === growerId))
    rows.push({
      id: p.id, date: p.date, kind: 'PAYMENT', ref: p.code,
      description: `Payment received — ${p.method}${p.reference ? ` (${p.reference})` : ''}`,
      debit: 0, credit: p.amount,
    })
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'CHARGE' ? -1 : 1))
  let bal = 0
  return rows.map((r) => ({ ...r, balance: (bal += r.debit - r.credit) }))
}

/* ---------- derivation ---------- */

export function derive(data: Data, asOf = today()): Derived {
  const completed = data.dispatches.filter((d) => d.status === 'COMPLETED')
  const pendingByLot = new Map<string, number>()
  for (const d of data.dispatches) if (d.status === 'PENDING') pendingByLot.set(d.lotId, (pendingByLot.get(d.lotId) ?? 0) + d.quantity)

  const growerById = new Map(data.growers.map((g) => [g.id, g]))
  const lots: LotView[] = data.lots.map((lot) => {
    const dispatched = completed.filter((d) => d.lotId === lot.id).reduce((s, d) => s + d.quantity, 0)
    const current = lot.boxesReceived - dispatched
    const lastOut = completed.filter((d) => d.lotId === lot.id).map((d) => d.completedDate!).sort().pop()
    const endDay = current === 0 && lastOut ? lastOut : asOf
    const days = Math.max(0, daysBetween(lot.storageStartDate, endDay))
    const daysToRelease = daysBetween(asOf, lot.expectedReleaseDate)
    const status: LotStatus =
      current === 0 ? 'COMPLETED' : daysToRelease <= 0 ? 'READY' : dispatched > 0 ? 'PARTIAL' : 'IN_STORAGE'
    const g = growerById.get(lot.growerId)
    return {
      ...lot,
      growerName: g?.name ?? 'Unknown', growerCode: g?.code ?? '',
      dispatched, current, pendingDispatch: pendingByLot.get(lot.id) ?? 0,
      days, accrued: lotCharge(lot, data.dispatches, asOf), status,
      rackLabel: '', ageBucket: bucketOf(days), daysToRelease,
    }
  })
  const lotById = new Map(lots.map((l) => [l.id, l]))

  /* chambers + racks */
  const chambers: ChamberStat[] = data.chambers.map((chamber) => {
    const cl = lots.filter((l) => l.chamberId === chamber.id && l.current > 0)
      .sort((a, b) => a.rackStart - b.rackStart || a.code.localeCompare(b.code))
    const per = chamber.capacity / chamber.racks
    const occ = new Array(chamber.racks).fill(0)
    for (const l of cl) {
      let left = l.current
      let first = -1, last = -1
      for (let i = l.rackStart - 1; left > 0 && i < chamber.racks; i++) {
        const take = Math.min(left, per - occ[i])
        if (take > 0) { occ[i] += take; left -= take; if (first < 0) first = i; last = i }
      }
      // overflow beyond racks (shouldn't happen): park in the emptiest racks
      for (let i = 0; left > 0 && i < chamber.racks; i++) {
        const take = Math.min(left, per - occ[i])
        if (take > 0) { occ[i] += take; left -= take; if (first < 0) first = i; last = i }
      }
      const f = String(first + 1).padStart(2, '0'), t = String(last + 1).padStart(2, '0')
      l.rackLabel = first < 0 ? '—' : first === last ? `R${f}` : `R${f}–R${t}`
    }
    const occupied = occ.reduce((s, n) => s + n, 0)
    const racks: RackCell[] = occ.map((o, i) => ({
      n: i + 1, label: `R${String(i + 1).padStart(2, '0')}`, capacity: per, occupied: o,
      state: o >= per - 0.5 ? 'FULL' : o > 0 ? 'PARTIAL' : 'EMPTY',
    }))
    const stored = cl.reduce((s, l) => s + l.current, 0)
    return {
      chamber, occupied, available: chamber.capacity - occupied, pct: (occupied / chamber.capacity) * 100,
      lotCount: cl.length, growerCount: new Set(cl.map((l) => l.growerId)).size,
      avgDays: stored ? cl.reduce((s, l) => s + l.days * l.current, 0) / stored : 0,
      racks, lots: cl,
    }
  })
  for (const l of lots) if (!l.rackLabel) l.rackLabel = '—'

  /* allocations */
  const allocStats = new Map<string, AllocStats>()
  for (const a of data.allocations) {
    const issued = data.boxIssues.filter((b) => b.allocationId === a.id).reduce((s, b) => s + b.quantity, 0)
    const received = data.receipts.filter((r) => r.allocationId === a.id).reduce((s, r) => s + r.boxes, 0)
    const allocLots = lots.filter((l) => l.allocationId === a.id)
    const allGone = allocLots.length > 0 && allocLots.every((l) => l.current === 0) && received >= a.boxes
    allocStats.set(a.id, {
      allocationId: a.id, allocated: a.boxes, issued, received,
      remainingToIssue: Math.max(0, a.boxes - issued),
      awaitingReturn: Math.max(0, issued - received),
      remainingAllocation: Math.max(0, a.boxes - received),
      status: allGone ? 'Completed' : received > 0 ? 'Apples Received'
        : issued === 0 ? 'Not Issued' : issued >= a.boxes ? 'Fully Issued' : 'Partially Issued',
    })
  }

  /* growers */
  const growerStats = new Map<string, GrowerStats>()
  for (const g of data.growers) {
    const allocs = data.allocations.filter((a) => a.growerId === g.id)
    const gl = lots.filter((l) => l.growerId === g.id)
    const sum = (f: (s: AllocStats) => number) => allocs.reduce((s, a) => s + f(allocStats.get(a.id)!), 0)
    const charges = gl.reduce((s, l) => s + l.accrued, 0)
    const paid = data.payments.filter((p) => p.growerId === g.id).reduce((s, p) => s + p.amount, 0)
    const received = sum((s) => s.received)
    const dispatched = gl.reduce((s, l) => s + l.dispatched, 0)
    growerStats.set(g.id, {
      growerId: g.id, allocated: sum((s) => s.allocated), issued: sum((s) => s.issued), received,
      dispatched, stored: received - dispatched, awaitingReturn: sum((s) => s.awaitingReturn),
      charges, paid, due: charges - paid, lots: gl.length, activeLots: gl.filter((l) => l.current > 0).length,
    })
  }

  /* store */
  const t = asOf
  const stored = lots.reduce((s, l) => s + l.current, 0)
  const reserved = [...allocStats.values()].reduce((s, a) => s + a.remainingAllocation, 0)
  const totalCharges = lots.reduce((s, l) => s + l.accrued, 0)
  const paid = data.payments.reduce((s, p) => s + p.amount, 0)
  const live = lots.filter((l) => l.current > 0)
  const buckets: AgeBucket[] = ['0-30', '31-60', '61-90', '90+']
  const store: StoreStats = {
    capacity: data.settings.capacity,
    allocated: [...allocStats.values()].reduce((s, a) => s + a.allocated, 0),
    issued: [...allocStats.values()].reduce((s, a) => s + a.issued, 0),
    received: [...allocStats.values()].reduce((s, a) => s + a.received, 0),
    dispatched: lots.reduce((s, l) => s + l.dispatched, 0),
    stored,
    awaitingReturn: [...allocStats.values()].reduce((s, a) => s + a.awaitingReturn, 0),
    remainingToIssue: [...allocStats.values()].reduce((s, a) => s + a.remainingToIssue, 0),
    reserved,
    available: Math.max(0, data.settings.capacity - stored - reserved),
    todayInward: data.receipts.filter((r) => r.receivedDate === t).reduce((s, r) => s + r.boxes, 0),
    todayOutward: completed.filter((d) => d.completedDate === t).reduce((s, d) => s + d.quantity, 0),
    totalCharges, paid, outstanding: totalCharges - paid,
    growersWithDue: [...growerStats.values()].filter((g) => g.due > 1).length,
    pendingRequests: data.requests.filter((r) => r.status === 'PENDING').length,
    pendingGrowers: data.growers.filter((g) => g.status === 'PENDING').length,
    pendingDispatches: data.dispatches.filter((d) => d.status === 'PENDING').length,
    lotsNearingEnd: live.filter((l) => l.daysToRelease <= 30).length,
    chambers,
    aging: buckets.map((bucket) => {
      const ls = live.filter((l) => l.ageBucket === bucket)
      return { bucket, lots: ls.length, boxes: ls.reduce((s, l) => s + l.current, 0), charges: ls.reduce((s, l) => s + l.accrued, 0) }
    }),
  }
  return { lots, lotById, growerStats, allocStats, store }
}

/** Free capacity helper used by validation: capacity not stored and not reserved. */
export const freeCapacity = (d: Derived) => d.store.available

export const requestStatusLabel: Record<string, string> = {
  PENDING: 'Pending', APPROVED: 'Approved', PARTIALLY_ALLOCATED: 'Partially Allocated',
  FULLY_ALLOCATED: 'Fully Allocated', ACTIVE: 'Active', COMPLETED: 'Completed', REJECTED: 'Rejected',
}
