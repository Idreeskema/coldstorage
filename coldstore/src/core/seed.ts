// Realistic Kashmir apple cold-storage seed data. Everything is generated relative to
// "today" so the demo always looks alive. Totals are tuned to the spec dashboard:
// capacity 100,000 Â· stored 68,420 Â· reserved 10,000 Â· available 21,580 Â·
// issued-awaiting-return 4,080 Â· today inward 2,450 Â· today outward 840 Â· outstanding â‚¹8,45,000.
import type {
  Activity, Allocation, AppleReceipt, BoxIssue, Chamber, Dispatch, Grower, Lot, Notification,
  Payment, Settings, StorageRequest, PayMethod,
} from './types'
import { defaultLocations } from './types'
import { addDays, addMonths, today } from './format'
import { type Data, derive } from './calc'

const p = (n: number, w: number) => String(n).padStart(w, '0')
const ts = (day: string, hhmm: string) => `${day}T${hhmm}:00`

export const seedSettings = (): Settings => ({
  storeName: 'Kashmir Fresh CA Storage', season: 'Season 2026', capacity: 100000,
  rateType: 'PER_MONTH', rate: 28, currency: 'INR', locations: defaultLocations(),
})

const VILLAGES: [string, string][] = [
  ['Sopore', 'Baramulla'], ['Baramulla', 'Baramulla'], ['Shopian', 'Shopian'], ['Pulwama', 'Pulwama'],
  ['Kulgam', 'Kulgam'], ['Anantnag', 'Anantnag'], ['Handwara', 'Kupwara'], ['Bandipora', 'Bandipora'],
  ['Kupwara', 'Kupwara'], ['Tangmarg', 'Baramulla'], ['Pattan', 'Baramulla'], ['Awantipora', 'Pulwama'],
  ['Zainapora', 'Shopian'], ['Doru', 'Anantnag'], ['Pampore', 'Pulwama'], ['Ganderbal', 'Ganderbal'], ['Sumbal', 'Bandipora'],
]

interface Row {
  name: string; alloc: number; issued: number; months: number
  chunks: [number, number][] // [boxes, daysAgo]
  disp: [number, number, number][] // [boxes, daysAgo, chunkIndex]
}
const ROWS: Row[] = [
  { name: 'Ghulam Nabi Sofi', alloc: 8000, issued: 8000, months: 5, chunks: [[4500, 28], [3000, 20]], disp: [[500, 0, 0]] },
  { name: 'Mohammad Yousuf Dar', alloc: 12000, issued: 11500, months: 5, chunks: [[6000, 30], [3000, 22], [2000, 12]], disp: [[400, 11, 0], [400, 10, 0]] },
  { name: 'Bashir Ahmad Wani', alloc: 6000, issued: 6000, months: 5, chunks: [[3000, 26], [1550, 14], [1450, 0]], disp: [] },
  { name: 'Tariq Ahmad Mir', alloc: 10000, issued: 9500, months: 5, chunks: [[5000, 29], [3500, 18]], disp: [[360, 8, 0], [340, 0, 0]] },
  { name: 'Fayaz Ahmad Lone', alloc: 5000, issued: 4500, months: 5, chunks: [[3500, 21], [1000, 0]], disp: [] },
  { name: 'Irfan Ahmad Bhat', alloc: 7500, issued: 7080, months: 5, chunks: [[4000, 24], [2500, 10]], disp: [[250, 6, 0], [250, 5, 0]] },
  { name: 'Javaid Ahmad Malik', alloc: 4500, issued: 4000, months: 5, chunks: [[2500, 19], [1500, 9]], disp: [] },
  { name: 'Aijaz Ahmad Dar', alloc: 9000, issued: 8000, months: 5, chunks: [[4000, 28], [3000, 16]], disp: [[500, 12, 0], [400, 3, 0]] },
  { name: 'Shabir Ahmad Rather', alloc: 3000, issued: 2500, months: 1, chunks: [[2500, 13]], disp: [] },
  { name: 'Manzoor Ahmad Wani', alloc: 6500, issued: 6000, months: 5, chunks: [[3000, 23], [2500, 11]], disp: [[400, 4, 0]] },
  { name: 'Nazir Ahmad Khan', alloc: 2500, issued: 2000, months: 1, chunks: [[2000, 8]], disp: [] },
  { name: 'Mushtaq Ahmad Lone', alloc: 3500, issued: 3000, months: 5, chunks: [[3000, 14]], disp: [[280, 2, 0]] },
  { name: 'Showkat Ahmad Mir', alloc: 1500, issued: 1500, months: 5, chunks: [[1500, 6]], disp: [] },
  { name: 'Riyaz Ahmad Bhat', alloc: 2000, issued: 1500, months: 5, chunks: [[1500, 5]], disp: [] },
  { name: 'Altaf Hussain Malik', alloc: 1500, issued: 1500, months: 5, chunks: [[1500, 4]], disp: [] },
]
const TARGET_FILL = [0.8, 0.7, 0.65, 0.92, 0.35] // chamber fill targets, Î£ â‰ˆ 68.4k boxes
const VARIETIES = ['Red Delicious', 'Ambri', 'Royal Delicious', 'American Trel', 'Golden Delicious', 'Kullu Delicious']
const STAFF = ['Mushtaq Lone', 'Imran Qadri', 'Suhail Bhat']

export function buildSeed(): Data {
  const T = today()
  const growers: Grower[] = []
  const requests: StorageRequest[] = []
  const allocations: Allocation[] = []
  const boxIssues: BoxIssue[] = []
  const receipts: AppleReceipt[] = []
  const lots: Lot[] = []
  const dispatches: Dispatch[] = []
  const payments: Payment[] = []
  const activities: Activity[] = []
  const settings = seedSettings()

  const chambers: Chamber[] = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'].map((id, i) => ({
    id, capacity: 20000, racks: 20, tempC: [0.5, 1.0, 0.5, 1.5, 1.0][i],
  }))

  let nGrower = 0, nReq = 0, nAlloc = 0, nIssue = 0, nRcpt = 0, nLot = 0, nDisp = 0, nPay = 0, nAct = 0
  const act = (a: Omit<Activity, 'id'>) => activities.push({ id: `act-${++nAct}`, ...a })

  const mkGrower = (name: string, status: Grower['status'], createdDaysAgo: number, vIdx: number): Grower => {
    const n = ++nGrower
    const [village, district] = VILLAGES[vIdx % VILLAGES.length]
    const g: Grower = {
      id: `g${n}`, code: `GRW-2026-${p(n, 4)}`, name, phone: `+91 9${p(419 + n * 13, 3)}${p(n * 7, 1)} ${p(10000 + ((n * 7919) % 90000), 5)}`,
      village, district, address: `${village}, ${district}, J&K`, status,
      orchard: `${name.split(' ')[0]} Orchards`, createdAt: ts(addDays(T, -createdDaysAgo), '09:00'),
    }
    growers.push(g)
    return g
  }

  /* ---- 15 active growers with full lifecycle ---- */
  const lotDrafts: { lot: Lot; qtyNow: number }[] = []
  ROWS.forEach((row, i) => {
    const g = mkGrower(row.name, 'ACTIVE', 45 + i, i)
    g.expectedStorage = row.alloc
    g.expectedProduction = Math.round(row.alloc * 1.2)
    const firstChunkDay = Math.max(...row.chunks.map((c) => c[1]))
    const reqDay = addDays(T, -(firstChunkDay + 12))
    const rq: StorageRequest = {
      id: `rq${++nReq}`, code: `REQ-2026-${p(nReq, 4)}`, growerId: g.id, requestedBoxes: row.alloc, allocatedBoxes: row.alloc,
      expectedApples: row.alloc, arrivalStart: addDays(reqDay, 8), arrivalEnd: addDays(reqDay, 20), preferredStart: addDays(reqDay, 8),
      durationMonths: row.months, variety: VARIETIES[i % VARIETIES.length], status: 'ACTIVE', createdAt: ts(reqDay, '10:20'),
    }
    const al: Allocation = {
      id: `al${++nAlloc}`, code: `ALLOC-2026-${p(nAlloc, 4)}`, requestId: rq.id, growerId: g.id, boxes: row.alloc,
      durationMonths: row.months, createdAt: ts(addDays(reqDay, 1), '11:00'),
      rateType: settings.rateType, rate: settings.rate,
    }
    rq.allocationId = al.id
    requests.push(rq); allocations.push(al)
    act({ type: 'REQUEST_CREATED', title: `Storage request ${rq.code}`, description: `${g.name} requested ${row.alloc.toLocaleString('en-IN')} boxes`, entityType: 'request', entityId: rq.id, growerId: g.id, user: g.name, timestamp: rq.createdAt, status: 'info' })
    act({ type: 'STORAGE_ALLOCATED', title: `${row.alloc.toLocaleString('en-IN')} boxes allocated`, description: `${al.code} Â· ${g.name}`, entityType: 'allocation', entityId: al.id, growerId: g.id, user: 'Store Manager', timestamp: al.createdAt, status: 'success' })

    // box issues: 3 (big) or 2 (small) transactions, all before the first receipt
    const parts = row.issued >= 6000 ? 3 : 2
    const weights = parts === 3 ? [0.5, 0.3, 0.2] : [0.6, 0.4]
    let left = row.issued
    weights.forEach((w, k) => {
      const q = k === parts - 1 ? left : Math.round((row.issued * w) / 10) * 10
      left -= q
      const day = addDays(T, -(firstChunkDay + 2 + (parts - 1 - k) * 2))
      const bi: BoxIssue = {
        id: `bi${++nIssue}`, code: `BOX-ISSUE-2026-${p(nIssue, 5)}`, growerId: g.id, allocationId: al.id, quantity: q, date: day,
        boxType: i % 4 === 0 ? 'Wooden' : 'Carton', issuedBy: STAFF[i % STAFF.length],
        vehicle: i % 3 === 0 ? `JK0${1 + (i % 9)}B ${4100 + i * 37}` : undefined,
      }
      boxIssues.push(bi)
      act({ type: 'BOX_ISSUED', title: `${q.toLocaleString('en-IN')} boxes issued`, description: `${bi.code} Â· ${g.name}`, entityType: 'boxIssue', entityId: bi.id, growerId: g.id, user: bi.issuedBy, timestamp: ts(day, '09:05'), status: 'success' })
    })

    // receipts â†’ lots
    row.chunks.forEach(([boxes, daysAgo], ci) => {
      const day = addDays(T, -daysAgo)
      const rc: AppleReceipt = {
        id: `rc${++nRcpt}`, code: `RCPT-2026-${p(nRcpt, 5)}`, growerId: g.id, allocationId: al.id, lotId: '', boxes,
        variety: VARIETIES[(i + ci) % VARIETIES.length], grade: ['A', 'A', 'B', 'A'][(i + ci) % 4], weightKg: boxes * 18,
        receivedDate: day, vehicle: `JK0${1 + ((i + ci) % 9)}C ${2200 + i * 53 + ci}`, driver: g.name.split(' ')[0], chamberId: '', rackStart: 1,
      }
      const lot: Lot = {
        id: `lt${++nLot}`, code: `LOT-2026-${p(nLot, 4)}`, growerId: g.id, allocationId: al.id, receiptId: rc.id,
        boxesReceived: boxes, variety: rc.variety, grade: rc.grade, storageStartDate: day,
        expectedReleaseDate: addMonths(day, row.months), chamberId: '', rackStart: 1,
        rateType: settings.rateType, rate: settings.rate,
      }
      rc.lotId = lot.id
      const out = row.disp.filter((d) => d[2] === ci).reduce((s, d) => s + d[0], 0)
      lotDrafts.push({ lot, qtyNow: boxes - out })
      receipts.push(rc); lots.push(lot)
      const hh = daysAgo === 0 ? ['10:30', '11:40'][i % 2] : '10:30'
      act({ type: 'APPLE_RECEIVED', title: `${boxes.toLocaleString('en-IN')} apple boxes received`, description: `Lot ${lot.code} Â· ${g.name}`, entityType: 'lot', entityId: lot.id, growerId: g.id, user: STAFF[(i + 1) % STAFF.length], timestamp: ts(day, hh), status: 'success' })
    })

    // dispatches
    row.disp.forEach(([q, daysAgo, ci]) => {
      const lot = lots.filter((l) => l.growerId === g.id)[ci]
      const day = addDays(T, -daysAgo)
      const d: Dispatch = {
        id: `ds${++nDisp}`, code: `DISP-2026-${p(nDisp, 4)}`, growerId: g.id, lotId: lot.id, quantity: q,
        requestedAt: ts(addDays(day, daysAgo === 0 ? 0 : -1), '14:10'), completedDate: day, status: 'COMPLETED', vehicle: `JK01D ${5100 + nDisp * 11}`,
      }
      dispatches.push(d)
      act({ type: 'DISPATCH_COMPLETED', title: `${q.toLocaleString('en-IN')} boxes dispatched`, description: `${d.code} Â· ${lot.code} Â· ${g.name}`, entityType: 'dispatch', entityId: d.id, growerId: g.id, user: 'Store Manager', timestamp: ts(day, '15:05'), status: 'success' })
    })
  })

  /* ---- chamber / rack assignment (fill to target fractions) ---- */
  const filled = chambers.map(() => 0)
  const rackPtr = chambers.map(() => 0)
  const placement = new Map<string, { chamber: number; rack: number }>()
  const sorted = [...lotDrafts].sort((a, b) => b.qtyNow - a.qtyNow)
  for (const { lot, qtyNow } of sorted) {
    let best = 0, bestGap = -Infinity
    chambers.forEach((c, ci) => {
      const gap = TARGET_FILL[ci] * c.capacity - filled[ci]
      if (gap > bestGap && filled[ci] + qtyNow <= c.capacity) { best = ci; bestGap = gap }
    })
    placement.set(lot.id, { chamber: best, rack: Math.min(chambers[best].racks, Math.floor(rackPtr[best] / 1000) + 1) })
    filled[best] += qtyNow
    rackPtr[best] += qtyNow
  }
  for (const lot of lots) {
    const pl = placement.get(lot.id)!
    lot.chamberId = chambers[pl.chamber].id
    lot.rackStart = pl.rack
    const rc = receipts.find((r) => r.id === lot.receiptId)!
    rc.chamberId = lot.chamberId
    rc.rackStart = lot.rackStart
  }

  /* ---- more growers, pending requests, one pending dispatch ---- */
  const pendingG = [mkGrower('Zahoor Ahmad Parray', 'PENDING', 0, 15), mkGrower('Nisar Ahmad Ganie', 'PENDING', 1, 16)]
  pendingG.forEach((g, i) => {
    g.createdAt = ts(addDays(T, -i), i === 0 ? '08:15' : '16:40')
    act({ type: 'GROWER_REGISTERED', title: 'Grower registered', description: g.name, entityType: 'grower', entityId: g.id, growerId: g.id, user: g.name, timestamp: g.createdAt, status: 'info' })
  })
  const extra: [number, number, number, number][] = [ // [growerIdx, boxes, durationMonths, daysAgo]
    [4, 3000, 5, 2], [8, 2000, 4, 1], [10, 1500, 5, 3], [12, 2500, 5, 0], [13, 1000, 3, 4], [14, 2000, 5, 1], [2, 4000, 5, 6], [6, 1500, 5, 0],
  ]
  extra.forEach(([gi, boxes, months, ago]) => {
    const g = growers[gi]
    const day = addDays(T, -ago)
    const rq: StorageRequest = {
      id: `rq${++nReq}`, code: `REQ-2026-${p(nReq, 4)}`, growerId: g.id, requestedBoxes: boxes, allocatedBoxes: 0,
      expectedApples: boxes, arrivalStart: addDays(T, 5), arrivalEnd: addDays(T, 14), durationMonths: months,
      variety: VARIETIES[(gi + 1) % VARIETIES.length], status: 'PENDING', createdAt: ts(day, '12:10'), notes: 'Second lot of the season',
    }
    requests.push(rq)
    act({ type: 'REQUEST_CREATED', title: `Storage request ${rq.code}`, description: `${g.name} requested ${boxes.toLocaleString('en-IN')} boxes`, entityType: 'request', entityId: rq.id, growerId: g.id, user: g.name, timestamp: rq.createdAt, status: 'info' })
  })
  ;([[3, 1200, 20], [5, 800, 15]] as const).forEach(([gi, boxes, ago]) => {
    const g = growers[gi]
    requests.push({
      id: `rq${++nReq}`, code: `REQ-2026-${p(nReq, 4)}`, growerId: g.id, requestedBoxes: boxes, allocatedBoxes: 0,
      arrivalStart: addDays(T, -10), arrivalEnd: addDays(T, -2), durationMonths: 4, variety: 'Ambri', status: 'REJECTED',
      createdAt: ts(addDays(T, -ago), '10:00'), notes: 'Declined â€” chamber capacity committed at the time',
    })
  })

  // pending dispatch (Ghulam Nabi, lot 2) + a rejected one
  const ghulamLot2 = lots.filter((l) => l.growerId === growers[0].id)[1]
  dispatches.push({ id: `ds${++nDisp}`, code: `DISP-2026-${p(nDisp, 4)}`, growerId: growers[0].id, lotId: ghulamLot2.id, quantity: 500, requestedAt: ts(T, '15:30'), status: 'PENDING', notes: 'Delivery to Delhi mandi' })
  act({ type: 'DISPATCH_CREATED', title: 'Dispatch request created', description: `${growers[0].name} Â· 500 boxes`, entityType: 'dispatch', entityId: `ds${nDisp}`, growerId: growers[0].id, user: growers[0].name, timestamp: ts(T, '15:30'), status: 'warning' })
  const javaidLot = lots.filter((l) => l.growerId === growers[6].id)[0]
  dispatches.push({ id: `ds${++nDisp}`, code: `DISP-2026-${p(nDisp, 4)}`, growerId: growers[6].id, lotId: javaidLot.id, quantity: 200, requestedAt: ts(addDays(T, -7), '11:00'), status: 'REJECTED', notes: 'Too early â€” contract period' })

  /* ---- payments: size them so outstanding lands at â‚¹8,45,000 ---- */
  const base: Data = {
    growers, requests, allocations, boxIssues, receipts, lots, dispatches, payments: [], chambers, activities,
    notifications: [], settings,
  }
  const d0 = derive(base)
  const TARGET_OUTSTANDING = 845000
  const totalCharges = d0.store.totalCharges
  const toPay = Math.max(0, totalCharges - TARGET_OUTSTANDING)
  const dueGrowers = new Set([growers[1].id, growers[3].id, growers[7].id]) // 3 growers with the biggest dues
  const payable = growers.filter((g) => (d0.growerStats.get(g.id)?.charges ?? 0) > 0)
  const weights = payable.map((g) => (d0.growerStats.get(g.id)!.charges) * (dueGrowers.has(g.id) ? 0.45 : 1))
  const wSum = weights.reduce((s, w) => s + w, 0)
  let remaining = toPay
  const methods: PayMethod[] = ['UPI', 'BANK', 'CASH', 'CHEQUE', 'UPI']
  const plan: { g: Grower; amount: number }[] = payable.map((g, i) => {
    const amt = i === payable.length - 1 ? remaining : Math.min(remaining, Math.floor(((toPay * weights[i]) / wSum) / 500) * 500)
    remaining -= amt
    return { g, amount: amt }
  })
  // push any rounding residue onto the first non-due grower so the total is exact
  const residual = toPay - plan.reduce((s, x) => s + x.amount, 0)
  if (residual !== 0) plan[0].amount += residual
  plan.forEach(({ g, amount }, i) => {
    if (amount <= 0) return
    const first = lots.filter((l) => l.growerId === g.id).map((l) => l.storageStartDate).sort()[0]
    const splits = amount > 30000 ? [0.6, 0.4] : [1]
    let left = amount
    splits.forEach((w, k) => {
      const amt = k === splits.length - 1 ? left : Math.round((amount * w) / 100) * 100
      left -= amt
      const day = k === 0 ? addDays(first, Math.min(14, 3 + i)) : addDays(T, -(i % 5))
      const day2 = day > T ? T : day
      const pay: Payment = {
        id: `py${++nPay}`, code: `PAY-2026-${p(nPay, 5)}`, growerId: g.id, amount: amt, date: day2,
        method: methods[(i + k) % methods.length], reference: methods[(i + k) % methods.length] === 'UPI' ? `UPI${48200000 + nPay * 313}` : undefined,
      }
      payments.push(pay)
      act({ type: 'PAYMENT_RECEIVED', title: 'Payment received', description: `â‚¹${amt.toLocaleString('en-IN')} Â· ${g.name}`, entityType: 'payment', entityId: pay.id, growerId: g.id, user: 'Store Manager', timestamp: ts(day2, '12:15'), status: 'success' })
    })
  })

  const notifications: Notification[] = []
  const note = (n: Omit<Notification, 'id' | 'read'>, read = false) => notifications.push({ id: `nt-${notifications.length + 1}`, read, ...n })
  note({ audience: 'MANAGER', title: 'New storage request', body: `${growers[12].name} requested 2,500 boxes`, timestamp: ts(T, '12:10'), link: '/admin/requests' })
  note({ audience: 'MANAGER', title: 'Dispatch request', body: `${growers[0].name} requested 500 boxes`, timestamp: ts(T, '15:30'), link: '/admin/dispatch' })
  note({ audience: 'MANAGER', title: 'New grower registered', body: pendingG[0].name, timestamp: ts(T, '08:15'), link: '/admin/growers' })
  note({ audience: 'MANAGER', title: 'Capacity warning', body: 'Chamber C-04 is above 90% full', timestamp: ts(addDays(T, -1), '17:00'), link: '/admin/chambers' }, true)
  note({ audience: 'MANAGER', title: 'Payment overdue', body: '3 growers have pending dues', timestamp: ts(addDays(T, -1), '09:00'), link: '/admin/payments' }, true)
  note({ audience: 'GROWER', growerId: growers[0].id, title: 'Storage started', body: 'Your lot is now in chamber storage', timestamp: ts(addDays(T, -20), '10:40') }, true)
  note({ audience: 'GROWER', growerId: growers[0].id, title: 'Payment due', body: 'Please clear your outstanding balance', timestamp: ts(addDays(T, -1), '09:00') })

  activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return { growers, requests, allocations, boxIssues, receipts, lots, dispatches, payments, chambers, activities, notifications, settings }
}

/** Empty starting state: only the fixed store config (chambers + settings), no sample records. */
export function buildEmpty(): Data {
  const chambers: Chamber[] = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05'].map((id, i) => ({
    id, capacity: 20000, racks: 20, tempC: [0.5, 1.0, 0.5, 1.5, 1.0][i],
  }))
  return {
    growers: [], requests: [], allocations: [], boxIssues: [], receipts: [], lots: [], dispatches: [], payments: [],
    chambers, activities: [], notifications: [], settings: seedSettings(),
  }
}
