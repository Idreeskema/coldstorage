import { describe, expect, it } from 'vitest'
import { autoPlace, buildLedger, buildTradeRows, createPlacer, derive, estimateCharge, lotCharge } from './calc'
import { rateLabel } from './format'
import { migrateState, useStore } from './store'
import { defaultLocations } from './types'
import { emptyData, mkAlloc, mkDispatch, mkGrower, mkIssue, mkLot, mkPay, mkReceipt } from './testutil'

const AS_OF = '2030-01-01'

describe('PER_CRATE billing', () => {
  const al = mkAlloc('a1', 'g1', { rate: 950 })
  const lot = mkLot('l1', al, 100)

  it('charges crates received × rate, flat', () => {
    expect(lotCharge(lot, [], AS_OF)).toBe(95000)
    expect(lotCharge(lot, [], '2026-09-28')).toBe(95000) // no time component
    expect(lotCharge(lot, [], '2026-09-26')).toBe(0) // before the crates arrived
    expect(estimateCharge(100, 400, 'PER_CRATE', 950)).toBe(95000)
  })

  it('is not reduced by dispatches', () => {
    expect(lotCharge(lot, [mkDispatch('l1', 'g1', 60, '2026-10-05')], AS_OF)).toBe(95000)
  })

  it('leaves the other rate types unchanged', () => {
    const l = (rateType: 'PER_DAY' | 'PER_MONTH' | 'PER_SEASON', rate: number) => mkLot('x', al, 10, '2026-09-01', { rateType, rate })
    expect(lotCharge(l('PER_DAY', 2), [], '2026-10-01')).toBe(10 * 30 * 2)
    expect(lotCharge(l('PER_MONTH', 28), [], '2026-10-01')).toBe((10 * 30 * 28) / 30)
    expect(lotCharge(l('PER_SEASON', 40), [], '2026-10-01')).toBe(400)
    // dispatch still reduces time-based charges: 10 boxes x 10 days + 6 boxes x 20 days
    expect(lotCharge(l('PER_DAY', 1), [mkDispatch('x', 'g1', 4, '2026-09-11')], '2026-10-01')).toBe(100 + 120)
    expect(estimateCharge(10, 30, 'PER_MONTH', 28)).toBe(280)
  })

  it('labels', () => {
    expect(rateLabel('PER_CRATE', 950)).toBe('₹950 / crate')
    expect(rateLabel('PER_MONTH', 28)).toBe('₹28 / box / month')
  })

  it('ledger shows one flat charge row per lot', () => {
    const d = { ...emptyData(), growers: [mkGrower('g1')], allocations: [al], lots: [lot], payments: [mkPay('p1', 'g1', 5000)] }
    const rows = buildLedger(d, 'g1', AS_OF)
    expect(rows.filter((r) => r.kind === 'CHARGE')).toHaveLength(1)
    expect(rows.at(-1)!.balance).toBe(90000)
    expect(buildLedger(d, 'g1', AS_OF, 'nope')).toHaveLength(0)
  })
})

describe('rate lives on the allocation', () => {
  it('new lots inherit the allocation rate, not the settings rate', () => {
    useStore.getState().resetDemo()
    const st = useStore.getState()
    const al = st.allocations[0]
    expect(al.rateType).toBe(st.settings.rateType) // seed gives every allocation a rate
    expect(st.updateAllocation(al.id, { rateType: 'PER_CRATE', rate: 950 }).ok).toBe(true)
    expect(st.updateSettings({ rate: 99, rateType: 'PER_DAY' }).ok).toBe(true) // default for NEW allocations only
    expect(useStore.getState().allocations[0].rate).toBe(950)
    const res = useStore.getState().receiveApples({
      allocationId: al.id, boxes: 10, variety: 'Ambri', grade: 'A', date: '2026-10-01', override: true,
      destination: 'Al Meazan', sourceLocation: 'Al Rehman', remark: 'test',
    }) // no chamberId -> auto placed
    expect(res.ok).toBe(true)
    const lot = useStore.getState().lots.find((l) => l.id === res.id)!
    expect(lot.rateType).toBe('PER_CRATE')
    expect(lot.rate).toBe(950)
    expect(lot.chamberId).not.toBe('')
    const rc = useStore.getState().receipts.find((r) => r.lotId === lot.id)!
    expect(rc.destination).toBe('Al Meazan')
    expect(rc.sourceLocation).toBe('Al Rehman')
  })

  it('approveRequest stamps the settings default on the new allocation', () => {
    useStore.getState().resetDemo()
    useStore.getState().updateSettings({ rateType: 'PER_CRATE', rate: 900 })
    const rq = useStore.getState().requests.find((r) => r.status === 'PENDING')!
    const res = useStore.getState().approveRequest(rq.id, 100)
    expect(res.ok).toBe(true)
    const al = useStore.getState().allocations.find((a) => a.id === res.id)!
    expect([al.rateType, al.rate]).toEqual(['PER_CRATE', 900])
    useStore.getState().resetDemo()
  })

  it('updateAllocation re-prices existing lots (and can leave them alone)', () => {
    useStore.getState().resetDemo()
    const al = useStore.getState().allocations[0]
    useStore.getState().updateAllocation(al.id, { rate: 77 }, false)
    expect(useStore.getState().lots.find((l) => l.allocationId === al.id)!.rate).not.toBe(77)
    useStore.getState().updateAllocation(al.id, { rate: 77 })
    expect(useStore.getState().lots.filter((l) => l.allocationId === al.id).every((l) => l.rate === 77)).toBe(true)
    useStore.getState().resetDemo()
  })

  it('recordPayment validates allocationId ownership', () => {
    useStore.getState().resetDemo()
    const [a, b] = useStore.getState().allocations
    const bad = useStore.getState().recordPayment({ growerId: a.growerId, allocationId: b.id, amount: 10, date: '2026-10-01', method: 'CASH' })
    expect(bad.ok).toBe(false)
    expect(useStore.getState().recordPayment({ growerId: a.growerId, allocationId: a.id, amount: 10, date: '2026-10-01', method: 'CASH' }).ok).toBe(true)
    useStore.getState().resetDemo()
  })
})

describe('negative balances (advances)', () => {
  const g1 = mkGrower('g1'), g2 = mkGrower('g2')
  const a1 = mkAlloc('a1', 'g1'), a2 = mkAlloc('a2', 'g2')
  const data = {
    ...emptyData(), growers: [g1, g2], allocations: [a1, a2],
    lots: [mkLot('l1', a1, 49), mkLot('l2', a2, 100)],
    payments: [mkPay('p1', 'g1', 50000), mkPay('p2', 'g2', 85000)],
  }
  const d = derive(data, AS_OF)

  it('grower stats keep the signed due and expose credit', () => {
    const s1 = d.growerStats.get('g1')!
    expect(s1.charges).toBe(46550)
    expect(s1.due).toBe(-3450)
    expect(s1.credit).toBe(3450)
    const s2 = d.growerStats.get('g2')!
    expect([s2.due, s2.credit]).toEqual([10000, 0])
  })

  it('credits never hide dues in the store KPIs', () => {
    expect(d.store.outstanding).toBe(10000) // not 6550
    expect(d.store.advances).toBe(3450)
    expect(d.store.netBalance).toBe(6550)
    expect(d.store.growersWithDue).toBe(1)
    expect(d.store.growersWithAdvance).toBe(1)
  })

  it('trade rows carry the negative balance', () => {
    const rows = buildTradeRows(data, d)
    expect(rows.find((r) => r.allocationId === 'a1')!.balance).toBe(-3450)
  })
})

describe('buildTradeRows', () => {
  it('one row per allocation with given/received/difference and per-allocation payments', () => {
    const g = mkGrower('g1')
    const a1 = mkAlloc('a1', 'g1', { externalRef: '3', boxes: 600, rate: 1050, remarks: 'hi' })
    const a2 = mkAlloc('a2', 'g1', { rate: 900 })
    const data = {
      ...emptyData(), growers: [g], allocations: [a1, a2],
      boxIssues: [mkIssue('i1', a1, 580), mkIssue('i2', a2, 100)],
      receipts: [mkReceipt('l1', a1, 406), mkReceipt('l2', a2, 50)],
      lots: [mkLot('l1', a1, 406), mkLot('l2', a2, 50)],
      payments: [mkPay('p1', 'g1', 1000, 'a2'), mkPay('p2', 'g1', 7000)], // p2 untagged -> first allocation
    }
    const [r1, r2] = buildTradeRows(data, derive(data, AS_OF))
    expect(r1).toMatchObject({ txnNo: '3', externalRef: '3', agreement: 600, rate: 1050, given: 580, received: 406, difference: 174, amount: 426300, paid: 7000, paidUnallocated: 7000, balance: 419300, remarks: 'hi' })
    expect(r2).toMatchObject({ txnNo: 'ALLOC-a2', amount: 45000, paid: 1000, paidUnallocated: 0, balance: 44000, rateMissing: false })
    // per-allocation ledger agrees with the trade row
    expect(buildLedger(data, 'g1', AS_OF, 'a1').at(-1)!.balance).toBe(r1.balance)
    expect(buildLedger(data, 'g1', AS_OF, 'a2').at(-1)!.balance).toBe(r2.balance)
  })
})

describe('placement', () => {
  it('auto-places into the emptiest chamber with room; null when nothing fits', () => {
    const d = derive(emptyData(), AS_OF)
    expect(autoPlace(d, 100)).toEqual({ chamberId: 'C-01', rackStart: 1 })
    const p = createPlacer(d.store.chambers)
    p.place(19000)
    expect(p.place(5000)!.chamberId).toBe('C-02')
    expect(autoPlace(d, 1_000_000)).toBeNull()
  })
})

describe('persist migration', () => {
  it('fills new fields on v1 state', () => {
    const v1 = {
      settings: { storeName: 'x', season: 's', capacity: 1, rateType: 'PER_MONTH', rate: 30, currency: 'INR' },
      allocations: [{ id: 'a1', growerId: 'g', boxes: 1 }, { id: 'a2', growerId: 'g', boxes: 1 }],
      lots: [{ allocationId: 'a2', rateType: 'PER_DAY', rate: 2 }],
    }
    const m = migrateState(v1) as { settings: { locations: unknown }; allocations: { rateType: string; rate: number }[] }
    expect(m.settings.locations).toEqual(defaultLocations())
    expect(m.allocations[0]).toMatchObject({ rateType: 'PER_MONTH', rate: 30 })
    expect(m.allocations[1]).toMatchObject({ rateType: 'PER_DAY', rate: 2 })
    expect(() => migrateState(undefined)).not.toThrow()
  })
})
