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
import { defaultLocations } from './types'
import { autoPlace, derive, type Data, type Derived } from './calc'
import { applyImport, type ImportMode, type ImportOptions, type ImportResult } from './importer'
import type { ImportPreview } from './excel'
// import { buildSeed } from './seed' // sample data disabled for now
import { buildEmpty } from './seed'
import { addMonths, nowIso, rateLabel, today } from './format'

const pad = (n: number, w: number) => String(n).padStart(w, '0')
const nextN = (list: { code: string }[]) =>
  list.reduce((m, x) => Math.max(m, parseInt(x.code.split('-').pop() ?? '0', 10)), 0) + 1
let idSeq = 0
/** Collision-free id: timestamp + monotonically increasing counter (two creates in one ms must differ). */
const uid = (prefix: string) => `${prefix}${Date.now()}-${idSeq++}`
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
  fromLocation?: string; driver?: string
}
export interface NewReceipt {
  allocationId: string; boxes: number; variety: string; grade: string; weightKg?: number; date: string
  vehicle?: string; driver?: string; notes?: string; override?: boolean
  /** Omit chamberId to auto-place into the emptiest chamber with room (fails if none has room). */
  chamberId?: string; rackStart?: number
  destination?: string; sourceLocation?: string; remark?: string
}
export interface NewPayment {
  growerId: string; amount: number; date: string; method: PayMethod; reference?: string; notes?: string
  allocationId?: string
}
export interface AllocationPatch { rateType?: RateType; rate?: number; remarks?: string; externalRef?: string }

interface Actions {
  login: (role: Role, growerId?: string) => void
  logout: () => void
  resetDemo: () => void
  registerGrower: (g: NewGrower, status?: Grower['status']) => Result
  approveGrower: (id: string) => Result
  createRequest: (r: NewRequest) => Result
  /** Allocate `boxes` to a request (tops up if partially allocated). Rule 1: â‰¤ available capacity. */
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
  /** `applyToExisting` also rewrites rateType/rate on every existing allocation and lot (settings rate is otherwise only the default for NEW allocations). */
  updateSettings: (patch: Partial<Settings>, applyToExisting?: boolean) => Result
  /** Change an agreement's rate/terms. `applyToLots` (default true) re-prices the allocation's existing lots too. */
  updateAllocation: (allocationId: string, patch: AllocationPatch, applyToLots?: boolean) => Result
  /** Place a lot in a chamber/rack. Omit chamberId to auto-place in the emptiest chamber with room. */
  assignLotChamber: (lotId: string, chamberId?: string, rackStart?: number) => Result
  /** Import a parsed Excel preview. 'replace' wipes growers/requests/allocations/issues/receipts/lots/dispatches/payments/activities/notifications (keeps chambers + settings); 'merge' adds new rows and updates the rate of known Transaction IDs. */
  importTrade: (preview: ImportPreview, mode: ImportMode, opts?: ImportOptions) => ImportResult
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: (audience: 'MANAGER' | 'GROWER', growerId?: string) => void
}

export type AppState = Data & { session: Session | null } & Actions

/**
 * v1 -> v2: allocations own their rate (copied from settings), settings gain `locations`,
 * payments/receipts/issues gain optional fields (nothing to fill). Defensive against partial/corrupt state.
 */
export function migrateState(persisted: unknown): Record<string, unknown> {
  const s = (persisted && typeof persisted === 'object' ? persisted : {}) as Record<string, unknown>
  const settings = { ...(s.settings as Settings | undefined) } as Settings
  if (!settings.rateType) settings.rateType = 'PER_MONTH'
  if (typeof settings.rate !== 'number') settings.rate = 28
  const loc = settings.locations
  settings.locations = {
    pickupPoints: Array.isArray(loc?.pickupPoints) ? loc.pickupPoints : defaultLocations().pickupPoints,
    sites: Array.isArray(loc?.sites) ? loc.sites : defaultLocations().sites,
  }
  const lots = Array.isArray(s.lots) ? (s.lots as { allocationId: string; rateType: RateType; rate: number }[]) : []
  const allocations = (Array.isArray(s.allocations) ? (s.allocations as Record<string, unknown>[]) : []).map((a) => {
    if (a.rateType && typeof a.rate === 'number') return a
    // prefer the rate its lots were already charged at, else the settings default
    const lot = lots.find((l) => l.allocationId === a.id)
    return { ...a, rateType: lot?.rateType ?? settings.rateType, rate: lot?.rate ?? settings.rate }
  })
  return { ...s, settings, allocations }
}

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
            { id: uid('act-'), type, title, description, entityType, entityId, growerId, user: user ?? userName(), timestamp: nowIso(), status },
            ...s.activities,
          ],
        }))
      const notify = (audience: 'MANAGER' | 'GROWER', title: string, body: string, growerId?: string, link?: string) =>
        set((s) => ({
          notifications: [{ id: uid('nt-'), audience, growerId, title, body, timestamp: nowIso(), read: false, link }, ...s.notifications],
        }))
      const growerName = (id: string) => get().growers.find((g) => g.id === id)?.name ?? 'Grower'

      return {
        // ...buildSeed(), // sample data disabled for now
        ...buildEmpty(),
        session: null,

        login: (role, growerId) =>
          set({
            session: {
              role, growerId,
              userName: role === 'GROWER' ? growerName(growerId ?? '') : role === 'MANAGER' ? 'Store Manager' : 'Store Staff',
            },
          }),
        logout: () => set({ session: null }),
        // resetDemo: () => set({ ...buildSeed() }),
        resetDemo: () => set({ ...buildEmpty() }),

        registerGrower: (g, status = 'PENDING') => {
          if (!g.name.trim()) return fail('Name is required')
          if (!/^\+?[\d\s]{10,15}$/.test(g.phone.trim())) return fail('Enter a valid mobile number')
          const s = get()
          if (s.growers.some((x) => x.phone.replace(/\s/g, '') === g.phone.replace(/\s/g, ''))) return fail('A grower with this mobile number already exists')
          const num = nextN(s.growers)
          const grower: Grower = { id: uid('g'), code: `GRW-2026-${pad(num, 4)}`, status, createdAt: nowIso(), ...g }
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
          const req = { id: uid('rq'), code: `REQ-2026-${pad(num, 4)}`, allocatedBoxes: 0, status: 'PENDING' as const, createdAt: nowIso(), ...r }
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
          if (boxes > avail) return fail(`Cannot allocate ${n(boxes)} boxes â€” only ${n(avail)} boxes of capacity are available`)
          const total = rq.allocatedBoxes + boxes
          const status = total >= rq.requestedBoxes ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED'
          let allocId = rq.allocationId
          let allocCode = ''
          if (allocId) {
            const a = s.allocations.find((x) => x.id === allocId)!
            allocCode = a.code
            set({ allocations: s.allocations.map((x) => (x.id === allocId ? { ...x, boxes: x.boxes + boxes } : x)) })
          } else {
            allocId = uid('al')
            allocCode = `ALLOC-2026-${pad(nextN(s.allocations), 4)}`
            set({
              allocations: [...s.allocations, { id: allocId, code: allocCode, requestId: rq.id, growerId: rq.growerId, boxes, durationMonths: rq.durationMonths, createdAt: nowIso(), rateType: s.settings.rateType, rate: s.settings.rate }],
            })
          }
          set((st) => ({
            requests: st.requests.map((r) => (r.id === requestId ? { ...r, allocatedBoxes: total, status, allocationId: allocId } : r)),
            growers: st.growers.map((g) => (g.id === rq.growerId && g.status === 'PENDING' ? { ...g, status: 'ACTIVE' } : g)),
          }))
          log('STORAGE_ALLOCATED', `${n(boxes)} boxes allocated`, `${allocCode} Â· ${growerName(rq.growerId)}`, 'allocation', allocId, rq.growerId)
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
          if (i.quantity > st.remainingToIssue) return fail(`Cannot issue ${n(i.quantity)} boxes â€” only ${n(st.remainingToIssue)} remain to issue on ${al.code}`)
          const code = `BOX-ISSUE-2026-${pad(nextN(s.boxIssues), 5)}`
          const id = uid('bi')
          set((x) => ({
            boxIssues: [...x.boxIssues, { id, code, growerId: al.growerId, ...i }],
            requests: x.requests.map((r) => (r.id === al.requestId && r.status !== 'COMPLETED' ? { ...r, status: 'ACTIVE' } : r)),
          }))
          log('BOX_ISSUED', `${n(i.quantity)} boxes issued`, `${code} Â· ${growerName(al.growerId)}`, 'boxIssue', id, al.growerId)
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
            return fail(`Only ${n(st.awaitingReturn)} issued boxes are awaiting return. Receiving ${n(r.boxes)} exceeds issued boxes â€” manager override required.`)
          let chamberId = r.chamberId ?? ''
          let rackStart = r.rackStart ?? 1
          if (!chamberId) {
            const pl = autoPlace(dv, r.boxes)
            if (!pl) return fail(`No chamber has room for ${n(r.boxes)} boxes`)
            chamberId = pl.chamberId; rackStart = pl.rackStart
          } else {
            const ch = dv.store.chambers.find((c) => c.chamber.id === chamberId)
            if (!ch) return fail('Select a chamber')
            if (r.boxes > ch.available) return fail(`Chamber ${chamberId} has only ${n(ch.available)} boxes of space left`)
          }
          const rid = uid('rc'), lid = uid('lt')
          const rcode = `RCPT-2026-${pad(nextN(s.receipts), 5)}`, lcode = `LOT-2026-${pad(nextN(s.lots), 4)}`
          set((x) => ({
            receipts: [...x.receipts, {
              id: rid, code: rcode, growerId: al.growerId, allocationId: al.id, lotId: lid, boxes: r.boxes, variety: r.variety,
              grade: r.grade, weightKg: r.weightKg, receivedDate: r.date, vehicle: r.vehicle, driver: r.driver,
              chamberId, rackStart, notes: r.notes, override: r.override || r.boxes > st.awaitingReturn,
              destination: r.destination, sourceLocation: r.sourceLocation, remark: r.remark,
            }],
            lots: [...x.lots, {
              id: lid, code: lcode, growerId: al.growerId, allocationId: al.id, receiptId: rid, boxesReceived: r.boxes,
              variety: r.variety, grade: r.grade, storageStartDate: r.date, expectedReleaseDate: addMonths(r.date, al.durationMonths),
              chamberId, rackStart, rateType: al.rateType, rate: al.rate,
            }],
            requests: x.requests.map((q) => (q.id === al.requestId && q.status !== 'COMPLETED' ? { ...q, status: 'ACTIVE' } : q)),
          }))
          log('APPLE_RECEIVED', `${n(r.boxes)} apple boxes received`, `Lot ${lcode} Â· ${growerName(al.growerId)} Â· ${chamberId || 'unassigned'}`, 'lot', lid, al.growerId)
          notify('GROWER', 'Apples received Â· storage started', `${n(r.boxes)} boxes stored as ${lcode} in ${chamberId}.`, al.growerId)
          notify('MANAGER', 'Apple shipment arrived', `${n(r.boxes)} boxes Â· ${growerName(al.growerId)}`, al.growerId, '/admin/inventory')
          return { ok: true, id: lid }
        },

        requestDispatch: (growerId, lotId, quantity, notes) => {
          const s = get()
          const lot = d().lotById.get(lotId)
          if (!lot) return fail('Select a lot')
          if (!(quantity > 0)) return fail('Enter the number of boxes')
          const free = lot.current - lot.pendingDispatch
          if (quantity > free) return fail(`Cannot request ${n(quantity)} boxes â€” ${lot.code} has only ${n(free)} boxes available for dispatch`)
          const code = `DISP-2026-${pad(nextN(s.dispatches), 4)}`
          const id = uid('ds')
          set({ dispatches: [...s.dispatches, { id, code, growerId, lotId, quantity, requestedAt: nowIso(), status: 'PENDING', notes }] })
          log('DISPATCH_CREATED', 'Dispatch request created', `${growerName(growerId)} Â· ${n(quantity)} boxes`, 'dispatch', id, growerId, 'warning')
          notify('MANAGER', 'Dispatch request', `${growerName(growerId)} requested ${n(quantity)} boxes`, growerId, '/admin/dispatch')
          return { ok: true, id }
        },
        approveDispatch: (id, vehicle) => {
          const s = get()
          const ds = s.dispatches.find((x) => x.id === id)
          if (!ds) return fail('Dispatch not found')
          if (ds.status !== 'PENDING') return fail('This dispatch is already processed')
          const lot = d().lotById.get(ds.lotId)!
          if (ds.quantity > lot.current) return fail(`Cannot dispatch ${n(ds.quantity)} boxes â€” ${lot.code} has only ${n(lot.current)} in storage`)
          set((x) => ({ dispatches: x.dispatches.map((q) => (q.id === id ? { ...q, status: 'COMPLETED', completedDate: today(), vehicle: vehicle ?? q.vehicle } : q)) }))
          // close the request once the whole allocation has left the store
          const after = d()
          const al = get().allocations.find((a) => a.id === lot.allocationId)
          if (al && after.allocStats.get(al.id)?.status === 'Completed')
            set((x) => ({ requests: x.requests.map((r) => (r.id === al.requestId ? { ...r, status: 'COMPLETED' } : r)) }))
          log('DISPATCH_COMPLETED', `${n(ds.quantity)} boxes dispatched`, `${ds.code} Â· ${lot.code} Â· ${growerName(ds.growerId)}`, 'dispatch', id, ds.growerId)
          notify('GROWER', 'Dispatch approved', `${n(ds.quantity)} boxes from ${lot.code}. Gate pass ${ds.code}.`, ds.growerId)
          return { ok: true, id }
        },
        rejectDispatch: (id) => {
          const ds = get().dispatches.find((x) => x.id === id)
          if (!ds || ds.status !== 'PENDING') return fail('Dispatch not found or already processed')
          set((x) => ({ dispatches: x.dispatches.map((q) => (q.id === id ? { ...q, status: 'REJECTED' } : q)) }))
          log('DISPATCH_REJECTED', 'Dispatch rejected', `${ds.code} Â· ${growerName(ds.growerId)}`, 'dispatch', id, ds.growerId, 'warning')
          notify('GROWER', 'Dispatch declined', `Request ${ds.code} was declined.`, ds.growerId)
          return { ok: true, id }
        },

        recordPayment: (p) => {
          const s = get()
          if (!s.growers.some((g) => g.id === p.growerId)) return fail('Select a grower')
          if (!(p.amount > 0)) return fail('Enter a payment amount')
          if (p.allocationId && !s.allocations.some((a) => a.id === p.allocationId && a.growerId === p.growerId)) return fail('That agreement does not belong to this grower')
          const code = `PAY-2026-${pad(nextN(s.payments), 5)}`
          const id = uid('py')
          set({ payments: [...s.payments, { id, code, ...p }] })
          log('PAYMENT_RECEIVED', 'Payment received', `â‚¹${n(p.amount)} Â· ${growerName(p.growerId)}`, 'payment', id, p.growerId)
          notify('GROWER', 'Payment received', `â‚¹${n(p.amount)} received (${code}).`, p.growerId)
          return { ok: true, id }
        },

        updateSettings: (patch, applyToExisting) => {
          if (patch.rate !== undefined && !(patch.rate >= 0)) return fail('Enter a valid rate')
          set((s) => {
            const settings = { ...s.settings, ...patch }
            if (patch.locations) settings.locations = {
              pickupPoints: [...new Set(patch.locations.pickupPoints.map((x) => x.trim()).filter(Boolean))],
              sites: [...new Set(patch.locations.sites.map((x) => x.trim()).filter(Boolean))],
            }
            if (!applyToExisting) return { settings }
            return {
              settings,
              lots: s.lots.map((l) => ({ ...l, rateType: settings.rateType as RateType, rate: settings.rate })),
              allocations: s.allocations.map((a) => ({ ...a, rateType: settings.rateType as RateType, rate: settings.rate })),
            }
          })
          if (patch.rate !== undefined || patch.rateType)
            log('RATE_CHANGED', 'Default rate updated', `${rateLabel(get().settings.rateType, get().settings.rate)}${applyToExisting ? ' â€” applied to all existing agreements and lots' : ' â€” applies to new agreements'}`, 'settings', 'settings', undefined, 'info')
          return { ok: true }
        },
        updateAllocation: (allocationId, patch, applyToLots = true) => {
          const s = get()
          const al = s.allocations.find((a) => a.id === allocationId)
          if (!al) return fail('Agreement not found')
          if (patch.rate !== undefined && !(patch.rate >= 0)) return fail('Enter a valid rate')
          if (patch.externalRef && s.allocations.some((a) => a.id !== al.id && a.externalRef === patch.externalRef)) return fail('Another agreement already uses this Transaction ID')
          const next = { ...al, ...patch }
          set((x) => ({
            allocations: x.allocations.map((a) => (a.id === al.id ? next : a)),
            lots: applyToLots ? x.lots.map((l) => (l.allocationId === al.id ? { ...l, rateType: next.rateType, rate: next.rate } : l)) : x.lots,
          }))
          if (patch.rate !== undefined || patch.rateType)
            log('RATE_CHANGED', `Rate updated Â· ${al.code}`, `${rateLabel(next.rateType, next.rate)}${applyToLots ? ' â€” existing lots re-priced' : ''} Â· ${growerName(al.growerId)}`, 'allocation', al.id, al.growerId, 'info')
          return { ok: true, id: al.id }
        },

        assignLotChamber: (lotId, chamberId, rackStart) => {
          const dv = d()
          const lot = dv.lotById.get(lotId)
          if (!lot) return fail('Lot not found')
          if (lot.current <= 0) return fail('This lot is empty')
          let target: { chamberId: string; rackStart: number } | null
          if (!chamberId) {
            // exclude this lot's own boxes so re-placing a lot never double counts
            target = autoPlace(dv, lot.current)
            if (!target) return fail(`No chamber has room for ${n(lot.current)} boxes`)
          } else {
            const ch = dv.store.chambers.find((c) => c.chamber.id === chamberId)
            if (!ch) return fail('Select a valid chamber')
            const room = ch.available + (lot.chamberId === chamberId ? lot.current : 0)
            if (lot.current > room) return fail(`Chamber ${chamberId} has only ${n(room)} boxes of space left`)
            const rack = Math.min(ch.chamber.racks, Math.max(1, rackStart ?? 1))
            target = { chamberId, rackStart: rack }
          }
          set((x) => ({
            lots: x.lots.map((l) => (l.id === lotId ? { ...l, ...target! } : l)),
            receipts: x.receipts.map((r) => (r.id === lot.receiptId ? { ...r, ...target! } : r)),
          }))
          log('CHAMBER_ASSIGNED', `${lot.code} placed in ${target.chamberId}`, `${n(lot.current)} boxes Â· ${growerName(lot.growerId)}`, 'lot', lotId, lot.growerId, 'info')
          return { ok: true, id: lotId }
        },

        importTrade: (preview, mode, opts) => {
          if (!preview.canImport) return fail('This workbook has blocking errors â€” nothing was imported')
          const { data, summary } = applyImport(get(), preview, mode, { user: userName(), ...opts })
          set({
            growers: data.growers, requests: data.requests, allocations: data.allocations, boxIssues: data.boxIssues,
            receipts: data.receipts, lots: data.lots, dispatches: data.dispatches, payments: data.payments,
            activities: data.activities, notifications: data.notifications,
          })
          return { ok: true, summary }
        },

        markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((x) => (x.id === id ? { ...x, read: true } : x)) })),
        markAllNotificationsRead: (audience, growerId) =>
          set((s) => ({ notifications: s.notifications.map((x) => (x.audience === audience && (!growerId || x.growerId === growerId) ? { ...x, read: true } : x)) })),
      }
    },
    {
      name: 'coldstore-poc-v2-empty',
      version: 2,
      migrate: (persisted, _version) => migrateState(persisted) as unknown as AppState,
    },
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
