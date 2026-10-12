import { existsSync, readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildTradeRows, derive } from './calc'
import { exportWorkbook, parseWorkbook, type ImportPreview } from './excel'
import { applyImport } from './importer'
import { useStore } from './store'
import { emptyData } from './testutil'

const AS_OF = '2030-01-01'
const REAL = 'C:\\Users\\idrees.kema\\Downloads\\Apple Trade Data Storage Customer_Dashboard.xlsx'

const toAB = (buf: Buffer | Uint8Array): ArrayBuffer => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
const bigD = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/** A deliberately messy synthetic workbook (no customer data). */
async function messyWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const main = wb.addWorksheet('Main Transactions')
  main.addRow(['Transaction ID', 'Name', 'Agreement ', 'Rate / Crate', 'Total Crates Given', 'Total Crates Received', 'Total Amount', 'Total Paid', 'Balance', 'Remarks'])
  main.addRow([1, '  Ali   Khan ', 100, 900, 100, 80, 72000, 80000, -8000, 'note'])
  main.addRow([2, 'ali khan', 50, 800]) // same customer, second transaction, different case
  main.addRow([3, 'Bilal', 40, null]) // no rate yet
  main.addRow([null, null, null, null]) // blank row
  main.addRow([{ formula: 'ROW()-1', result: 5 }, 'Chand', 10, 700]) // formula-valued Transaction ID
  const move = wb.addWorksheet('Crates Movement')
  move.addRow(['Transaction ID', 'Name', 'Date Given', 'Crates Given', 'Destination From', 'Driver Name', 'Crates Received', 'Destination To', 'Date Received', 'Driver Name2', 'Remark'])
  move.addRow([1, 'Ali Khan', bigD(2026, 9, 27), 100, 'Al Rehman', 'D1', 80, 'Al Meazan', bigD(2026, 9, 28), 'D2', 'Red Delicious 9'])
  move.addRow([2, 'Ali Khan', null, 30, 'Own Return', 'D1', 20, 'Kongposh', bigD(2026, 10, 1), null, null]) // missing Date Given
  move.addRow([3, 'Bilal', bigD(2026, 10, 1), 40, 'Al Rehman', null, 0, 0, new Date(Date.UTC(1899, 11, 30)), 0, 0]) // '0' placeholders
  move.addRow([3, 'Bilal', bigD(2026, 10, 2), 0, null, null, 0, null, null, null, null]) // empty movement
  move.addRow([99, 'Nobody', bigD(2026, 10, 2), 5, null, null, null, null, null, null, null]) // unknown txn
  move.addRow([5, 'Chand', bigD(2026, 10, 3), 10, 'Al Rehman', null, 10, 'Al Meazan', null, null, null]) // missing Date Received
  const pay = wb.addWorksheet('Payments')
  pay.addRow(['Transaction ID', 'Name', 'Date', 'Payment Amount', 'Payment Mode', 'Reference / Notes'])
  pay.addRow([1, 'Ali Khan', bigD(2026, 9, 28), 80000, 'Bank Transfer', 'ref1'])
  pay.addRow([3, 'Bilal', null, 1000, 'Cash', null]) // missing date
  pay.addRow([null, { formula: 'XLOOKUP()', result: '' }, null, null, null, null]) // formula-only blank
  const cust = wb.addWorksheet('Customer List')
  cust.addRow(['Customer Name']); cust.addRow([]); cust.addRow(['Ali Khan']); cust.addRow(['Bilal']); cust.addRow(['Chand']); cust.addRow(['Idle Customer'])
  return toAB(Buffer.from(await wb.xlsx.writeBuffer()))
}

describe('parseWorkbook (messy synthetic workbook)', () => {
  it('normalises names, skips blanks/placeholders and flags problems', async () => {
    const p = await parseWorkbook(await messyWorkbook())
    expect(p.canImport).toBe(true)
    expect(p.agreements.map((a) => a.txnId)).toEqual(['1', '2', '3', '5']) // formula id resolved
    expect(p.customers.map((c) => c.name)).toEqual(['Ali Khan', 'Bilal', 'Chand', 'Idle Customer'])
    expect(p.customers[0].transactionIds).toEqual(['1', '2'])
    expect(p.agreements[0].name).toBe('Ali Khan') // trimmed + collapsed
    expect(p.agreements[2].rateMissing).toBe(true)
    // movements: placeholder-only rows dropped, the Bilal give row kept without receive leg
    const bilal = p.movements.filter((m) => m.txnId === '3')
    expect(bilal).toHaveLength(1)
    expect(bilal[0]).toMatchObject({ given: 40, received: 0, from: 'Al Rehman', to: undefined, driver2: undefined })
    // missing dates fall back (and are flagged)
    const m2 = p.movements.find((m) => m.txnId === '2')!
    expect(m2.givenDateAssumed).toBe(true)
    expect(m2.dateGiven).toBe('2026-10-01')
    expect(p.movements.find((m) => m.txnId === '5')!.dateReceived).toBe('2026-10-03')
    expect(p.payments.find((x) => x.txnId === '3')!.dateAssumed).toBe(true)
    expect(p.payments[0].mode).toBe('BANK')
    // issues
    expect(p.errors.some((e) => e.sheet === 'Crates Movement' && /99/.test(e.message))).toBe(true)
    expect(p.warnings.some((w) => /no transaction/.test(w.message))).toBe(true) // Idle Customer
    expect(p.warnings.some((w) => /no rate yet/.test(w.message))).toBe(true)
    // totals + reconciliation (workbook cached Balance rows exist on row 1 only)
    expect(p.totals).toMatchObject({ customers: 4, transactions: 4, cratesGiven: 180, cratesReceived: 110, payments: 81000 })
    expect(p.reconciliation.find((r) => r.key === 'amount')).toMatchObject({ computed: 72000 + 16000 + 7000, workbook: 72000, match: false })
  })

  it('rejects a non-xlsx file gracefully', async () => {
    const p = await parseWorkbook(new TextEncoder().encode('not a workbook').buffer as ArrayBuffer)
    expect(p.canImport).toBe(false)
    expect(p.errors.length).toBeGreaterThan(0)
  })
})

describe('applyImport', () => {
  it('replace builds consistent growers/allocations/issues/receipts/lots/payments', async () => {
    const p = await parseWorkbook(await messyWorkbook())
    const { data, summary } = applyImport(emptyData(), p, 'replace', { user: 'tester' })
    expect(summary).toMatchObject({ growersAdded: 4, allocationsAdded: 4, issuesAdded: 4, receiptsAdded: 3, paymentsAdded: 2, cratesGiven: 180, cratesReceived: 110 })
    expect(data.activities).toHaveLength(1)
    expect(data.activities[0].type).toBe('DATA_IMPORTED')
    expect(data.growers.every((g) => g.status === 'ACTIVE')).toBe(true)
    const al = data.allocations.find((a) => a.externalRef === '1')!
    expect([al.rateType, al.rate, al.boxes]).toEqual(['PER_CRATE', 900, 100])
    expect(data.lots.every((l) => l.rateType === 'PER_CRATE' && l.chamberId !== '')).toBe(true)
    expect(data.receipts.find((r) => r.remark === 'Red Delicious 9')).toMatchObject({ variety: 'Red Delicious', destination: 'Al Meazan', sourceLocation: 'Al Rehman', driver: 'D2' })
    // txn 2: received 20 > issued 30? no -> 30 issued, fine. txn 5: 10 issued, 10 received. Nothing flagged.
    expect(summary.overrideReceipts).toBe(0)
  })

  it('flags receipts that exceed issued boxes and falls back to unassigned when no chamber has room', async () => {
    const p = await parseWorkbook(await messyWorkbook())
    p.movements.push({ ...p.movements[0], row: 999, given: 0, dateGiven: undefined, received: 5_000_000, dateReceived: '2026-10-09' })
    const { data, summary } = applyImport(emptyData(), p, 'replace')
    expect(summary.overrideReceipts).toBe(1)
    expect(summary.unplacedLots).toBe(1)
    const lot = data.lots.find((l) => l.boxesReceived === 5_000_000)!
    expect(lot.chamberId).toBe('')
    const d = derive(data, AS_OF) // must not crash; counted as stored but unplaced
    expect(d.store.unplacedBoxes).toBe(5_000_000)
  })

  it('merge is idempotent and adds only new rows', async () => {
    const p = await parseWorkbook(await messyWorkbook())
    const once = applyImport(emptyData(), p, 'merge').data
    const twice = applyImport(once, p, 'merge')
    expect(twice.summary).toMatchObject({ growersAdded: 0, allocationsAdded: 0, allocationsUpdated: 4, issuesAdded: 0, receiptsAdded: 0, paymentsAdded: 0 })
    expect(twice.summary.duplicatesSkipped).toBe(4 + 3 + 2)
    expect(twice.data.lots).toHaveLength(once.lots.length)
    // a new payment row arrives later
    p.payments.push({ ...p.payments[0], row: 50, amount: 123 })
    const third = applyImport(twice.data, p, 'merge')
    expect(third.summary.paymentsAdded).toBe(1)
  })

  it('store action importTrade replaces demo data and logs one activity', async () => {
    useStore.getState().resetDemo()
    const p = await parseWorkbook(await messyWorkbook())
    const res = useStore.getState().importTrade(p, 'replace')
    expect(res.ok).toBe(true)
    const s = useStore.getState()
    expect(s.growers).toHaveLength(4)
    expect(s.activities).toHaveLength(1)
    expect(s.chambers).toHaveLength(5)
    expect(useStore.getState().importTrade({ ...p, canImport: false }, 'merge').ok).toBe(false)
    useStore.getState().resetDemo()
  })
})

describe('export -> parse round trip', () => {
  it('re-imports to the same counts and totals', async () => {
    const p1 = await parseWorkbook(await messyWorkbook())
    const data1 = applyImport(emptyData(), p1, 'replace').data
    const blob = await exportWorkbook(data1, AS_OF)
    expect(blob.size).toBeGreaterThan(1000)
    const p2 = await parseWorkbook(await blob.arrayBuffer())
    expect(p2.errors).toEqual([])
    expect(p2.totals.customers).toBe(p1.totals.customers)
    expect(p2.totals).toEqual({ ...p1.totals, amount: p2.totals.amount, outstanding: p2.totals.outstanding })
    expect(p2.agreements.map((a) => a.agreement)).toEqual(p1.agreements.map((a) => a.agreement))
    expect(p2.movements.filter((m) => m.given > 0)).toHaveLength(p1.movements.filter((m) => m.given > 0).length)
    expect(p2.movements.filter((m) => m.received > 0)).toHaveLength(p1.movements.filter((m) => m.received > 0).length)
    expect(p2.payments).toHaveLength(p1.payments.length)
    // exported dashboard values reconcile with what was re-read
    expect(p2.reconciliation.filter((r) => r.match === false)).toEqual([])
    // and a second import of the export builds equivalent trade rows
    const rows = (d: typeof data1) => buildTradeRows(d, derive(d, AS_OF)).map((r) => [r.name, r.agreement, r.rate, r.given, r.received, r.amount, r.paid, r.balance])
    expect(rows(applyImport(emptyData(), p2, 'replace').data)).toEqual(rows(data1))
  })

  it('exports the demo seed without throwing and keeps location/driver fields', async () => {
    useStore.getState().resetDemo()
    const s = useStore.getState()
    const open = [...derive(s, AS_OF).allocStats.values()].find((a) => a.remainingToIssue > 0)!
    const res = s.issueBoxes({ allocationId: open.allocationId, quantity: 1, date: '2026-10-01', boxType: 'Wooden', issuedBy: 't', fromLocation: 'Imam Sahib', driver: 'Drv' })
    expect(res.ok).toBe(true)
    const blob = await exportWorkbook(useStore.getState(), AS_OF)
    const p = await parseWorkbook(await blob.arrayBuffer())
    expect(p.movements.find((m) => m.from === 'Imam Sahib')).toMatchObject({ driver: 'Drv', given: 1 })
    expect(p.agreements).toHaveLength(useStore.getState().allocations.length)
    useStore.getState().resetDemo()
  })
})

describe.skipIf(!existsSync(REAL))("customer's real workbook (local only)", () => {
  it('reconciles to the workbook Dashboard totals', async () => {
    const p: ImportPreview = await parseWorkbook(toAB(readFileSync(REAL)))
    expect(p.canImport).toBe(true)
    expect(p.errors).toEqual([])
    expect(p.totals).toMatchObject({ customers: 11, transactions: 11, cratesGiven: 2500, cratesReceived: 1615, payments: 270000, outstanding: 775200 })
    expect(p.workbook).toMatchObject({ customers: 11, transactions: 11, cratesGiven: 2500, cratesReceived: 1615, payments: 270000, outstanding: 775200 })
    expect(p.reconciliation.filter((r) => r.match === false)).toEqual([])

    const { data } = applyImport(emptyData(), p, 'replace')
    const d = derive(data, AS_OF)
    const rows = buildTradeRows(data, d)
    expect(rows).toHaveLength(11)
    expect(rows.reduce((s, r) => s + r.given, 0)).toBe(2500)
    expect(rows.reduce((s, r) => s + r.received, 0)).toBe(1615)
    expect(rows.reduce((s, r) => s + r.paid, 0)).toBe(270000)
    expect(rows.filter((r) => !r.rateMissing).reduce((s, r) => s + r.balance, 0)).toBe(775200) // workbook rule
    const t3 = rows.find((r) => r.txnNo === '3')!
    expect(t3).toMatchObject({ name: 'Mohd Ashraf Khan', agreement: 600, rate: 1050, given: 580, received: 406, amount: 426300, balance: 426300 })
    expect(rows.find((r) => r.txnNo === '5')!.balance).toBe(-3450)
    // app KPIs: advances are not netted against dues
    expect(d.store.totalCharges).toBe(945200)
    expect(d.store.advances).toBe(3450 + 10000 + 100000)
    expect(d.store.outstanding).toBe(426300 + 116900 + 245450)
    expect(d.store.stored).toBe(1615)
    expect(d.store.unplacedBoxes).toBe(0)
  })
})
