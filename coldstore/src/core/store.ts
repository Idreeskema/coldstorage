// Central app state (zustand) + transactional actions that enforce the business rules.
// Components never touch seed arrays directly; they read via useStore()/useDerived() and
// mutate via the actions below, each of which returns a Result and records an Activity.
// To go to a real backend later, swap these actions for API calls behind the same signatures.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useMemo } from 'react'
import type {
  Activity, ActivityType, BoxType, EntityType, Grower, PayMethod, RateType, Result, Role, Session, Settings,
} from './types'
import { derive, type Data, type Derived } from './calc'
import { buildSeed } from './seed'
import { addMonths, nowIso, today } from './format'

const pad = (n: number, w: number) => String(n).padStart(w, '0')
const nextN = (list: { code: string }[]) =>
  list.reduce((m, x) => Math.max(m, parseInt(x.code.split('-').pop() ?? '0', 10)), 0) + 1
const fail = (error: string): Result => ({ ok: false, error })
const n = (x: number) => x.toLocaleString('en-IN')

export interface NewGrower {
  name: string; fatherName?: string; phone: string; village: string; district: string; address?: string
  orchard?: string; expectedProduction?: number; expectedStorage?: number
}
export interface NewRequest {
  growerId: string; requestedBoxes: number; expectedApples?: number; arrivalStart: string; arrivalEnd: string
  preferredStart?: string; durationMonths: number; variety: string; notes?: string
}
export interface NewIssue {
  allocationId: string; quantity: number; date: string; boxType: BoxType; issuedBy: string; vehicle?: string; notes?: string
}
export interface NewReceipt {
  allocationId: string; boxes: number; variety: string; grade: string; weightKg?: number; date: string
  vehicle?: string; driver?: string; chamberId: string; rackStart: number; notes?: string; override?: boolean
}
export interface NewPayment {
  growerId: string; amount: number; date: string; method: PayMethod; reference?: string; notes?: string
}

interface Actions {
  login: (role: Role, growerId?: string) => void
  logout: () => void
  resetDemo: () => void
  registerGrower: (g: NewGrower, status?: Grower['status']) => Result
  approveGrower: (id: string) => Result
  createRequest: (r: NewRequest) => Result
  /** Allocate `boxes` to a request (tops up if partially allocated). Rule 1: ≤ available capacity. */
  approveRequest: (requestId: string, boxes: number) => Result
  rejectRequest: (requestId: string, reason?: string) => Result
  /** Rule 2: cannot issue more than allocated. */
  issueBoxes: (i: NewIssue) => Result
  /** Rule 3: cannot receive more than issued unless override. Creates a Lot. */
  receiveApples: (r: NewReceipt) => Result
  requestDispatch: (growerId: string, lotId: string, quantity: number, notes?: string) => Result
  /** Rule 4: cannot dispatch more than the lot currently holds. Completes the dispatch + gate pass. */
  approveDispatch: (id: string, vehicle?: string) => Result
  rejectDispatch: (id: string) => Result
  recordPayment: (p: NewPayment) => Result
  updateSettings: (patch: Partial<Settings>, applyToExistingLots?: boolean) => Result
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (audience: 'MANAGER' | 'GROWER', growerId?: string) => void
}

export type AppState = Data & { session: Session | null } & Actions

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const snapshot = (): Data => get()
      const d = (): Derived => derive(snapshot())
      const userName = () => get().session?.userName ?? 'Store Manager'

      const log = (
        type: ActivityType, title: string, description: string, entityType: EntityType, entityId: string,
        growerId?: string, status: Activity['status'] = 'success', user?: string,
      ) =>
        set((s) => ({
          activities: [
            { id: `act-${Date.now()}-${s.activities.length}`, type, title, description, entityType, entityId, growerId, user: user ?? userName(), timestamp: nowIso(), status },
            ...s.activities,
          ],
        }))
      const notify = (audience: 'MANAGER' | 'GROWER', title: string, body: string, growerId?: string, link?: string) =>
        set((s) => ({
          notifications: [{ id: `nt-${Date.now()}-${s.notifications.length}`, audience, growerId, title, body, timestamp: nowIso(), read: false, link }, ...s.notifications],
        }))
      const growerName = (id: string) => get().growers.find((g) => g.id === id)?.name ?? 'Grower'

      return {
        ...buildSeed(),
        session: null,

        login: (role, growerId) =>
          set({
            session: {
              role, growerId,
              userName: role === 'GROWER' ? growerName(growerId ?? '') : role === 'MANAGER' ? 'Store Manager' : 'Store Staff',
            },
          }),
        logout: () => set({ session: null }),
        resetDemo: () => set({ ...buildSeed() }),

        registerGrower: (g, status = 'PENDING') => {
          if (!g.name.trim()) return fail('Name is required')
          if (!/^\+?[\d\s]{10,15}$/.test(g.phone.trim())) return fail('Enter a valid mobile number')
          const s = get()
          if (s.growers.some((x) => x.phone.replace(/\s/g, '') === g.phone.replace(/\s/g, ''))) return fail('A grower with this mobile number already exists')
          const num = nextN(s.growers)
          const grower: Grower = { id: `g${Date.now()}`, code: `GRW-2026-${pad(num, 4)}`, status, createdAt: nowIso(), ...g }
          set({ growers: [...s.growers, grower] })
          log('GROWER_REGISTERED', 'Grower registered', grower.name, 'grower', grower.id, grower.id, 'info', grower.name)
          notify('MANAGER', 'New grower registered', grower.name, grower.id, '/admin/growers')
          return { ok: true, id: grower.id }
        },
        approveGrower: (id) => {
          const g = get().growers.find((x) => x.id === id)
          if (!g) return fail('Grower not found')
          set((s) => ({ growers: s.growers.map((x) => (x.id === id ? { ...x, status: 'ACTIVE' } : x)) }))
          log('GROWER_APPROVED', 'Grower approved', g.name, 'grower', id, id)
          notify('GROWER', 'Profile approved', 'You can now request storage.', id)
          return { ok: true, id }
        },

        createRequest: (r) => {
          const s = get()
          if (!s.growers.some((g) => g.id === r.growerId)) return fail('Grower not found')
          if (!(r.requestedBoxes > 0)) return fail('Enter the number of boxes required')
          if (r.arrivalEnd < r.arrivalStart) return fail('Arrival end date is before the start date')
          const num = nextN(s.requests)
          const req = { id: `rq${Date.now()}`, code: `REQ-2026-${pad(num, 4)}`, allocatedBoxes: 0, status: 'PENDING' as const, createdAt: nowIso(), ...r }
          set({ requests: [...s.requests, req] })
          log('REQUEST_CREATED', `Storage request ${req.code}`, `${growerName(r.growerId)} requested ${n(r.requestedBoxes)} boxes`, 'request', req.id, r.growerId, 'info', growerName(r.growerId))
          notify('MANAGER', 'New storage request', `${growerName(r.growerId)} requested ${n(r.requestedBoxes)} boxes`, r.growerId, '/admin/requests')
          return { ok: true, id: req.id }
        },
        approveRequest: (requestId, boxes) => {
          const s = get()
          const rq = s.requests.find((r) => r.id === requestId)
          if (!rq) return fail('Request not found')
          if (rq.status === 'REJECTED' || rq.status === 'COMPLETED') return fail('This request is closed')
          if (!(boxes > 0)) return fail('Enter the boxes to allocate')
          const remainingAsk = rq.requestedBoxes - rq.allocatedBoxes
          if (boxes > remainingAsk) return fail(`Only ${n(remainingAsk)} boxes are still unallocated on this request`)
          const avail = d().store.available
          if (boxes > avail) return fail(`Cannot allocate ${n(boxes)} boxes — only ${n(avail)} boxes of capacity are available`)
          const total = rq.allocatedBoxes + boxes
          const status = total >= rq.requestedBoxes ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED'
          let allocId = rq.allocationId
          let allocCode = ''
          if (allocId) {
            const a = s.allocations.find((x) => x.id === allocId)!
            allocCode = a.code
            set({ allocations: s.allocations.map((x) => (x.id === allocId ? { ...x, boxes: x.boxes + boxes } : x)) })
          } else {
            allocId = `al${Date.now()}`
            allocCode = `ALLOC-2026-${pad(nextN(s.allocations), 4)}`
            set({
              allocations: [...s.allocations, { id: allocId, code: allocCode, requestId: rq.id, growerId: rq.growerId, boxes, durationMonths: rq.durationMonths, createdAt: nowIso() }],
            })
          }
          set((st) => ({
            requests: st.requests.map((r) => (r.id === requestId ? { ...r, allocatedBoxes: total, status, allocationId: allocId } : r)),
            growers: st.growers.map((g) => (g.id === rq.growerId && g.status === 'PENDING' ? { ...g, status: 'ACTIVE' } : g)),
          }))
          log('STORAGE_ALLOCATED', `${n(boxes)} boxes allocated`, `${allocCode} · ${growerName(rq.growerId)}`, 'allocation', allocId, rq.growerId)
          notify('GROWER', 'Storage request approved', `${n(boxes)} boxes allocated (${allocCode}).`, rq.growerId)
          return { ok: true, id: allocId }
        },
        rejectRequest: (requestId, reason) => {
          const rq = get().requests.find((r) => r.id === requestId)
          if (!rq) return fail('Request not found')
          if (rq.status !== 'PENDING') return fail('Only pending requests can be rejected')
          set((s) => ({ requests: s.requests.map((r) => (r.id === requestId ? { ...r, status: 'REJECTED', notes: reason ?? r.notes } : r)) }))
          log('REQUEST_REJECTED', `Request ${rq.code} rejected`, growerName(rq.growerId), 'request', requestId, rq.growerId, 'warning')
          notify('GROWER', 'Storage request declined', reason ?? 'Please contact the store.', rq.growerId)
          return { ok: true, id: requestId }
        },

        issueBoxes: (i) => {
          const s = get()
          const al = s.allocations.find((a) => a.id === i.allocationId)
          if (!al) return fail('Select an allocation')
          if (!(i.quantity > 0)) return fail('Enter the number of boxes')
          const st = d().allocStats.get(al.id)!
          if (i.quantity > st.remainingToIssue) return fail(`Cannot issue ${n(i.quantity)} boxes — only ${n(st.remainingToIssue)} remain to issue on ${al.code}`)
          const code = `BOX-ISSUE-2026-${pad(nextN(s.boxIssues), 5)}`
          const id = `bi${Date.now()}`
          set((x) => ({
            boxIssues: [...x.boxIssues, { id, code, growerId: al.growerId, ...i }],
            requests: x.requests.map((r) => (r.id === al.requestId && r.status !== 'COMPLETED' ? { ...r, status: 'ACTIVE' } : r)),
          }))
          log('BOX_ISSUED', `${n(i.quantity)} boxes issued`, `${code} · ${growerName(al.growerId)}`, 'boxIssue', id, al.growerId)
          notify('GROWER', 'Boxes issued', `${n(i.quantity)} empty boxes issued (${code}).`, al.growerId)
          return { ok: true, id }
        },

        receiveApples: (r) => {
          const s = get()
          const al = s.allocations.find((a) => a.id === r.allocationId)
          if (!al) return fail('Select an allocation')
          if (!(r.boxes > 0)) return fail('Enter the number of boxes received')
          const dv = d()
          const st = dv.allocStats.get(al.id)!
          if (r.boxes > st.awaitingReturn && !r.override)
            return fail(`Only ${n(st.awaitingReturn)} issued boxes are awaiting return. Receiving ${n(r.boxes)} exceeds issued boxes — manager override required.`)
          const ch = dv.store.chambers.find((c) => c.chamber.id === r.chamberId)
          if (!ch) return fail('Select a chamber')
          if (r.boxes > ch.available) return fail(`Chamber ${r.chamberId} has only ${n(ch.available)} boxes of space left`)
          const rid = `rc${Date.now()}`, lid = `lt${Date.now()}`
          const rcode = `RCPT-2026-${pad(nextN(s.receipts), 5)}`, lcode = `LOT-2026-${pad(nextN(s.lots), 4)}`
          set((x) => ({
            receipts: [...x.receipts, {
              id: rid, code: rcode, growerId: al.growerId, allocationId: al.id, lotId: lid, boxes: r.boxes, variety: r.variety,
              grade: r.grade, weightKg: r.weightKg, receivedDate: r.date, vehicle: r.vehicle, driver: r.driver,
              chamberId: r.chamberId, rackStart: r.rackStart, notes: r.notes, override: r.override || r.boxes > st.awaitingReturn,
            }],
            lots: [...x.lots, {
              id: lid, code: lcode, growerId: al.growerId, allocationId: al.id, receiptId: rid, boxesReceived: r.boxes,
              variety: r.variety, grade: r.grade, storageStartDate: r.date, expectedReleaseDate: addMonths(r.date, al.durationMonths),
              chamberId: r.chamberId, rackStart: r.rackStart, rateType: x.settings.rateType, rate: x.settings.rate,
            }],
            requests: x.requests.map((q) => (q.id === al.requestId && q.status !== 'COMPLETED' ? { ...q, status: 'ACTIVE' } : q)),
          }))
          log('APPLE_RECEIVED', `${n(r.boxes)} apple boxes received`, `Lot ${lcode} · ${growerName(al.growerId)} · ${r.chamberId}`, 'lot', lid, al.growerId)
          notify('GROWER', 'Apples received · storage started', `${n(r.boxes)} boxes stored as ${lcode} in ${r.chamberId}.`, al.growerId)
          notify('MANAGER', 'Apple shipment arrived', `${n(r.boxes)} boxes · ${growerName(al.growerId)}`, al.growerId, '/admin/inventory')
          return { ok: true, id: lid }
        },

        requestDispatch: (growerId, lotId, quantity, notes) => {
          const s = get()
          const lot = d().lotById.get(lotId)
          if (!lot) return fail('Select a lot')
          if (!(quantity > 0)) return fail('Enter the number of boxes')
          const free = lot.current - lot.pendingDispatch
          if (quantity > free) return fail(`Cannot request ${n(quantity)} boxes — ${lot.code} has only ${n(free)} boxes available for dispatch`)
          const code = `DISP-2026-${pad(nextN(s.dispatches), 4)}`
          const id = `ds${Date.now()}`
          set({ dispatches: [...s.dispatches, { id, code, growerId, lotId, quantity, requestedAt: nowIso(), status: 'PENDING', notes }] })
          log('DISPATCH_CREATED', 'Dispatch request created', `${growerName(growerId)} · ${n(quantity)} boxes`, 'dispatch', id, growerId, 'warning')
          notify('MANAGER', 'Dispatch request', `${growerName(growerId)} requested ${n(quantity)} boxes`, growerId, '/admin/dispatch')
          return { ok: true, id }
        },
        approveDispatch: (id, vehicle) => {
          const s = get()
          const ds = s.dispatches.find((x) => x.id === id)
          if (!ds) return fail('Dispatch not found')
          if (ds.status !== 'PENDING') return fail('This dispatch is already processed')
          const lot = d().lotById.get(ds.lotId)!
          if (ds.quantity > lot.current) return fail(`Cannot dispatch ${n(ds.quantity)} boxes — ${lot.code} has only ${n(lot.current)} in storage`)
          set((x) => ({ dispatches: x.dispatches.map((q) => (q.id === id ? { ...q, status: 'COMPLETED', completedDate: today(), vehicle: vehicle ?? q.vehicle } : q)) }))
          // close the request once the whole allocation has left the store
          const after = d()
          const al = get().allocations.find((a) => a.id === lot.allocationId)
          if (al && after.allocStats.get(al.id)?.status === 'Completed')
            set((x) => ({ requests: x.requests.map((r) => (r.id === al.requestId ? { ...r, status: 'COMPLETED' } : r)) }))
          log('DISPATCH_COMPLETED', `${n(ds.quantity)} boxes dispatched`, `${ds.code} · ${lot.code} · ${growerName(ds.growerId)}`, 'dispatch', id, ds.growerId)
          notify('GROWER', 'Dispatch approved', `${n(ds.quantity)} boxes from ${lot.code}. Gate pass ${ds.code}.`, ds.growerId)
          return { ok: true, id }
        },
        rejectDispatch: (id) => {
          const ds = get().dispatches.find((x) => x.id === id)
          if (!ds || ds.status !== 'PENDING') return fail('Dispatch not found or already processed')
          set((x) => ({ dispatches: x.dispatches.map((q) => (q.id === id ? { ...q, status: 'REJECTED' } : q)) }))
          log('DISPATCH_REJECTED', 'Dispatch rejected', `${ds.code} · ${growerName(ds.growerId)}`, 'dispatch', id, ds.growerId, 'warning')
          notify('GROWER', 'Dispatch declined', `Request ${ds.code} was declined.`, ds.growerId)
          return { ok: true, id }
        },

        recordPayment: (p) => {
          const s = get()
          if (!s.growers.some((g) => g.id === p.growerId)) return fail('Select a grower')
          if (!(p.amount > 0)) return fail('Enter a payment amount')
          const code = `PAY-2026-${pad(nextN(s.payments), 5)}`
          const id = `py${Date.now()}`
          set({ payments: [...s.payments, { id, code, ...p }] })
          log('PAYMENT_RECEIVED', 'Payment received', `₹${n(p.amount)} · ${growerName(p.growerId)}`, 'payment', id, p.growerId)
          notify('GROWER', 'Payment received', `₹${n(p.amount)} received (${code}).`, p.growerId)
          return { ok: true, id }
        },

        updateSettings: (patch, applyToExistingLots) => {
          if (patch.rate !== undefined && !(patch.rate >= 0)) return fail('Enter a valid rate')
          set((s) => {
            const settings = { ...s.settings, ...patch }
            const lots = applyToExistingLots ? s.lots.map((l) => ({ ...l, rateType: settings.rateType as RateType, rate: settings.rate })) : s.lots
            return { settings, lots }
          })
          if (patch.rate !== undefined || patch.rateType)
            log('RATE_CHANGED', 'Storage rate updated', `${get().settings.rate} per box (${get().settings.rateType.toLowerCase().replace('per_', 'per ')})${applyToExistingLots ? ' — applied to existing lots' : ''}`, 'settings', 'settings', undefined, 'info')
          return { ok: true }
        },

        markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((x) => (x.id === id ? { ...x, read: true } : x)) })),
        markAllNotificationsRead: (audience, growerId) =>
          set((s) => ({ notifications: s.notifications.map((x) => (x.audience === audience && (!growerId || x.growerId === growerId) ? { ...x, read: true } : x)) })),
      }
    },
    { name: 'coldstore-poc-v1', version: 1 },
  ),
)

/** Derived numbers (lots with charges, grower/allocation stats, store KPIs, chamber/rack occupancy). */
export function useDerived(): Derived {
  const s = useStore()
  return useMemo(
    () => derive(s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.growers, s.requests, s.allocations, s.boxIssues, s.receipts, s.lots, s.dispatches, s.payments, s.chambers, s.settings],
  )
}

export const useSession = () => useStore((s) => s.session)
