// Applies a parsed Excel preview (see excel.ts) to app data. Pure: (Data, preview) -> new Data + summary.
// Used by the store action `importTrade`. Imports bypass interactive-only validations on purpose:
//   - receipts may exceed boxes issued (flagged `override: true`, same flag the manager override uses)
//   - receipts may exceed the agreement quantity
//   - lots that fit in no chamber are stored with chamberId '' (unassigned) instead of failing
//   - growers are created ACTIVE with empty phone/village/district (the workbook has none)
import type {
  Activity, Allocation, AppleReceipt, BoxIssue, BoxType, Grower, Lot, Payment, StorageRequest,
} from './types'
import { createPlacer, derive, type Data } from './calc'
import { addMonths, nowIso, today } from './format'
import { normName, type ImportMovement, type ImportPreview } from './excel'

export type ImportMode = 'replace' | 'merge'

export interface ImportOptions {
  /** storage duration used for expectedReleaseDate (receipt date + months). Default 5. */
  durationMonths?: number
  /** box type recorded on imported box issues. Default 'Wooden'. */
  boxType?: BoxType
  /** user name written on the summary activity / issuedBy. */
  user?: string
}

export interface ImportSummary {
  mode: ImportMode
  growersAdded: number
  growersReused: number
  allocationsAdded: number
  allocationsUpdated: number
  issuesAdded: number
  receiptsAdded: number // = lots added
  paymentsAdded: number
  duplicatesSkipped: number // merge only: rows already present
  unplacedLots: number // lots left without a chamber
  overrideReceipts: number // receipts flagged because received > issued
  cratesGiven: number
  cratesReceived: number
  paymentsTotal: number
  warnings: number
}

export type ImportResult = { ok: boolean; error?: string; id?: string; summary?: ImportSummary }

const pad = (n: number, w: number) => String(n).padStart(w, '0')
const nextN = (list: { code: string }[]) =>
  list.reduce((m, x) => Math.max(m, parseInt(x.code.split('-').pop() ?? '0', 10) || 0), 0) + 1

const VARIETIES = ['Red Delicious', 'Royal Delicious', 'Golden Delicious', 'Kullu Delicious', 'American Trel', 'Ambri']
function varietyFrom(remark?: string): string {
  if (!remark) return 'Unspecified'
  const t = remark.toLowerCase()
  const v = VARIETIES.find((x) => t.includes(x.toLowerCase()))
  if (v) return v
  return /\bdel(icious)?\b/.test(t) ? 'Delicious' : 'Unspecified'
}

let seq = 0
const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`

export function applyImport(
  base: Data, preview: ImportPreview, mode: ImportMode, opts: ImportOptions = {},
): { data: Data; summary: ImportSummary } {
  const months = opts.durationMonths ?? 5
  const boxType = opts.boxType ?? 'Wooden'
  const user = opts.user ?? 'Store Manager'
  const T = today()
  const keep = mode === 'merge'

  const growers: Grower[] = keep ? [...base.growers] : []
  const requests: StorageRequest[] = keep ? [...base.requests] : []
  let allocations: Allocation[] = keep ? [...base.allocations] : []
  const boxIssues: BoxIssue[] = keep ? [...base.boxIssues] : []
  const receipts: AppleReceipt[] = keep ? [...base.receipts] : []
  let lots: Lot[] = keep ? [...base.lots] : []
  const payments: Payment[] = keep ? [...base.payments] : []
  const dispatches = keep ? base.dispatches : []

  const sum: ImportSummary = {
    mode, growersAdded: 0, growersReused: 0, allocationsAdded: 0, allocationsUpdated: 0, issuesAdded: 0, receiptsAdded: 0,
    paymentsAdded: 0, duplicatesSkipped: 0, unplacedLots: 0, overrideReceipts: 0, cratesGiven: 0, cratesReceived: 0,
    paymentsTotal: 0, warnings: preview.warnings.length,
  }

  /* growers (matched by normalised name) */
  let gNo = nextN(growers)
  const growerByKey = new Map(growers.map((g) => [normName(g.name), g]))
  const growerFor = (key: string, name: string): Grower => {
    const hit = growerByKey.get(key)
    if (hit) { sum.growersReused++; return hit }
    const g: Grower = {
      id: uid('g'), code: `GRW-2026-${pad(gNo++, 4)}`, name, phone: '', village: '', district: '', status: 'ACTIVE', createdAt: nowIso(),
    }
    growers.push(g); growerByKey.set(key, g); sum.growersAdded++
    return g
  }
  const growerOf = new Map<string, Grower>() // customer key -> grower
  for (const c of preview.customers) growerOf.set(c.key, growerFor(c.key, c.name))

  /* allocations (matched by externalRef = Transaction ID) */
  let aNo = nextN(allocations), rNo = nextN(requests)
  const allocOf = new Map<string, Allocation>() // txnId -> allocation
  for (const ag of preview.agreements) {
    const g = growerOf.get(ag.customerKey)!
    const qty = ag.agreement > 0 ? ag.agreement : Math.max(ag.given, ag.received)
    const existing = keep ? allocations.find((a) => a.externalRef === ag.txnId) : undefined
    if (existing) {
      const upd = { ...existing, rate: ag.rate, rateType: ag.rateType, boxes: Math.max(qty, existing.boxes), remarks: ag.remarks ?? existing.remarks }
      allocations = allocations.map((a) => (a.id === existing.id ? upd : a))
      lots = lots.map((l) => (l.allocationId === existing.id ? { ...l, rate: ag.rate, rateType: ag.rateType } : l))
      allocOf.set(ag.txnId, upd)
      sum.allocationsUpdated++
      continue
    }
    const dts = [...preview.movements.filter((m) => m.txnId === ag.txnId).flatMap((m) => [m.dateGiven, m.dateReceived]),
      ...preview.payments.filter((p) => p.txnId === ag.txnId).map((p) => p.date)].filter((x): x is string => !!x).sort()
    const first = dts[0] ?? T
    const rq: StorageRequest = {
      id: uid('rq'), code: `REQ-2026-${pad(rNo++, 4)}`, growerId: g.id, requestedBoxes: qty, allocatedBoxes: qty,
      arrivalStart: first, arrivalEnd: dts[dts.length - 1] ?? first, durationMonths: months, variety: 'Mixed',
      notes: `Imported from Excel (Transaction ${ag.txnId})`, status: ag.given + ag.received > 0 ? 'ACTIVE' : 'FULLY_ALLOCATED', createdAt: nowIso(),
    }
    const al: Allocation = {
      id: uid('al'), code: `ALLOC-2026-${pad(aNo++, 4)}`, requestId: rq.id, growerId: g.id, boxes: qty, durationMonths: months,
      createdAt: nowIso(), rateType: ag.rateType, rate: ag.rate, remarks: ag.remarks, externalRef: ag.txnId,
    }
    rq.allocationId = al.id
    requests.push(rq); allocations.push(al); allocOf.set(ag.txnId, al)
    sum.allocationsAdded++
  }

  /* multiset of what already exists (merge) so re-importing an updated workbook only adds new rows */
  const seen = new Map<string, number>()
  const sig = (...p: (string | number)[]) => p.join('|')
  const bump = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1)
  if (keep) {
    for (const b of boxIssues) bump(sig('I', b.allocationId, b.date, b.quantity))
    for (const r of receipts) bump(sig('R', r.allocationId, r.receivedDate, r.boxes))
    for (const p of payments) if (p.allocationId) bump(sig('P', p.allocationId, p.date, p.amount))
  }
  const alreadyThere = (k: string) => {
    const n = seen.get(k) ?? 0
    if (n > 0) { seen.set(k, n - 1); sum.duplicatesSkipped++; return true }
    return false
  }

  /* box issues */
  let iNo = nextN(boxIssues)
  const moves = [...preview.movements].sort((a, b) => (a.dateGiven ?? a.dateReceived ?? '').localeCompare(b.dateGiven ?? b.dateReceived ?? '') || a.row - b.row)
  for (const m of moves) {
    if (!(m.given > 0)) continue
    const al = allocOf.get(m.txnId)!
    if (alreadyThere(sig('I', al.id, m.dateGiven!, m.given))) continue
    boxIssues.push({
      id: uid('bi'), code: `BOX-ISSUE-2026-${pad(iNo++, 5)}`, growerId: al.growerId, allocationId: al.id, quantity: m.given,
      date: m.dateGiven!, boxType, issuedBy: user, fromLocation: m.from, driver: m.driver,
    })
    sum.issuesAdded++; sum.cratesGiven += m.given
  }

  /* receipts + lots, placed into the emptiest chamber that has room */
  const issuedTotal = new Map<string, number>()
  for (const b of boxIssues) issuedTotal.set(b.allocationId, (issuedTotal.get(b.allocationId) ?? 0) + b.quantity)
  const receivedSoFar = new Map<string, number>()
  for (const r of receipts) receivedSoFar.set(r.allocationId, (receivedSoFar.get(r.allocationId) ?? 0) + r.boxes)
  const placer = createPlacer(derive({ ...base, growers, requests, allocations, boxIssues, receipts, lots, dispatches, payments }).store.chambers)
  let rcNo = nextN(receipts), lotNo = nextN(lots)
  const recv: ImportMovement[] = moves.filter((m) => m.received > 0)
    .sort((a, b) => a.dateReceived!.localeCompare(b.dateReceived!) || a.row - b.row)
  for (const m of recv) {
    const al = allocOf.get(m.txnId)!
    if (alreadyThere(sig('R', al.id, m.dateReceived!, m.received))) continue
    const cum = (receivedSoFar.get(al.id) ?? 0) + m.received
    receivedSoFar.set(al.id, cum)
    const override = cum > (issuedTotal.get(al.id) ?? 0)
    if (override) sum.overrideReceipts++
    const place = placer.place(m.received)
    if (!place) sum.unplacedLots++
    const rid = uid('rc'), lid = uid('lt')
    const variety = varietyFrom(m.remark)
    receipts.push({
      id: rid, code: `RCPT-2026-${pad(rcNo++, 5)}`, growerId: al.growerId, allocationId: al.id, lotId: lid, boxes: m.received,
      variety, grade: 'Ungraded', receivedDate: m.dateReceived!, driver: m.driver2, chamberId: place?.chamberId ?? '',
      rackStart: place?.rackStart ?? 1, destination: m.to, sourceLocation: m.from, remark: m.remark, override: override || undefined,
    })
    lots.push({
      id: lid, code: `LOT-2026-${pad(lotNo++, 4)}`, growerId: al.growerId, allocationId: al.id, receiptId: rid, boxesReceived: m.received,
      variety, grade: 'Ungraded', storageStartDate: m.dateReceived!, expectedReleaseDate: addMonths(m.dateReceived!, al.durationMonths),
      chamberId: place?.chamberId ?? '', rackStart: place?.rackStart ?? 1, rateType: al.rateType, rate: al.rate,
    })
    sum.receiptsAdded++; sum.cratesReceived += m.received
  }

  /* payments */
  let pNo = nextN(payments)
  for (const p of [...preview.payments].sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row)) {
    const al = allocOf.get(p.txnId)!
    if (alreadyThere(sig('P', al.id, p.date, p.amount))) continue
    payments.push({
      id: uid('py'), code: `PAY-2026-${pad(pNo++, 5)}`, growerId: al.growerId, allocationId: al.id, amount: p.amount, date: p.date,
      method: p.mode, reference: p.reference, notes: p.modeRaw && p.mode === 'OTHER' ? p.modeRaw : undefined,
    })
    sum.paymentsAdded++; sum.paymentsTotal += p.amount
  }

  /* one summary activity */
  const n = (x: number) => x.toLocaleString('en-IN')
  const { mode: _mode, ...numeric } = sum
  const act: Activity = {
    id: uid('act-imp-'), type: 'DATA_IMPORTED', title: `Excel import (${mode})`,
    description: `${sum.allocationsAdded + sum.allocationsUpdated} agreements, ${n(sum.cratesGiven)} crates given, ${n(sum.cratesReceived)} received, ₹${n(sum.paymentsTotal)} payments`,
    entityType: 'import', entityId: 'import', user, timestamp: nowIso(), status: sum.warnings ? 'warning' : 'success',
    metadata: { ...numeric, mode },
  }

  const data: Data = {
    growers, requests, allocations, boxIssues, receipts, lots, dispatches, payments, chambers: base.chambers, settings: base.settings,
    activities: keep ? [act, ...base.activities] : [act], notifications: keep ? base.notifications : [],
  }
  return { data, summary: sum }
}
