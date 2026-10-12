// End-to-end tests of the store golden path + business rules, driven through the real zustand actions.
import { beforeEach, describe, expect, it } from 'vitest'
import { buildLedger, buildTradeRows, derive } from './calc'
import type { ImportPreview } from './excel'
import { today } from './format'
import { useStore } from './store'

const S = () => useStore.getState()
const D = () => derive(S())
const T = () => today()

/** register -> request -> approve; returns ids. */
/** Date.now()-based ids collide inside one millisecond (see CORE BUG test below), so space entities out. */
const tick = () => { const t = Date.now(); while (Date.now() === t) { /* spin 1ms */ } }
function setupGrower(boxes: number, phone = '9800000001') {
  tick()
  const g = S().registerGrower({ name: 'Flow Test Grower', phone, village: 'Sopore', district: 'Baramulla' })
  expect(g.ok).toBe(true)
  const rq = S().createRequest({
    growerId: g.id!, requestedBoxes: boxes, arrivalStart: T(), arrivalEnd: T(), durationMonths: 5, variety: 'Royal Delicious',
  })
  expect(rq.ok).toBe(true)
  const ap = S().approveRequest(rq.id!, boxes)
  expect(ap.ok).toBe(true)
  return { growerId: g.id!, requestId: rq.id!, allocId: ap.id! }
}
const issue = (allocationId: string, quantity: number) => (tick(), S()).issueBoxes({ allocationId, quantity, date: T(), boxType: 'Wooden', issuedBy: 'Tester' })
const receive = (allocationId: string, boxes: number, extra: Record<string, unknown> = {}) => (tick(), S()).receiveApples({ allocationId, boxes, variety: 'Royal Delicious', grade: 'A', date: T(), ...extra })

beforeEach(() => S().resetDemo())

describe('seed totals', () => {
  it('match the spec dashboard', () => {
    const st = D().store
    expect(st.stored).toBe(68420)
    expect(st.available).toBe(21580)
    expect(st.todayInward).toBe(2450)
    expect(st.todayOutward).toBe(840)
  })
})

describe('golden path', () => {
  it('register -> request -> allocate -> issue -> receive -> pay -> dispatch', () => {
    const before = D().store

    // register: starts PENDING, becomes ACTIVE on first approval of a request
    const g = S().registerGrower({ name: 'Golden Grower', phone: '9811122233', village: 'Sopore', district: 'Baramulla' })
    expect(g.ok).toBe(true)
    expect(S().growers.find((x) => x.id === g.id)?.status).toBe('PENDING')

    const rq = S().createRequest({
      growerId: g.id!, requestedBoxes: 10000, arrivalStart: T(), arrivalEnd: T(), durationMonths: 5, variety: 'Royal Delicious',
    })
    expect(rq.ok).toBe(true)
    expect(S().requests.find((r) => r.id === rq.id)?.status).toBe('PENDING')

    const ap = S().approveRequest(rq.id!, 10000)
    expect(ap.ok).toBe(true)
    const allocId = ap.id!
    expect(S().requests.find((r) => r.id === rq.id)?.status).toBe('FULLY_ALLOCATED')
    expect(S().growers.find((x) => x.id === g.id)?.status).toBe('ACTIVE')
    // reserved capacity grows by 10,000, availability shrinks by 10,000, nothing stored yet
    expect(D().store.reserved).toBe(before.reserved + 10000)
    expect(D().store.available).toBe(before.available - 10000)
    expect(D().store.stored).toBe(before.stored)

    // issue 5000 + 4000
    expect(issue(allocId, 5000).ok).toBe(true)
    expect(issue(allocId, 4000).ok).toBe(true)
    let a = D().allocStats.get(allocId)!
    expect([a.allocated, a.issued, a.remainingToIssue, a.awaitingReturn, a.status]).toEqual([10000, 9000, 1000, 9000, 'Partially Issued'])
    expect(S().requests.find((r) => r.id === rq.id)?.status).toBe('ACTIVE')

    tick()
    // receive 5000 into C-03 -> lot created
    const lotsBefore = S().lots.length
    const rc = receive(allocId, 5000, { chamberId: 'C-03', rackStart: 1 })
    expect(rc.ok).toBe(true)
    expect(S().lots.length).toBe(lotsBefore + 1)
    const lot = S().lots.find((l) => l.id === rc.id)!
    expect(lot.chamberId).toBe('C-03')
    expect(lot.boxesReceived).toBe(5000)
    expect(lot.allocationId).toBe(allocId)
    a = D().allocStats.get(allocId)!
    expect([a.received, a.awaitingReturn, a.remainingAllocation, a.status]).toEqual([5000, 4000, 5000, 'Apples Received'])
    expect(D().store.stored).toBe(before.stored + 5000)
    expect(D().store.reserved).toBe(before.reserved + 5000) // 10,000 allocated - 5,000 now stored
    expect(D().store.available).toBe(before.available - 10000) // stored + reserved is unchanged by receipt
    expect(D().store.todayInward).toBe(before.todayInward + 5000)

    // payment
    expect(S().recordPayment({ growerId: g.id!, amount: 20000, date: T(), method: 'BANK', allocationId: allocId }).ok).toBe(true)

    // dispatch 1000
    tick()
    const ds = S().requestDispatch(g.id!, lot.id, 1000)
    expect(ds.ok).toBe(true)
    expect(D().lotById.get(lot.id)!.pendingDispatch).toBe(1000)
    expect(D().lotById.get(lot.id)!.current).toBe(5000) // pending does not leave the store
    expect(S().approveDispatch(ds.id!, 'JK01 1234').ok).toBe(true)

    // stored 4000 and everything is consistent
    const dv = D()
    const lv = dv.lotById.get(lot.id)!
    expect(lv.current).toBe(4000)
    expect(lv.dispatched).toBe(1000)
    expect(lv.status === 'IN_STORAGE' || lv.status === 'PARTIAL' || lv.status === 'READY').toBe(true)
    const gs = dv.growerStats.get(g.id!)!
    expect([gs.allocated, gs.issued, gs.received, gs.dispatched, gs.stored, gs.awaitingReturn]).toEqual([10000, 9000, 5000, 1000, 4000, 4000])
    expect(dv.store.stored).toBe(before.stored + 4000)
    expect(dv.store.todayOutward).toBe(before.todayOutward + 1000)
    expect(dv.store.dispatched).toBe(before.dispatched + 1000)
    // chamber C-03 reflects the 4000 still stored from this lot
    expect(dv.store.chambers.find((c) => c.chamber.id === 'C-03')!.lots.find((l) => l.id === lot.id)?.current).toBe(4000)

    // money: grower stats == lot charges == ledger == trade row == store totals
    expect(gs.paid).toBe(20000)
    expect(gs.charges).toBeCloseTo(lv.accrued, 6)
    expect(gs.due).toBeCloseTo(gs.charges - 20000, 6)
    expect(gs.credit).toBe(Math.max(0, 20000 - gs.charges))
    const ledger = buildLedger(S(), g.id!)
    expect(ledger.at(-1)!.balance).toBeCloseTo(gs.due, 6)
    const trade = buildTradeRows(S(), dv).find((r) => r.allocationId === allocId)!
    expect(trade.amount).toBeCloseTo(gs.charges, 6)
    expect(trade.paid).toBe(20000)
    expect(trade.balance).toBeCloseTo(gs.due, 6)
    expect([trade.given, trade.received, trade.difference]).toEqual([9000, 5000, 4000])
    expect(dv.store.totalCharges).toBeCloseTo([...dv.growerStats.values()].reduce((s, x) => s + x.charges, 0), 6)
    expect(dv.store.paid).toBeCloseTo(before.paid + 20000, 6)

    // every action wrote an activity
    const types = new Set(S().activities.filter((x) => x.growerId === g.id).map((x) => x.type))
    for (const t of ['GROWER_REGISTERED', 'REQUEST_CREATED', 'STORAGE_ALLOCATED', 'BOX_ISSUED', 'APPLE_RECEIVED', 'PAYMENT_RECEIVED', 'DISPATCH_CREATED', 'DISPATCH_COMPLETED'])
      expect(types.has(t as never)).toBe(true)
  })
})

describe('business rules', () => {
  it('allocating more than available capacity fails', () => {
    const g = S().registerGrower({ name: 'Big Ask', phone: '9800000002', village: 'v', district: 'd' })
    const avail = D().store.available
    const rq = S().createRequest({ growerId: g.id!, requestedBoxes: avail + 1, arrivalStart: T(), arrivalEnd: T(), durationMonths: 5, variety: 'x' })
    const res = S().approveRequest(rq.id!, avail + 1)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/available/i)
    expect(S().allocations.some((a) => a.growerId === g.id)).toBe(false)
    // exactly the available amount is fine
    expect(S().approveRequest(rq.id!, avail).ok).toBe(true)
    expect(D().store.available).toBe(0)
  })

  it('allocating more than the request asked for fails', () => {
    const g = S().registerGrower({ name: 'Over Alloc', phone: '9800000003', village: 'v', district: 'd' })
    const rq = S().createRequest({ growerId: g.id!, requestedBoxes: 100, arrivalStart: T(), arrivalEnd: T(), durationMonths: 5, variety: 'x' })
    expect(S().approveRequest(rq.id!, 101).ok).toBe(false)
  })

  it('issuing more than remaining allocation fails', () => {
    const { allocId } = setupGrower(1000)
    expect(issue(allocId, 600).ok).toBe(true)
    const res = issue(allocId, 401)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/remain/i)
    expect(issue(allocId, 400).ok).toBe(true)
    expect(issue(allocId, 1).ok).toBe(false)
    expect(D().allocStats.get(allocId)!.issued).toBe(1000)
  })

  it('receiving more than awaiting return fails without override and passes with it', () => {
    const { allocId } = setupGrower(1000)
    issue(allocId, 500)
    const no = receive(allocId, 501)
    expect(no.ok).toBe(false)
    expect(no.error).toMatch(/override/i)
    expect(S().receipts.some((r) => r.allocationId === allocId)).toBe(false)
    const yes = receive(allocId, 501, { override: true })
    expect(yes.ok).toBe(true)
    const r = S().receipts.find((x) => x.allocationId === allocId)!
    expect(r.override).toBe(true)
    // awaiting return never goes negative
    expect(D().allocStats.get(allocId)!.awaitingReturn).toBe(0)
    // a receipt within issued boxes needs no override
    const ok = setupGrower(100, '9800000004')
    issue(ok.allocId, 100)
    expect(receive(ok.allocId, 100).ok).toBe(true)
    expect(S().receipts.find((x) => x.allocationId === ok.allocId)!.override).toBeFalsy()
  })

  it('receiving into a chamber without enough room fails', () => {
    const { allocId } = setupGrower(1000)
    issue(allocId, 1000)
    const room = D().store.chambers.find((c) => c.chamber.id === 'C-03')!.available
    const res = receive(allocId, 1000, { chamberId: 'C-03', rackStart: 1, override: true })
    expect(res.ok).toBe(room >= 1000)
  })

  it('dispatching more than the lot holds fails (request and approve)', () => {
    const { growerId, allocId } = setupGrower(1000)
    issue(allocId, 1000)
    const lotId = receive(allocId, 1000).id!
    expect(S().requestDispatch(growerId, lotId, 1001).ok).toBe(false)
    const a = S().requestDispatch(growerId, lotId, 600)
    tick()
    expect(a.ok).toBe(true)
    // pending quantity is reserved: only 400 free
    expect(S().requestDispatch(growerId, lotId, 401).ok).toBe(false)
    tick()
    expect(S().requestDispatch(growerId, lotId, 400).ok).toBe(true)
    expect(S().approveDispatch(a.id!).ok).toBe(true)
    expect(S().approveDispatch(a.id!).ok).toBe(false) // already processed
    expect(D().lotById.get(lotId)!.current).toBe(400)
  })

  it('rejected dispatch leaves stock untouched', () => {
    const { growerId, allocId } = setupGrower(100)
    issue(allocId, 100)
    const lotId = receive(allocId, 100).id!
    const ds = S().requestDispatch(growerId, lotId, 50)
    expect(S().rejectDispatch(ds.id!).ok).toBe(true)
    expect(D().lotById.get(lotId)!.current).toBe(100)
    expect(D().lotById.get(lotId)!.pendingDispatch).toBe(0)
  })

  it('fully dispatching an allocation completes it and its request', () => {
    const { growerId, allocId, requestId } = setupGrower(100)
    issue(allocId, 100)
    const lotId = receive(allocId, 100).id!
    S().approveDispatch(S().requestDispatch(growerId, lotId, 100).id!)
    expect(D().allocStats.get(allocId)!.status).toBe('Completed')
    expect(S().requests.find((r) => r.id === requestId)!.status).toBe('COMPLETED')
  })

  it('recordPayment validates amount and agreement ownership', () => {
    const a = setupGrower(100)
    const b = setupGrower(100, '9800000005')
    expect(S().recordPayment({ growerId: a.growerId, amount: 0, date: T(), method: 'CASH' }).ok).toBe(false)
    expect(S().recordPayment({ growerId: a.growerId, amount: 10, date: T(), method: 'CASH', allocationId: b.allocId }).ok).toBe(false)
  })
})

describe('PER_CRATE agreement', () => {
  it('charges crates received x rate, flat, and credit appears when overpaid', () => {
    const { growerId, allocId } = setupGrower(1000)
    expect(S().updateAllocation(allocId, { rateType: 'PER_CRATE', rate: 950 }).ok).toBe(true)
    issue(allocId, 1000)
    const lotId = receive(allocId, 600).id!
    let gs = D().growerStats.get(growerId)!
    expect(D().lotById.get(lotId)!.accrued).toBe(600 * 950)
    expect(gs.charges).toBe(570000)
    // dispatch does not reduce a flat crate charge
    S().approveDispatch(S().requestDispatch(growerId, lotId, 600).id!)
    gs = D().growerStats.get(growerId)!
    expect(gs.charges).toBe(570000)
    // a second receipt adds crates x rate
    receive(allocId, 400)
    expect(D().growerStats.get(growerId)!.charges).toBe(1000 * 950)
    // overpay -> advance/credit, not negative due shown as outstanding
    S().recordPayment({ growerId, amount: 960000, date: T(), method: 'BANK', allocationId: allocId })
    gs = D().growerStats.get(growerId)!
    expect(gs.due).toBe(-10000)
    expect(gs.credit).toBe(10000)
    expect(D().store.advances).toBeGreaterThanOrEqual(10000)
    const row = buildTradeRows(S()).find((r) => r.allocationId === allocId)!
    expect([row.rateType, row.rate, row.amount, row.balance]).toEqual(['PER_CRATE', 950, 950000, -10000])
  })

  it('new lots inherit the agreement rate even if the store default changes later', () => {
    const { allocId } = setupGrower(100)
    S().updateAllocation(allocId, { rateType: 'PER_CRATE', rate: 950 })
    S().updateSettings({ rateType: 'PER_DAY', rate: 5 })
    issue(allocId, 100)
    const lotId = receive(allocId, 100).id
    const lot = S().lots.find((l) => l.id === lotId)!
    expect([lot.rateType, lot.rate]).toEqual(['PER_CRATE', 950])
  })
})

/* CORE BUG: store ids are `rq${Date.now()}` / `g${Date.now()}` etc., so two creates in the same millisecond share an id.
   Proposed fix in store.ts: a module counter, e.g. `const uid = (p: string) => `${p}-`. it.fails flips to a failure once fixed. */
describe('core bug: id collisions', () => {
  it('two requests created back-to-back get distinct ids', () => {
    const g = S().registerGrower({ name: 'Collide', phone: '9800000077', village: 'v', district: 'd' })
    const mk = () => S().createRequest({ growerId: g.id!, requestedBoxes: 10, arrivalStart: T(), arrivalEnd: T(), durationMonths: 5, variety: 'x' })
    const a = mk(), b = mk()
    expect(a.id).not.toBe(b.id)
  })
})

/* ---------- importTrade ---------- */

function previewOf(over: Partial<ImportPreview> = {}): ImportPreview {
  const key = 'synthetic grower'
  return {
    customers: [{ key, name: 'Synthetic Grower', transactionIds: ['TX-1'], inCustomerList: true }],
    agreements: [{
      row: 2, txnId: 'TX-1', customerKey: key, name: 'Synthetic Grower', agreement: 1000, rate: 950, rateType: 'PER_CRATE',
      rateMissing: false, given: 800, received: 500, amount: 475000, paid: 100000, balance: 375000, workbook: {},
    }],
    movements: [
      { row: 2, txnId: 'TX-1', customerKey: key, name: 'Synthetic Grower', given: 500, dateGiven: '2026-09-20', from: 'Al Rehman', driver: 'Bashir', received: 300, to: 'Al Meazan', dateReceived: '2026-09-25', driver2: 'Bashir', remark: 'Red Delicious' },
      { row: 3, txnId: 'TX-1', customerKey: key, name: 'Synthetic Grower', given: 300, dateGiven: '2026-09-22', received: 200, dateReceived: '2026-09-27' },
    ],
    payments: [{ row: 2, txnId: 'TX-1', customerKey: key, name: 'Synthetic Grower', date: '2026-09-28', amount: 100000, mode: 'BANK' }],
    warnings: [], errors: [],
    totals: { customers: 1, transactions: 1, cratesGiven: 800, cratesReceived: 500, payments: 100000, amount: 475000, outstanding: 375000 },
    workbook: {}, reconciliation: [], canImport: true,
    ...over,
  }
}

describe('importTrade', () => {
  const counts = () => {
    const s = S()
    return [s.growers.length, s.allocations.length, s.boxIssues.length, s.receipts.length, s.lots.length, s.payments.length]
  }

  it('replace wipes demo data and loads the preview', () => {
    const res = S().importTrade(previewOf(), 'replace')
    expect(res.ok).toBe(true)
    expect(counts()).toEqual([1, 1, 2, 2, 2, 1])
    expect(res.summary).toMatchObject({ cratesGiven: 800, cratesReceived: 500, paymentsTotal: 100000, allocationsAdded: 1 })
    const dv = D()
    const al = S().allocations[0]
    expect([al.rateType, al.rate, al.externalRef]).toEqual(['PER_CRATE', 950, 'TX-1'])
    const gs = dv.growerStats.get(S().growers[0].id)!
    expect([gs.issued, gs.received, gs.charges, gs.paid, gs.due]).toEqual([800, 500, 475000, 100000, 375000])
    expect(dv.store.stored).toBe(500)
    // pickup/destination are preserved from the movement sheet
    expect(S().boxIssues.find((b) => b.fromLocation === 'Al Rehman')?.driver).toBe('Bashir')
    expect(S().receipts.find((r) => r.destination === 'Al Meazan')?.sourceLocation).toBe('Al Rehman')
    expect(S().activities.filter((a) => a.type === 'DATA_IMPORTED')).toHaveLength(1)
  })

  it('merge after replace is idempotent', () => {
    S().importTrade(previewOf(), 'replace')
    const first = counts()
    const stats1 = D().growerStats.get(S().growers[0].id)!
    const res = S().importTrade(previewOf(), 'merge')
    expect(res.ok).toBe(true)
    expect(counts()).toEqual(first)
    expect(res.summary).toMatchObject({ growersAdded: 0, allocationsAdded: 0, allocationsUpdated: 1, issuesAdded: 0, receiptsAdded: 0, paymentsAdded: 0 })
    expect(res.summary!.duplicatesSkipped).toBe(2 + 2 + 1)
    const stats2 = D().growerStats.get(S().growers[0].id)!
    expect([stats2.charges, stats2.paid, stats2.stored]).toEqual([stats1.charges, stats1.paid, stats1.stored])
  })

  it('merge updates the rate of a known Transaction ID and re-prices its lots', () => {
    S().importTrade(previewOf(), 'replace')
    const p = previewOf()
    p.agreements = [{ ...p.agreements[0], rate: 1000 }]
    expect(S().importTrade(p, 'merge').ok).toBe(true)
    expect(S().allocations[0].rate).toBe(1000)
    expect(D().growerStats.get(S().growers[0].id)!.charges).toBe(500 * 1000)
    expect(counts()).toEqual([1, 1, 2, 2, 2, 1])
  })

  it('merge adds only the genuinely new rows and keeps existing app data', () => {
    S().importTrade(previewOf(), 'replace')
    const own = S().registerGrower({ name: 'Walk-in', phone: '9800000009', village: 'v', district: 'd' })
    const p = previewOf()
    p.movements = [...p.movements, { row: 4, txnId: 'TX-1', customerKey: 'synthetic grower', name: 'Synthetic Grower', given: 100, dateGiven: '2026-09-29', received: 0 }]
    p.payments = [...p.payments, { row: 3, txnId: 'TX-1', customerKey: 'synthetic grower', name: 'Synthetic Grower', date: '2026-09-30', amount: 5000, mode: 'CASH' }]
    const res = S().importTrade(p, 'merge')
    expect(res.summary).toMatchObject({ issuesAdded: 1, receiptsAdded: 0, paymentsAdded: 1, growersAdded: 0 })
    expect(S().growers.some((g) => g.id === own.id)).toBe(true)
    expect(S().payments).toHaveLength(2)
  })

  it('refuses a preview with blocking errors', () => {
    const before = counts()
    const res = S().importTrade(previewOf({ canImport: false }), 'replace')
    expect(res.ok).toBe(false)
    expect(counts()).toEqual(before)
  })
})
