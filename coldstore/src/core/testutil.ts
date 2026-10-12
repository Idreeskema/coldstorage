// Test helpers (not imported by app code).
import { buildSeed } from './seed'
import type { Data } from './calc'
import type { Allocation, AppleReceipt, BoxIssue, Dispatch, Grower, Lot, Payment } from './types'

/** Chambers + settings from the seed, everything else empty. */
export function emptyData(): Data {
  const s = buildSeed()
  return {
    ...s, growers: [], requests: [], allocations: [], boxIssues: [], receipts: [], lots: [], dispatches: [], payments: [],
    activities: [], notifications: [],
  }
}

export const mkGrower = (id: string, name = id): Grower =>
  ({ id, code: `GRW-${id}`, name, phone: '', village: '', district: '', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z' })

export const mkAlloc = (id: string, growerId: string, o: Partial<Allocation> = {}): Allocation => ({
  id, code: `ALLOC-${id}`, requestId: `rq-${id}`, growerId, boxes: 1000, durationMonths: 5, createdAt: '2026-01-01T00:00:00Z',
  rateType: 'PER_CRATE', rate: 950, ...o,
})

export const mkLot = (id: string, al: Allocation, boxes: number, start = '2026-09-27', o: Partial<Lot> = {}): Lot => ({
  id, code: `LOT-${id}`, growerId: al.growerId, allocationId: al.id, receiptId: `rc-${id}`, boxesReceived: boxes, variety: 'X', grade: 'A',
  storageStartDate: start, expectedReleaseDate: '2027-03-01', chamberId: 'C-01', rackStart: 1, rateType: al.rateType, rate: al.rate, ...o,
})

export const mkReceipt = (id: string, al: Allocation, boxes: number, date = '2026-09-27'): AppleReceipt => ({
  id: `rc-${id}`, code: `RCPT-${id}`, growerId: al.growerId, allocationId: al.id, lotId: id, boxes, variety: 'X', grade: 'A',
  receivedDate: date, chamberId: 'C-01', rackStart: 1,
})

export const mkIssue = (id: string, al: Allocation, quantity: number, date = '2026-09-26'): BoxIssue => ({
  id, code: `BOX-${id}`, growerId: al.growerId, allocationId: al.id, quantity, date, boxType: 'Wooden', issuedBy: 't',
})

export const mkPay = (id: string, growerId: string, amount: number, allocationId?: string): Payment => ({
  id, code: `PAY-${id}`, growerId, amount, date: '2026-09-28', method: 'BANK', allocationId,
})

export const mkDispatch = (lotId: string, growerId: string, quantity: number, completedDate: string): Dispatch => ({
  id: `d-${lotId}-${completedDate}`, code: `DISP-${lotId}`, growerId, lotId, quantity, requestedAt: `${completedDate}T09:00:00`,
  completedDate, status: 'COMPLETED',
})
