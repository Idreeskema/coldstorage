// Excel import / export for the customer's "Apple Trade Data Storage" workbook. Pure functions, no UI.
// Sheets: Main Transactions · Crates Movement · Payments · Dashboard · Customer List.
// exceljs is loaded lazily (dynamic import) so it stays out of the main bundle until used.
//
//   parseWorkbook(buffer)  -> ImportPreview   (normalised rows + warnings/errors + reconciliation vs the workbook)
//   exportWorkbook(data)   -> Blob            (same sheets/columns, values not formulas, so it round-trips)
// Applying a preview to app state lives in ./importer.ts (store action `importTrade`).
import type { CellValue, Worksheet } from 'exceljs'
import type { PayMethod, RateType } from './types'
import { buildTradeRows, derive, type Data } from './calc'
import { today } from './format'

/* ------------------------------------------------------------------ */
/* preview model                                                       */
/* ------------------------------------------------------------------ */

export interface ImportIssue { sheet: string; row?: number; message: string }

export interface ImportCustomer {
  key: string // normalised (trimmed, collapsed, lower-case) name
  name: string // display name (trimmed, first spelling seen)
  transactionIds: string[]
  inCustomerList: boolean
}

export interface ImportAgreement {
  row: number
  txnId: string
  customerKey: string
  name: string
  agreement: number // agreed quantity
  rate: number // 0 when the workbook has no rate yet
  rateType: RateType // PER_CRATE unless an optional "Rate Type" column says otherwise
  rateMissing: boolean
  remarks?: string
  /** computed from the parsed Crates Movement / Payments rows */
  given: number
  received: number
  amount: number // received × rate
  paid: number
  balance: number // amount − paid
  /** the workbook's own cached values for this row (undefined when blank / not cached) */
  workbook: { given?: number; received?: number; amount?: number; paid?: number; balance?: number }
}

export interface ImportMovement {
  row: number
  txnId: string
  customerKey: string
  name: string
  given: number // 0 = no "given" leg on this row
  dateGiven?: string // set whenever given > 0 (may be an assumed date)
  givenDateAssumed?: boolean
  from?: string // Destination From = pickup point
  driver?: string
  received: number // 0 = no "received" leg on this row
  to?: string // Destination To = storage site
  dateReceived?: string // set whenever received > 0 (may be an assumed date)
  receivedDateAssumed?: boolean
  driver2?: string
  remark?: string
}

export interface ImportPayment {
  row: number
  txnId: string
  customerKey: string
  name: string
  date: string // may be an assumed date
  dateAssumed?: boolean
  amount: number
  mode: PayMethod
  modeRaw?: string
  reference?: string
}

export interface ImportTotals {
  customers: number
  transactions: number
  cratesGiven: number
  cratesReceived: number
  payments: number
  amount: number // Σ received × rate
  /**
   * The workbook's "All Outstanding" = Σ Balance, where a row's Balance is blank (ignored) while its rate is
   * missing. Computed here the same way so the two can be reconciled. This is NOT the app's outstanding
   * (Σ per-grower max(0, due)).
   */
  outstanding: number
}

export interface ReconRow {
  key: keyof ImportTotals
  label: string
  computed: number
  workbook?: number // undefined when the workbook has no cached value
  match: boolean | null // null = nothing to compare with
}

export interface ImportPreview {
  customers: ImportCustomer[]
  agreements: ImportAgreement[]
  movements: ImportMovement[]
  payments: ImportPayment[]
  warnings: ImportIssue[]
  errors: ImportIssue[]
  totals: ImportTotals
  workbook: Partial<ImportTotals>
  reconciliation: ReconRow[]
  /** false when a required sheet/header is missing or there is no agreement at all */
  canImport: boolean
}

/* ------------------------------------------------------------------ */
/* cell helpers                                                        */
/* ------------------------------------------------------------------ */

const MAIN = 'Main Transactions'
const MOVE = 'Crates Movement'
const PAY = 'Payments'
const DASH = 'Dashboard'
const CUST = 'Customer List'

type Cell = unknown

/** Unwrap exceljs rich values (formula results, rich text, hyperlinks, errors). */
function raw(v: CellValue | undefined): Cell {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if ('result' in o) return raw(o.result as CellValue)
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('text' in o) return o.text
    if ('error' in o) return null
    return null
  }
  return v
}

const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** Trimmed, whitespace-collapsed text; blanks and the '0' / '-' placeholders become undefined. */
function toText(v: Cell): string | undefined {
  if (isBlank(v) || v instanceof Date) return undefined
  if (typeof v === 'number') return v === 0 ? undefined : String(v)
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s === '' || s === '0' || s === '-' || s === '—' ? undefined : s
}

function toNum(v: Cell): number | undefined {
  if (isBlank(v) || v instanceof Date) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (s === '' || s === '-') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function toId(v: Cell): string | undefined {
  if (isBlank(v)) return undefined
  if (typeof v === 'number') return String(v)
  return String(v).trim()
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const isoUTC = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`

/** 'YYYY-MM-DD' or undefined (blank, placeholder 0, time-only 00:00, unparsable). `bad` tells "had content but unparsable". */
function toIso(v: Cell): { iso?: string; bad?: boolean } {
  if (isBlank(v)) return {}
  if (v instanceof Date) {
    const y = v.getUTCFullYear()
    return y >= 1990 && y < 2200 ? { iso: isoUTC(v) } : {} // 1899-12-30 = Excel's 0 / time-only cell
  }
  if (typeof v === 'number') {
    if (v >= 20000 && v < 80000) return { iso: isoUTC(new Date(Math.round((v - 25569) * 86400000))) }
    return v === 0 ? {} : { bad: true }
  }
  const s = String(v).trim()
  if (s === '0' || s === '-') return {}
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return { iso: `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}` }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s) // Indian style dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return { iso: `${y}-${pad2(+m[2])}-${pad2(+m[1])}` }
  }
  return { bad: true }
}

export const normName = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const normHead = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export function parsePayMode(s?: string): PayMethod {
  const t = (s ?? '').toLowerCase()
  if (!t) return 'OTHER'
  if (/bank|neft|rtgs|imps|transfer|account/.test(t)) return 'BANK'
  if (/upi|gpay|google|phonepe|paytm/.test(t)) return 'UPI'
  if (/cheque|check/.test(t)) return 'CHEQUE'
  if (/cash/.test(t)) return 'CASH'
  return 'OTHER'
}
const PAY_LABEL: Record<PayMethod, string> = { CASH: 'Cash', UPI: 'UPI', BANK: 'Bank Transfer', CHEQUE: 'Cheque', OTHER: 'Other' }

/* ------------------------------------------------------------------ */
/* sheet reading                                                       */
/* ------------------------------------------------------------------ */

type Spec = Record<string, string[]>
interface Table { header: number; rows: { n: number; v: Record<string, Cell> }[] }

const MAIN_SPEC: Spec = {
  id: ['transactionid', 'txnid', 'id'], name: ['name', 'customer', 'customername'],
  agreement: ['agreement', 'agreementqty', 'agreementquantity'], rate: ['ratecrate', 'rate', 'ratepercrate'],
  given: ['totalcratesgiven'], received: ['totalcratesreceived'], amount: ['totalamount'], paid: ['totalpaid'],
  balance: ['balance'], remarks: ['remarks', 'remark'], rateType: ['ratetype'],
}
const MOVE_SPEC: Spec = {
  id: ['transactionid', 'txnid', 'id'], name: ['name', 'customer'], dateGiven: ['dategiven'], given: ['cratesgiven'],
  from: ['destinationfrom', 'from'], driver: ['drivername', 'driver'], received: ['cratesreceived'],
  to: ['destinationto', 'to'], dateReceived: ['datereceived'], driver2: ['drivername2'], remark: ['remark', 'remarks'],
}
const PAY_SPEC: Spec = {
  id: ['transactionid', 'txnid', 'id'], name: ['name', 'customer'], date: ['date'],
  amount: ['paymentamount', 'amount'], mode: ['paymentmode', 'mode'], ref: ['referencenotes', 'reference', 'notes'],
}

function findSheet(wb: { worksheets: Worksheet[] }, name: string): Worksheet | undefined {
  return wb.worksheets.find((w) => normHead(w.name) === normHead(name))
}

function readTable(ws: Worksheet, spec: Spec, required: string[]): Table | null {
  const last = Math.min(15, ws.rowCount)
  for (let r = 1; r <= last; r++) {
    const row = ws.getRow(r)
    const cols: Record<string, number> = {}
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const h = normHead(raw(cell.value))
      for (const [k, aliases] of Object.entries(spec)) if (!(k in cols) && aliases.includes(h)) cols[k] = c
    })
    if (!required.every((k) => k in cols)) continue
    const rows: Table['rows'] = []
    for (let n = r + 1; n <= ws.rowCount; n++) {
      const rr = ws.getRow(n)
      const v: Record<string, Cell> = {}
      let any = false
      for (const [k, c] of Object.entries(cols)) {
        v[k] = raw(rr.getCell(c).value)
        if (!isBlank(v[k])) any = true
      }
      if (any) rows.push({ n, v })
    }
    return { header: r, rows }
  }
  return null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/* ------------------------------------------------------------------ */
/* parseWorkbook                                                       */
/* ------------------------------------------------------------------ */

async function loadExcelJS() {
  const mod = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs')
  return mod.default ?? mod
}

export async function parseWorkbook(file: ArrayBuffer): Promise<ImportPreview> {
  const warnings: ImportIssue[] = []
  const errors: ImportIssue[] = []
  const warn = (sheet: string, row: number | undefined, message: string) => warnings.push({ sheet, row, message })
  const err = (sheet: string, row: number | undefined, message: string) => errors.push({ sheet, row, message })

  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(file)
  } catch {
    err('Workbook', undefined, 'This file could not be read as an .xlsx workbook.')
    return emptyPreview(warnings, errors)
  }

  const agreements: ImportAgreement[] = []
  const byTxn = new Map<string, ImportAgreement>()
  const byName = new Map<string, ImportAgreement[]>()
  const customers = new Map<string, ImportCustomer>()
  const touchCustomer = (name: string, txn?: string, inList = false) => {
    const key = normName(name)
    let c = customers.get(key)
    if (!c) customers.set(key, (c = { key, name, transactionIds: [], inCustomerList: false }))
    else if (c.name !== name && !inList) warn(MAIN, undefined, `"${name}" and "${c.name}" differ only in spacing/case — treated as one customer`)
    if (txn && !c.transactionIds.includes(txn)) c.transactionIds.push(txn)
    if (inList) c.inCustomerList = true
    return c
  }

  /* ---- Main Transactions ---- */
  const mainWs = findSheet(wb, MAIN)
  const mainT = mainWs ? readTable(mainWs, MAIN_SPEC, ['name', 'agreement']) : null
  if (!mainWs) err(MAIN, undefined, `Sheet "${MAIN}" not found.`)
  else if (!mainT) err(MAIN, undefined, `Header row not found on "${MAIN}" (expected Transaction ID, Name, Agreement, Rate / Crate ...).`)
  for (const { n, v } of mainT?.rows ?? []) {
    const name = toText(v.name)
    if (!name) { warn(MAIN, n, 'Row has values but no customer name — skipped'); continue }
    let txnId = toId(v.id)
    if (!txnId) { txnId = String(n - (mainT?.header ?? 1)); warn(MAIN, n, `No Transaction ID — using ${txnId}`) }
    if (byTxn.has(txnId)) { warn(MAIN, n, `Duplicate Transaction ID ${txnId} — row skipped`); continue }
    let rate = toNum(v.rate) ?? 0
    if (rate < 0) { warn(MAIN, n, 'Negative rate ignored'); rate = 0 }
    const qty = toNum(v.agreement)
    if (qty === undefined || qty < 0) warn(MAIN, n, `Transaction ${txnId}: agreement quantity missing`)
    const rt = String(toText(v.rateType) ?? '').toUpperCase().replace(/[\s-]+/g, '_')
    const rateType: RateType = (['PER_DAY', 'PER_MONTH', 'PER_SEASON', 'PER_CRATE'] as const).find((x) => x === rt) ?? 'PER_CRATE'
    const a: ImportAgreement = {
      row: n, txnId, customerKey: normName(name), name, agreement: Math.max(0, qty ?? 0), rate, rateType, rateMissing: !(rate > 0),
      remarks: toText(v.remarks), given: 0, received: 0, amount: 0, paid: 0, balance: 0,
      workbook: { given: toNum(v.given), received: toNum(v.received), amount: toNum(v.amount), paid: toNum(v.paid), balance: toNum(v.balance) },
    }
    if (a.rateMissing) warn(MAIN, n, `Transaction ${txnId} (${name}): no rate yet — charges stay ₹0 until a rate is set`)
    agreements.push(a)
    byTxn.set(txnId, a)
    byName.set(a.customerKey, [...(byName.get(a.customerKey) ?? []), a])
    touchCustomer(name, txnId)
  }

  /* ---- Customer List ---- */
  const custWs = findSheet(wb, CUST)
  if (!custWs) warn(CUST, undefined, `Sheet "${CUST}" not found — customers are taken from Main Transactions`)
  else {
    let listed = 0
    custWs.eachRow({ includeEmpty: false }, (row, n) => {
      const name = toText(raw(row.getCell(1).value))
      if (!name || normHead(name) === 'customername' || normHead(name) === 'name') return
      listed++
      const key = normName(name)
      const had = customers.has(key)
      touchCustomer(name, undefined, true)
      if (!had) warn(CUST, n, `"${name}" is in the customer list but has no transaction`)
    })
    if (listed) for (const c of customers.values()) if (!c.inCustomerList) warn(CUST, undefined, `"${c.name}" has a transaction but is missing from the customer list`)
  }

  /* ---- resolve a Transaction ID / name to an agreement ---- */
  const resolve = (sheet: string, n: number, id: string | undefined, name: string | undefined): ImportAgreement | undefined => {
    if (id && byTxn.has(id)) {
      const a = byTxn.get(id)!
      if (name && normName(name) !== a.customerKey) warn(sheet, n, `Name "${name}" differs from "${a.name}" on Transaction ${id} — using the Transaction ID`)
      return a
    }
    if (name) {
      const list = byName.get(normName(name)) ?? []
      if (list.length === 1) {
        warn(sheet, n, `Transaction ID ${id ?? '(blank)'} not found — matched "${name}" to Transaction ${list[0].txnId}`)
        return list[0]
      }
      if (list.length > 1) { err(sheet, n, `Transaction ID ${id ?? '(blank)'} not found and "${name}" has ${list.length} transactions — row skipped`); return undefined }
    }
    err(sheet, n, `Unknown Transaction ID ${id ?? '(blank)'}${name ? ` / "${name}"` : ''} — row skipped`)
    return undefined
  }

  /* ---- Crates Movement ---- */
  const movements: ImportMovement[] = []
  const moveWs = findSheet(wb, MOVE)
  const moveT = moveWs ? readTable(moveWs, MOVE_SPEC, ['id', 'given', 'received']) : null
  if (!moveWs) warn(MOVE, undefined, `Sheet "${MOVE}" not found — no crate movements imported`)
  else if (!moveT) err(MOVE, undefined, `Header row not found on "${MOVE}".`)
  const dates: string[] = []
  const pendingMoves: { n: number; a: ImportAgreement; v: Record<string, Cell>; given: number; received: number; dg?: string; dr?: string }[] = []
  for (const { n, v } of moveT?.rows ?? []) {
    const given = Math.max(0, toNum(v.given) ?? 0)
    const received = Math.max(0, toNum(v.received) ?? 0)
    if (given === 0 && received === 0) continue // blank / '0' placeholder row
    const a = resolve(MOVE, n, toId(v.id), toText(v.name))
    if (!a) continue
    const dg = toIso(v.dateGiven), dr = toIso(v.dateReceived)
    if (dg.bad) warn(MOVE, n, `Unreadable Date Given "${String(v.dateGiven)}"`)
    if (dr.bad) warn(MOVE, n, `Unreadable Date Received "${String(v.dateReceived)}"`)
    if (dg.iso) dates.push(dg.iso)
    if (dr.iso) dates.push(dr.iso)
    pendingMoves.push({ n, a, v, given, received, dg: dg.iso, dr: dr.iso })
  }
  /* ---- Payments ---- */
  const payments: ImportPayment[] = []
  const payWs = findSheet(wb, PAY)
  const payT = payWs ? readTable(payWs, PAY_SPEC, ['id', 'amount']) : null
  if (!payWs) warn(PAY, undefined, `Sheet "${PAY}" not found — no payments imported`)
  else if (!payT) err(PAY, undefined, `Header row not found on "${PAY}".`)
  const pendingPays: { n: number; a: ImportAgreement; v: Record<string, Cell>; amount: number; d?: string }[] = []
  for (const { n, v } of payT?.rows ?? []) {
    const amount = toNum(v.amount)
    if (amount === undefined || amount === 0) {
      if (toId(v.id)) warn(PAY, n, 'Payment row without an amount — skipped')
      continue
    }
    if (amount < 0) { warn(PAY, n, `Negative payment ${amount} — skipped (record refunds manually)`); continue }
    const a = resolve(PAY, n, toId(v.id), toText(v.name))
    if (!a) continue
    const d = toIso(v.date)
    if (d.bad) warn(PAY, n, `Unreadable payment date "${String(v.date)}"`)
    if (d.iso) dates.push(d.iso)
    pendingPays.push({ n, a, v, amount, d: d.iso })
  }

  /* ---- date fallbacks (deterministic, always flagged) ---- */
  dates.sort()
  const earliestAll = dates[0] ?? today()
  const earliestOf = (a: ImportAgreement) => {
    const ds: string[] = []
    for (const m of pendingMoves) if (m.a === a) ds.push(...[m.dg, m.dr].filter((x): x is string => !!x))
    for (const p of pendingPays) if (p.a === a && p.d) ds.push(p.d)
    return ds.sort()[0] ?? earliestAll
  }
  for (const m of pendingMoves) {
    const mv: ImportMovement = {
      row: m.n, txnId: m.a.txnId, customerKey: m.a.customerKey, name: m.a.name, given: m.given, received: m.received,
      from: toText(m.v.from), driver: toText(m.v.driver), to: toText(m.v.to), driver2: toText(m.v.driver2), remark: toText(m.v.remark),
    }
    if (m.given > 0) {
      mv.dateGiven = m.dg ?? m.dr ?? earliestOf(m.a)
      if (!m.dg) { mv.givenDateAssumed = true; warn(MOVE, m.n, `Date Given missing — using ${mv.dateGiven}`) }
    }
    if (m.received > 0) {
      mv.dateReceived = m.dr ?? m.dg ?? earliestOf(m.a)
      if (!m.dr) { mv.receivedDateAssumed = true; warn(MOVE, m.n, `Date Received missing — using ${mv.dateReceived}`) }
    }
    movements.push(mv)
  }
  for (const p of pendingPays) {
    const date = p.d ?? earliestOf(p.a)
    if (!p.d) warn(PAY, p.n, `Payment date missing — using ${date}`)
    const modeRaw = toText(p.v.mode)
    payments.push({
      row: p.n, txnId: p.a.txnId, customerKey: p.a.customerKey, name: p.a.name, date, dateAssumed: !p.d || undefined,
      amount: p.amount, mode: parsePayMode(modeRaw), modeRaw, reference: toText(p.v.ref),
    })
  }

  /* ---- per-agreement computed values ---- */
  for (const a of agreements) {
    a.given = movements.filter((m) => m.txnId === a.txnId).reduce((s, m) => s + m.given, 0)
    a.received = movements.filter((m) => m.txnId === a.txnId).reduce((s, m) => s + m.received, 0)
    a.paid = payments.filter((p) => p.txnId === a.txnId).reduce((s, p) => s + p.amount, 0)
    a.amount = a.received * a.rate
    a.balance = a.amount - a.paid
    if (a.agreement > 0 && a.received > a.agreement) warn(MAIN, a.row, `Transaction ${a.txnId}: received ${a.received} exceeds agreement ${a.agreement}`)
    if (a.received > a.given) warn(MAIN, a.row, `Transaction ${a.txnId}: received ${a.received} exceeds given ${a.given} (will be flagged as override)`)
  }

  /* ---- totals + reconciliation ---- */
  const totals: ImportTotals = {
    customers: customers.size, transactions: agreements.length,
    cratesGiven: agreements.reduce((s, a) => s + a.given, 0),
    cratesReceived: agreements.reduce((s, a) => s + a.received, 0),
    payments: payments.reduce((s, p) => s + p.amount, 0),
    amount: agreements.reduce((s, a) => s + a.amount, 0),
    outstanding: agreements.filter((a) => !a.rateMissing).reduce((s, a) => s + a.balance, 0),
  }
  const workbook = readWorkbookTotals(wb, agreements)
  const labels: Record<keyof ImportTotals, string> = {
    customers: 'Customers', transactions: 'Transactions', cratesGiven: 'Crates given', cratesReceived: 'Crates received',
    payments: 'Payments', amount: 'Total amount', outstanding: 'Outstanding',
  }
  const reconciliation: ReconRow[] = (Object.keys(labels) as (keyof ImportTotals)[]).map((key) => {
    const w = workbook[key]
    return { key, label: labels[key], computed: totals[key], workbook: w, match: w === undefined ? null : Math.abs(w - totals[key]) < 0.5 }
  })
  for (const r of reconciliation)
    if (r.match === false) warn(DASH, undefined, `${r.label}: workbook says ${r.workbook}, imported rows add up to ${r2(r.computed)}`)

  return {
    customers: [...customers.values()], agreements, movements, payments, warnings, errors, totals, workbook, reconciliation,
    canImport: agreements.length > 0 && !errors.some((e) => e.row === undefined),
  }
}

function emptyPreview(warnings: ImportIssue[], errors: ImportIssue[]): ImportPreview {
  const totals: ImportTotals = { customers: 0, transactions: 0, cratesGiven: 0, cratesReceived: 0, payments: 0, amount: 0, outstanding: 0 }
  return { customers: [], agreements: [], movements: [], payments: [], warnings, errors, totals, workbook: {}, reconciliation: [], canImport: false }
}

/** The workbook's own totals: Dashboard "Overall Business Summary" (cached values), falling back to Main Transactions sums. */
function readWorkbookTotals(wb: { worksheets: Worksheet[] }, agreements: ImportAgreement[]): Partial<ImportTotals> {
  const out: Partial<ImportTotals> = {}
  const dash = findSheet(wb, DASH)
  const map: Record<string, keyof ImportTotals> = {
    totalcustomers: 'customers', totaltransactions: 'transactions', allcratesgiven: 'cratesGiven',
    allcratesreceived: 'cratesReceived', allpayments: 'payments', alloutstanding: 'outstanding',
  }
  dash?.eachRow({ includeEmpty: false }, (row) => {
    const key = map[normHead(raw(row.getCell(1).value))]
    const val = toNum(raw(row.getCell(2).value))
    if (key && val !== undefined && !(key in out)) out[key] = val
  })
  const sum = (f: (a: ImportAgreement) => number | undefined) => {
    const xs = agreements.map(f).filter((x): x is number => x !== undefined)
    return xs.length ? xs.reduce((s, x) => s + x, 0) : undefined
  }
  out.cratesGiven ??= sum((a) => a.workbook.given)
  out.cratesReceived ??= sum((a) => a.workbook.received)
  out.payments ??= sum((a) => a.workbook.paid)
  out.outstanding ??= sum((a) => a.workbook.balance)
  const amt = sum((a) => a.workbook.amount)
  if (amt !== undefined) out.amount = amt
  for (const k of Object.keys(out) as (keyof ImportTotals)[]) if (out[k] === undefined) delete out[k]
  return out
}

/* ------------------------------------------------------------------ */
/* exportWorkbook                                                      */
/* ------------------------------------------------------------------ */

const utc = (iso?: string) => (iso ? new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))) : null)

/**
 * Writes the same five sheets/columns as the customer's workbook (plus an optional trailing "Rate Type" column on
 * Main Transactions). Values, not formulas. Box issues and receipts are written as separate rows (a "given" row
 * and a "received" row) because the app does not pair them; they re-import identically. Dispatches are not exported.
 * Payments without an allocation are written against the grower's first agreement (see paymentAllocationId).
 */
export async function exportWorkbook(data: Data, asOf = today()): Promise<Blob> {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = data.settings.storeName
  const derived = derive(data, asOf)
  const trade = buildTradeRows(data, derived)
  const txnOf = new Map(trade.map((t) => [t.allocationId, t.txnNo]))
  const growerName = new Map(data.growers.map((g) => [g.id, g.name]))
  const firstTxn = (growerId: string) => trade.find((t) => t.growerId === growerId)?.txnNo
  const allocTxn = (growerId: string, allocationId?: string) => (allocationId && txnOf.get(allocationId)) || firstTxn(growerId) || ''

  const sheet = (name: string, headers: string[], widths: number[]) => {
    const ws = wb.addWorksheet(name)
    ws.addRow(headers)
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0E8' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
    return ws
  }
  const NUM = '#,##0', DATE = 'dd-mmm-yyyy'
  const fmt = (ws: Worksheet, cols: number[], f: string) => cols.forEach((c) => (ws.getColumn(c).numFmt = f))

  /* Main Transactions */
  const main = sheet(MAIN, ['Transaction ID', 'Name', 'Agreement', 'Rate / Crate', 'Total Crates Given', 'Total Crates Received',
    'Total Amount', 'Total Paid', 'Balance', 'Remarks', 'Rate Type'], [16, 30, 12, 13, 18, 20, 14, 14, 14, 30, 13])
  for (const t of trade)
    main.addRow([t.txnNo, t.name, t.agreement, t.rate > 0 ? t.rate : null, t.given, t.received,
      t.rateMissing ? null : Math.round(t.amount * 100) / 100, t.paid, t.rateMissing ? null : Math.round(t.balance * 100) / 100,
      t.remarks ?? null, t.rateType])
  fmt(main, [3, 4, 5, 6, 7, 8, 9], NUM)

  /* Crates Movement */
  const move = sheet(MOVE, ['Transaction ID', 'Name', 'Date Given', 'Crates Given', 'Destination From', 'Driver Name',
    'Crates Received', 'Destination To', 'Date Received', 'Driver Name2', 'Remark'], [16, 30, 14, 13, 18, 18, 15, 18, 14, 18, 36])
  const evts: { date: string; row: (string | number | Date | null)[] }[] = []
  for (const b of data.boxIssues)
    evts.push({ date: b.date, row: [allocTxn(b.growerId, b.allocationId), growerName.get(b.growerId) ?? '', utc(b.date), b.quantity,
      b.fromLocation ?? null, b.driver ?? null, null, null, null, null, b.notes ?? null] })
  for (const r of data.receipts)
    evts.push({ date: r.receivedDate, row: [allocTxn(r.growerId, r.allocationId), growerName.get(r.growerId) ?? '', null, null,
      r.sourceLocation ?? null, null, r.boxes, r.destination ?? null, utc(r.receivedDate), r.driver ?? null, r.remark ?? r.notes ?? null] })
  evts.sort((a, b) => a.date.localeCompare(b.date))
  evts.forEach((e) => move.addRow(e.row))
  fmt(move, [3, 9], DATE); fmt(move, [4, 7], NUM)

  /* Payments */
  const pay = sheet(PAY, ['Transaction ID', 'Name', 'Date', 'Payment Amount', 'Payment Mode', 'Reference / Notes'], [16, 30, 14, 16, 16, 36])
  for (const p of [...data.payments].sort((a, b) => a.date.localeCompare(b.date)))
    pay.addRow([allocTxn(p.growerId, p.allocationId), growerName.get(p.growerId) ?? '', utc(p.date), p.amount, PAY_LABEL[p.method], p.reference ?? p.notes ?? null])
  fmt(pay, [3], DATE); fmt(pay, [4], NUM)

  /* Dashboard (values) */
  const dash = wb.addWorksheet(DASH)
  dash.getColumn(1).width = 30
  for (let c = 2; c <= 7; c++) dash.getColumn(c).width = 16
  dash.addRow(['APPLE TRADE — CUSTOMER-WISE DASHBOARD']).font = { bold: true, size: 14 }
  dash.addRow([])
  dash.addRow(['Overall Business Summary']).font = { bold: true }
  const custKeys = [...new Set(trade.map((t) => normName(t.name)))]
  const rated = trade.filter((t) => !t.rateMissing)
  const growerDue = [...derived.growerStats.values()]
  const summary: [string, number][] = [
    ['Total Customers', Math.max(custKeys.length, data.growers.length)],
    ['Total Transactions', trade.length],
    ['All Crates Given', trade.reduce((s, t) => s + t.given, 0)],
    ['All Crates Received', trade.reduce((s, t) => s + t.received, 0)],
    ['All Payments', trade.reduce((s, t) => s + t.paid, 0)],
    ['All Outstanding', rated.reduce((s, t) => s + t.balance, 0)], // workbook rule: rows without a rate are ignored
    ['Dues Outstanding (excl. advances)', growerDue.reduce((s, g) => s + Math.max(0, g.due), 0)],
    ['Customer Advances', growerDue.reduce((s, g) => s + Math.max(0, -g.due), 0)],
  ]
  for (const [k, v] of summary) dash.addRow([k, Math.round(v * 100) / 100]).getCell(2).numFmt = NUM
  dash.addRow([])
  const head = dash.addRow(['Customer', 'Crates Given', 'Crates Received', 'Crates Difference', 'Total Amount', 'Total Paid', 'Outstanding Balance'])
  head.font = { bold: true }
  const perCust = new Map<string, { name: string; g: number; r: number; a: number; p: number; b: number }>()
  for (const t of trade) {
    const k = normName(t.name)
    const c = perCust.get(k) ?? { name: t.name, g: 0, r: 0, a: 0, p: 0, b: 0 }
    c.g += t.given; c.r += t.received; c.a += t.amount; c.p += t.paid; c.b += t.balance
    perCust.set(k, c)
  }
  for (const c of perCust.values()) {
    const row = dash.addRow([c.name, c.g, c.r, c.g - c.r, Math.round(c.a * 100) / 100, c.p, Math.round(c.b * 100) / 100])
    for (let i = 2; i <= 7; i++) row.getCell(i).numFmt = NUM
  }

  /* Customer List (header, blank row, names from row 3 — same layout as the original) */
  const cust = sheet(CUST, ['Customer Name'], [34])
  cust.addRow([])
  for (const g of data.growers) cust.addRow([g.name])

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
