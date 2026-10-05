import { useMemo } from 'react'
import { useStore, useDerived } from '../../core/store'
import type { Allocation, AppleReceipt, BoxIssue, Dispatch, Payment } from '../../core/types'
import type { GrowerStats, LotView } from '../../core/calc'
import { fmtDate, inr, num } from '../../core/format'
import type { DocSpec } from '../../ui'
import './grower-app.css'

const EMPTY: GrowerStats = {
  growerId: '', allocated: 0, issued: 0, received: 0, dispatched: 0, stored: 0, awaitingReturn: 0,
  charges: 0, paid: 0, due: 0, lots: 0, activeLots: 0,
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

export function receiptDoc(r: AppleReceipt, lot?: LotView, growerName = ''): DocSpec {
  return {
    title: 'Apple Receipt', code: r.code, date: fmtDate(r.receivedDate),
    rows: [
      ['Grower', growerName], ['Lot', lot?.code ?? '—'], ['Boxes received', num(r.boxes)],
      ['Variety / grade', `${r.variety} · ${r.grade}`], ['Chamber', `${r.chamberId} · ${lot?.rackLabel ?? ''}`],
      ['Vehicle', r.vehicle ?? '—'],
    ],
  }
}

export function boxIssueDoc(b: BoxIssue, alloc: Allocation | undefined, growerName: string): DocSpec {
  return {
    title: 'Box Issue Receipt', code: b.code, date: fmtDate(b.date),
    rows: [
      ['Grower', growerName], ['Allocation', alloc?.code ?? '—'], ['Boxes issued', num(b.quantity)],
      ['Box type', b.boxType], ['Issued by', b.issuedBy],
    ],
  }
}

export function gatePassDoc(d: Dispatch, lot: LotView | undefined, growerName: string): DocSpec {
  return {
    title: 'Gate Pass', code: d.code, date: fmtDate(d.completedDate),
    rows: [
      ['Grower', growerName], ['Lot', lot?.code ?? '—'], ['Boxes released', num(d.quantity)],
      ['Vehicle', d.vehicle ?? '—'], ['Chamber', lot?.chamberId ?? '—'],
    ],
  }
}

export function paymentDoc(p: Payment, growerName: string): DocSpec {
  return {
    title: 'Payment Receipt', code: p.code, date: fmtDate(p.date),
    rows: [
      ['Received from', growerName], ['Amount', inr(p.amount)], ['Method', p.method],
      ['Reference', p.reference ?? '—'],
    ],
  }
}
