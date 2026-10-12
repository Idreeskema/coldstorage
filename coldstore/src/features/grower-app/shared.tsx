import { useMemo } from 'react'
import { useStore, useDerived } from '../../core/store'
import type { Allocation, AppleReceipt, BoxIssue, Dispatch, Payment } from '../../core/types'
import type { GrowerStats, LotView } from '../../core/calc'
import { fmtDate, inr, num, rateLabel } from '../../core/format'
import type { DocSpec } from '../../ui'
import './grower-app.css'

const EMPTY: GrowerStats = {
  growerId: '', allocated: 0, issued: 0, received: 0, dispatched: 0, stored: 0, awaitingReturn: 0,
  charges: 0, paid: 0, due: 0, credit: 0, lots: 0, activeLots: 0,
}

/** Everything the logged-in grower needs, derived once. */
export function useMe() {
  const session = useStore((s) => s.session)
  const gid = session?.growerId ?? ''
  const growers = useStore((s) => s.growers)
  const allocations = useStore((s) => s.allocations)
  const dv = useDerived()
  const grower = growers.find((g) => g.id === gid)
  const stats = dv.growerStats.get(gid) ?? EMPTY
  const lots = useMemo(() => dv.lots.filter((l) => l.growerId === gid), [dv.lots, gid])
  const myAllocations = useMemo(() => allocations.filter((a) => a.growerId === gid), [allocations, gid])
  return { gid, grower, stats, lots, allocations: myAllocations, dv, active: grower?.status === 'ACTIVE' }
}

export const stayLabel = (l: LotView) => (l.current === 0 ? `Stored ${l.days} days (closed)` : `Stored ${num(l.days)} days`)

/** Signed balance split: owes money (`due`) or holds an advance (`credit`). */
export function balanceOf(s: GrowerStats) {
  const credit = s.credit ?? Math.max(0, -s.due)
  return { due: Math.max(0, Math.round(s.due)), credit: Math.round(credit), isCredit: credit > 1 }
}

/** Extra rows for movement details; only rows with a value are shown. */
const opt = (label: string, v?: string): [string, string][] => (v ? [[label, v]] : [])

export const movementLine = (parts: (string | undefined)[]) => parts.filter(Boolean).join(' \u00b7 ')

export function receiptDoc(r: AppleReceipt, lot?: LotView, growerName = ''): DocSpec {
  return {
    title: 'Apple Receipt', code: r.code, date: fmtDate(r.receivedDate),
    rows: [
      ['Grower', growerName], ['Lot', lot?.code ?? '-'], ['Crates received', num(r.boxes)],
      ['Variety / grade', `${r.variety} \u00b7 ${r.grade}`], ['Chamber', r.chamberId ? `${r.chamberId} \u00b7 ${lot?.rackLabel ?? ''}` : 'Not yet placed'],
      ...(lot ? [['Rate', rateLabel(lot.rateType, lot.rate)] as [string, string]] : []),
      ...opt('Picked up from', r.sourceLocation), ...opt('Received at', r.destination),
      ...opt('Driver', r.driver), ...opt('Vehicle', r.vehicle), ...opt('Remark', r.remark),
    ],
  }
}

export function boxIssueDoc(b: BoxIssue, alloc: Allocation | undefined, growerName: string): DocSpec {
  return {
    title: 'Crate Issue Receipt', code: b.code, date: fmtDate(b.date),
    rows: [
      ['Grower', growerName], ['Agreement', alloc?.code ?? '-'], ['Crates issued', num(b.quantity)],
      ['Crate type', b.boxType], ['Issued by', b.issuedBy],
      ...opt('Pickup location', b.fromLocation), ...opt('Driver', b.driver), ...opt('Vehicle', b.vehicle),
    ],
  }
}

export function gatePassDoc(d: Dispatch, lot: LotView | undefined, growerName: string): DocSpec {
  return {
    title: 'Gate Pass', code: d.code, date: fmtDate(d.completedDate),
    rows: [
      ['Grower', growerName], ['Lot', lot?.code ?? '-'], ['Crates released', num(d.quantity)],
      ['Vehicle', d.vehicle ?? '-'], ['Chamber', lot?.chamberId || '-'],
    ],
  }
}

export function paymentDoc(p: Payment, growerName: string): DocSpec {
  return {
    title: 'Payment Receipt', code: p.code, date: fmtDate(p.date),
    rows: [
      ['Received from', growerName], ['Amount', inr(p.amount)], ['Method', p.method],
      ['Reference', p.reference ?? '-'],
    ],
  }
}