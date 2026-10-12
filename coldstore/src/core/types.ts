// Domain model. Dates are 'YYYY-MM-DD'; timestamps are full ISO strings.

export type Role = 'MANAGER' | 'STAFF' | 'GROWER'

export interface Session {
  role: Role
  growerId?: string // set when role === 'GROWER'
  userName: string
}

export type GrowerStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE'
export interface Grower {
  id: string
  code: string // GRW-2026-0012
  name: string
  fatherName?: string
  phone: string
  village: string
  district: string
  address?: string
  orchard?: string
  expectedProduction?: number // boxes
  expectedStorage?: number // boxes
  status: GrowerStatus
  createdAt: string
}

export type RequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PARTIALLY_ALLOCATED'
  | 'FULLY_ALLOCATED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'REJECTED'

export interface StorageRequest {
  id: string
  code: string // REQ-2026-0001
  growerId: string
  requestedBoxes: number
  allocatedBoxes: number
  expectedApples?: number
  arrivalStart: string
  arrivalEnd: string
  preferredStart?: string
  durationMonths: number
  variety: string
  notes?: string
  status: RequestStatus
  allocationId?: string
  createdAt: string
}

export interface Allocation {
  id: string
  code: string // ALLOC-2026-0034
  requestId: string
  growerId: string
  boxes: number // agreement quantity (crates/boxes)
  durationMonths: number
  createdAt: string
  /** Billing terms live on the allocation (= one agreement / Excel Transaction ID); new lots inherit them. */
  rateType: RateType
  rate: number // ₹ per crate (PER_CRATE) / per box per day|month|season
  remarks?: string
  externalRef?: string // Transaction ID from the customer's Excel workbook
}

export type BoxType = 'Wooden' | 'Carton'
export interface BoxIssue {
  id: string
  code: string // BOX-ISSUE-2026-00123
  growerId: string
  allocationId: string
  quantity: number
  date: string
  boxType: BoxType
  issuedBy: string
  vehicle?: string
  fromLocation?: string // pickup point / where the crates were handed out from (e.g. Al Rehman)
  driver?: string
  notes?: string
}

export interface AppleReceipt {
  id: string
  code: string // RCPT-2026-00042
  growerId: string
  allocationId: string
  lotId: string
  boxes: number
  variety: string
  grade: string
  weightKg?: number
  receivedDate: string
  vehicle?: string
  driver?: string
  chamberId: string // '' = not placed in any chamber yet (unassigned)
  rackStart: number
  notes?: string
  destination?: string // storage site received at (e.g. Al Meazan)
  sourceLocation?: string // pickup point the crates came from
  remark?: string // variety / weight notes from the movement sheet
  override?: boolean // received more than issued (manager override)
}

/** PER_CRATE = flat charge of crates received × rate (no time component; dispatches do not reduce it). */
export type RateType = 'PER_DAY' | 'PER_MONTH' | 'PER_SEASON' | 'PER_CRATE'
export interface Lot {
  id: string
  code: string // LOT-2026-0042
  growerId: string
  allocationId: string
  receiptId: string
  boxesReceived: number
  variety: string
  grade: string
  storageStartDate: string
  expectedReleaseDate: string
  chamberId: string // '' = unassigned
  rackStart: number // first rack; boxes overflow into following racks
  rateType: RateType
  rate: number // ₹ per box per day/month, or per box per season
}

export type DispatchStatus = 'PENDING' | 'COMPLETED' | 'REJECTED'
export interface Dispatch {
  id: string
  code: string // DISP-2026-0034 (also the gate-pass code)
  growerId: string
  lotId: string
  quantity: number
  requestedAt: string // ISO timestamp
  completedDate?: string // 'YYYY-MM-DD'
  status: DispatchStatus
  vehicle?: string
  notes?: string
}

export type PayMethod = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER'
export interface Payment {
  id: string
  code: string // PAY-2026-00012
  growerId: string
  allocationId?: string // which agreement the payment belongs to (optional)
  amount: number
  date: string
  method: PayMethod
  reference?: string
  notes?: string
}

export interface Chamber {
  id: string // 'C-03'
  capacity: number
  racks: number // number of racks, equal capacity each
  tempC: number
}

export type ActivityType =
  | 'GROWER_REGISTERED'
  | 'GROWER_APPROVED'
  | 'REQUEST_CREATED'
  | 'STORAGE_ALLOCATED'
  | 'REQUEST_REJECTED'
  | 'BOX_ISSUED'
  | 'APPLE_RECEIVED'
  | 'PAYMENT_RECEIVED'
  | 'DISPATCH_CREATED'
  | 'DISPATCH_COMPLETED'
  | 'DISPATCH_REJECTED'
  | 'RATE_CHANGED'
  | 'CHAMBER_ASSIGNED'
  | 'DATA_IMPORTED'

export type EntityType =
  | 'grower'
  | 'request'
  | 'allocation'
  | 'boxIssue'
  | 'receipt'
  | 'lot'
  | 'dispatch'
  | 'payment'
  | 'settings'
  | 'import'

export interface Activity {
  id: string
  type: ActivityType
  title: string
  description: string
  entityType: EntityType
  entityId: string
  growerId?: string
  user: string
  timestamp: string
  status?: 'success' | 'info' | 'warning'
  metadata?: Record<string, string | number>
}

export interface Notification {
  id: string
  audience: 'MANAGER' | 'GROWER'
  growerId?: string
  title: string
  body: string
  timestamp: string
  read: boolean
  link?: string // app route
}

export interface Locations {
  pickupPoints: string[] // where crates are handed out / picked up
  sites: string[] // storage sites crates are received at
}

export const defaultLocations = (): Locations => ({
  pickupPoints: ['Al Rehman', 'Imam Sahib', 'Mashwara', 'Sumbal', 'Dal Wan', 'Own Return'],
  sites: ['Al Meazan', 'Kongposh', 'Kashmir Fresh CA Storage'],
})

export interface Settings {
  storeName: string
  season: string
  capacity: number
  rateType: RateType // default for NEW allocations (each allocation owns its own rate afterwards)
  rate: number
  currency: string
  locations: Locations
}

export interface Result {
  ok: boolean
  error?: string
  id?: string
}
