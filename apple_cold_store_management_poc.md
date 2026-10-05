# 🍎 Cold Store Management POC — Product & Frontend Build Specification

## 1. Product Vision

Build a web + mobile-ready cold-store management application for apple growers and cold-store operators.

The core problem:

> A cold-store owner has a fixed storage capacity and many growers. A grower may first request/receive empty boxes and later return those boxes filled with apples for storage. The boxes can arrive over multiple days. The cold-store operator needs complete visibility of allocated boxes, received apples, stored inventory, storage duration, charges, payments, remaining balances, and eventual dispatch.

### Example

Cold store capacity: **100,000 boxes**

Grower: **Abdul Rashid**

Requested: **10,000 boxes**

| Date | Activity | Boxes |
|---|---|---:|
| Oct 2 | Boxes issued | 5,000 |
| Oct 3 | Boxes issued | 4,000 |
| Oct 4 | Boxes issued | 1,000 |
| Oct 5 | Apples received | 5,000 |
| Oct 6 | Apples received | 4,000 |
| Oct 7 | Apples received | 1,000 |

The system should understand that this is **one grower relationship / storage contract**, with multiple transactions.

It should show:

- 10,000 boxes allocated
- 10,000 boxes issued
- 10,000 boxes received with apples
- 10,000 boxes currently in storage
- storage start date
- current storage duration
- rate per box
- accrued storage charges
- payments received
- outstanding amount
- later partial dispatches
- remaining stock

---

# 2. Research-Informed Product Direction

Research into existing cold-storage software shows that the common operational model includes:

- party/grower management
- inward and outward stock
- lot numbers
- chamber/location allocation
- storage charges/rent
- gate passes
- payments and party ledgers
- dashboards and reports
- role-based access
- mobile workflows
- sometimes offline operation

Existing Indian cold-storage products also emphasize lot-level tracking, chamber/rack allocation, rent calculation, outward/gate-pass workflows and party ledgers.

For Kashmir/J&K specifically, CA storage is an important part of the apple supply chain, and current industry software references grower-wise lots, box counts, storage duration and seasonal storage.

Sources researched:

- MandiGrow cold-storage / apple workflow: https://www.mandigrow.com/mandi-software
- ColdStoreApp: https://coldstoreapp.com/
- Cold Konnect: https://apps.apple.com/in/app/cold-konnect/id6477293486
- J&K Government CA-storage records: https://singlewindow.jk.gov.in/
- NITI Aayog Kashmir horticulture/CA-storage context: https://www.niti.gov.in/

**Important:** These sources are used for product discovery, not for copying another product. The POC should focus on a simpler, grower-first workflow.

---

# 3. POC Goal

Do NOT build the complete ERP initially.

Build a highly polished frontend POC that demonstrates the complete business journey using mock data.

The POC must answer one question:

> "Can a cold-store owner understand exactly what is happening to every box, every grower, every stored lot and every rupee from one dashboard?"

The frontend should feel like a real production SaaS product, not a generic admin template.

---

# 4. User Roles

## A. Cold Store Owner / Manager

Main user.

Can:

- see capacity
- register growers
- approve storage requests
- allocate boxes
- record box issue
- record apple receipt
- create storage lots
- assign chamber/location
- monitor inventory
- calculate charges
- record payments
- dispatch apples
- view grower ledger
- view reports

## B. Store Staff

Operational user.

Can:

- issue boxes
- receive apple boxes
- record inward entries
- assign locations
- create dispatch/gate entries
- record operational information

Permissions should be configurable.

## C. Grower

Mobile-first experience.

Can:

- register
- complete profile
- request storage
- see allocation
- see boxes issued
- see apples received
- see stored quantity
- see storage duration
- see charges
- see payments
- see outstanding balance
- request dispatch
- view receipts
- download/share documents

---

# 5. Main Navigation

## Cold Store Admin

Sidebar:

1. Dashboard
2. Growers
3. Storage Requests
4. Box Management
5. Apple Receipts / Inward
6. Storage Inventory
7. Dispatch / Outward
8. Payments
9. Grower Ledger
10. Chambers / Locations
11. Reports
12. Notifications
13. Settings

## Grower Mobile App

Bottom navigation:

1. Home
2. My Storage
3. Transactions
4. Payments
5. Profile

---

# 6. Dashboard — MOST IMPORTANT SCREEN

Create a powerful dashboard.

Top header:

**Good morning, Store Manager 👋**

Show current season and store selector.

### KPI cards

1. Total Capacity
   - 100,000 boxes

2. Allocated
   - 82,500 boxes

3. Currently Stored
   - 68,420 boxes

4. Available Capacity
   - 31,580 boxes

5. Boxes Issued / Awaiting Return
   - 4,080

6. Today's Inward
   - 2,450 boxes

7. Today's Outward
   - 840 boxes

8. Outstanding Payments
   - ₹8,45,000

Use visual progress indicators.

### Capacity visualization

Create a horizontal/segmented capacity bar:

100,000 total

- Stored: 68,420
- Allocated but not stored: 10,000
- Available: 21,580

Clicking each segment opens filtered inventory.

---

# 7. Dashboard — Today's Operations

Create a timeline/activity panel:

### Today

08:15
**Grower registered**
Abdul Rashid

09:05
**5,000 boxes issued**
Grower: Abdul Rashid

10:30
**2,000 apple boxes received**
Lot: LOT-2026-0042

11:10
**1,500 boxes allocated**
Chamber C-03

12:15
**Payment received**
₹75,000

15:30
**Dispatch request created**
Grower: Ghulam Nabi
Quantity: 500 boxes

Each activity should be clickable.

---

# 8. Dashboard — Alerts

Show operational alerts:

- ⚠ 4,080 boxes issued but apples not yet received
- ⚠ 3 growers have pending payments
- ⚠ Chamber C-04 is 92% full
- ⚠ 2 storage lots approaching contract end
- ⚠ 1 dispatch request awaiting approval
- ✓ Today's reconciliation completed

Alerts should have severity:

- Critical
- Warning
- Info
- Success

---

# 9. Dashboard — Charts

## Chart 1: Storage Utilization

Line/area chart:

Date → stored boxes

Oct 1 → 40,000
Oct 5 → 51,000
Oct 10 → 68,420
Oct 15 → 74,000

## Chart 2: Daily Inward vs Outward

Bar chart:

Date | Inward | Outward

## Chart 3: Revenue

Storage charges by month.

## Chart 4: Grower Distribution

Top growers by stored boxes.

---

# 10. Grower Management

Growers page.

Table columns:

- Grower ID
- Name
- Mobile
- Village
- Total Allocated
- Boxes Issued
- Apples Received
- Current Storage
- Outstanding
- Status
- Actions

Search:

- name
- mobile
- grower ID

Filters:

- Active
- Pending
- Storage Active
- Payment Due
- Completed

---

# 11. Grower Profile

This is a critical screen.

Header:

**Abdul Rashid**

Status: Active

Phone:
+91 XXXXX XXXXX

Village:
Sopore

Grower ID:
GRW-2026-0012

### Summary cards

- Allocation: 10,000
- Boxes Issued: 10,000
- Apples Received: 10,000
- Current Storage: 8,500
- Dispatched: 1,500
- Total Charges: ₹1,70,000
- Paid: ₹1,20,000
- Due: ₹50,000

### Tabs

Overview
Storage Lots
Box Transactions
Apple Receipts
Dispatches
Payments
Ledger
Documents

---

# 12. Storage Request

Grower creates request.

Fields:

- Required boxes
- Expected apple quantity
- Expected arrival date
- Preferred storage start date
- Expected storage duration
- Apple variety
- Notes

Example:

Request:

10,000 boxes

Expected arrival:
Oct 5–Oct 12

Expected duration:
5 months

Status:

Pending → Approved → Partially Allocated → Fully Allocated → Active → Completed

---

# 13. Allocation Workflow

Cold-store manager opens request.

Show:

Requested: 10,000

Available capacity: 31,580

Manager can approve:

10,000

Then allocation is created.

### Allocation card

Allocation ID:
ALLOC-2026-0034

Grower:
Abdul Rashid

Requested:
10,000

Allocated:
10,000

Issued:
5,000

Returned with Apples:
0

Remaining to Issue:
5,000

Status:
Partially Issued

---

# 14. Box Management

The system must distinguish between:

### Box allocation

Promise/reservation of boxes.

### Box issue

Physical empty boxes handed to grower.

### Apple receipt

Boxes returned filled with apples.

### Stored inventory

Apple boxes physically inside the cold store.

This distinction is extremely important.

Example:

Allocation = 10,000

Issued = 5,000

Apple received = 3,000

Stored = 3,000

Remaining issued boxes without apples = 2,000

Remaining allocation = 5,000

The dashboard must never confuse these numbers.

---

# 15. Box Issue Screen

Create transaction:

Grower:
Abdul Rashid

Allocation:
ALLOC-2026-0034

Date:
02 Oct 2026

Boxes:
5,000

Box type:
Wooden / Carton

Issued by:
Staff member

Vehicle / transporter:
optional

Notes:
optional

Button:

**Issue Boxes**

Generate:

BOX-ISSUE-2026-00123

Printable receipt.

---

# 16. Apple Receiving / Inward

When grower brings apples:

Fields:

- Grower
- Allocation
- Arrival date
- Number of boxes
- Apple variety
- Grade
- Approx weight
- Lot number
- Vehicle number
- Driver
- Chamber
- Storage location
- Notes

Example:

2,000 boxes

Variety:
Delicious

Grade:
A

Lot:
LOT-2026-0042

Chamber:
C-03

Location:
Rack 12

After submission:

Issued boxes:
5,000

Returned:
2,000

Still outstanding:
3,000

Stored:
2,000

---

# 17. Lot Concept

Every apple receipt should create a lot.

Example:

LOT-2026-0042

Grower:
Abdul Rashid

Received:
05 Oct 2026

Boxes:
2,000

Variety:
Red Delicious

Grade:
A

Chamber:
C-03

Rack:
R-12

Storage start:
05 Oct 2026

Expected release:
05 Mar 2027

Rate:
₹4 / box / month

Status:
In Storage

Lots can be partially dispatched.

---

# 18. Storage Inventory

This is the main operational inventory page.

Table:

| Lot | Grower | Variety | Boxes | Chamber | Storage Start | Days | Rate | Accrued |
|---|---|---|---:|---|---|---:|---:|---:|
| LOT-001 | Abdul | Delicious | 2,000 | C-03 | Oct 5 | 27 | ₹4 | ₹7,200 |
| LOT-002 | Ghulam | Ambri | 4,500 | C-02 | Oct 4 | 28 | ₹4 | ₹25,200 |

Filters:

- Grower
- Chamber
- Variety
- Grade
- Date
- Storage age
- Status

Statuses:

- In Storage
- Partially Dispatched
- Ready for Dispatch
- Completed

---

# 19. Storage Location View

Create a visual cold-store layout.

Example:

Chamber C-01
[ 92% ]

Chamber C-02
[ 78% ]

Chamber C-03
[ 65% ]

Click chamber.

Show:

- capacity
- occupied
- available
- lots
- growers
- temperature placeholder
- storage duration

Then show rack/grid layout.

Example:

C-03

R01 🟩
R02 🟩
R03 🟨
R04 🟩
R05 ⬜

Legend:

🟩 Occupied
🟨 Partially occupied
⬜ Available

---

# 20. Pricing / Storage Charges

Allow store owner to configure pricing.

Example:

Storage rate:

₹4 per box per month

or

₹0.15 per box per day

Support configurable billing model:

- Per box / day
- Per box / month
- Per box / season
- Custom rate

Do not hard-code ₹4.

The POC should demonstrate changing the rate.

---

# 21. Charge Calculation

Example:

2,000 boxes

₹4 per box/month

Storage period:
30 days

Charge:
₹8,000

If stored for 90 days:

₹24,000

Show:

Base storage charge
₹24,000

Other charges
₹2,000

Discount
₹1,000

Total
₹25,000

Paid
₹15,000

Outstanding
₹10,000

For the POC, calculation can be frontend-only.

---

# 22. Payments

Payments page.

Record:

- Grower
- Invoice
- Amount
- Payment date
- Payment method
- Reference number
- Notes

Methods:

- Cash
- UPI
- Bank Transfer
- Cheque
- Other

Payment status:

- Pending
- Partial
- Paid

Create a grower ledger.

---

# 23. Grower Ledger

Example:

Abdul Rashid

| Date | Description | Debit | Credit | Balance |
|---|---|---:|---:|---:|
| Oct 5 | Storage charge | ₹8,000 | - | ₹8,000 |
| Oct 15 | Payment | - | ₹5,000 | ₹3,000 |
| Nov 5 | Storage charge | ₹8,000 | - | ₹11,000 |
| Nov 10 | Payment | - | ₹6,000 | ₹5,000 |

Provide:

Download PDF
Print
Share

---

# 24. Dispatch / Outward

Grower requests some/all apples.

Example:

Current storage:
8,500 boxes

Request:
1,500 boxes

Manager approves.

System must prevent:

requested quantity > available quantity.

Dispatch record:

DISP-2026-0034

Grower:
Abdul Rashid

Lot:
LOT-2026-0042

Quantity:
1,500

Remaining lot:
500

Gate pass generated.

After dispatch:

Current storage:
7,000

---

# 25. Partial Dispatch

This is mandatory.

If lot has:

2,000 boxes

Dispatch 500.

System shows:

Original:
2,000

Dispatched:
500

Remaining:
1,500

Later dispatch:

700

Remaining:
800

Final dispatch:

800

Lot becomes:

Completed / Empty

---

# 26. Grower Mobile Home

The grower should not see complicated admin screens.

Show:

### My Storage

10,000 boxes allocated

8,500 boxes currently stored

1,500 boxes dispatched

### Current Charges

₹34,000

### Paid

₹25,000

### Due

₹9,000

### Current Lots

LOT-0042
2,000 boxes
Chamber C-03
Stored 27 days

### Quick Actions

Request Storage
Request Dispatch
View Receipt
Make Payment

---

# 27. Grower Timeline

Show a simple timeline.

Oct 2
✓ 5,000 boxes received

Oct 3
✓ 4,000 boxes received

Oct 5
✓ 2,000 apple boxes stored

Oct 6
✓ Storage started

Oct 20
✓ ₹10,000 payment received

Nov 2
⏳ Dispatch request pending

This gives the grower confidence and transparency.

---

# 28. Registration

Grower signup:

Step 1:
Mobile number

Step 2:
OTP UI

Step 3:
Personal information

- Full name
- Father name
- Mobile
- Village
- District
- Address

Step 4:
Farm information

- Orchard/village
- Approx apple production
- Expected storage quantity

Step 5:
Submit

Admin can approve the grower.

For POC, OTP can be mocked.

---

# 29. Notification Center

Notifications:

### Grower

- Storage request approved
- Boxes allocated
- Boxes received
- Storage started
- Payment received
- Payment due
- Dispatch approved

### Manager

- New grower registered
- New storage request
- Apple shipment arrived
- Capacity warning
- Payment overdue
- Dispatch request

Use notification badges.

---

# 30. Reports

Build report screens even if backed by mock data.

### Reports

1. Storage Utilization
2. Grower-wise Inventory
3. Daily Inward
4. Daily Outward
5. Box Allocation
6. Box Issue
7. Storage Charges
8. Payment Collection
9. Outstanding Payments
10. Chamber Utilization
11. Lot Aging
12. Dispatch Report

Every report should have:

- Date filters
- Export button
- Print
- PDF placeholder
- CSV/Excel placeholder

---

# 31. Lot Aging

Very useful operational screen.

Categories:

0–30 days
31–60 days
61–90 days
90+ days

Show:

Number of lots
Boxes
Estimated charges

Clicking a category filters inventory.

---

# 32. Business Metrics

Dashboard should calculate:

### Capacity

Available = Total Capacity - Occupied

### Allocation

Remaining Allocation = Allocated - Issued

### Box Accountability

Unreturned Boxes = Issued - Apple Received

### Storage

Current Storage = Apple Received - Dispatched

### Financial

Outstanding = Total Charges - Payments

These formulas should be used consistently throughout the POC.

---

# 33. Important Business Rules

Implement these in frontend mock logic.

### Rule 1

Cannot allocate more boxes than available capacity.

### Rule 2

Cannot issue more than allocated quantity.

### Rule 3

Cannot record apple receipt greater than issued boxes unless manager explicitly overrides.

### Rule 4

Cannot dispatch more than current stored quantity.

### Rule 5

A lot can be partially dispatched.

### Rule 6

A grower can have multiple lots.

### Rule 7

A grower can have multiple storage requests.

### Rule 8

A grower can receive boxes on multiple dates.

### Rule 9

A grower can return apples on multiple dates.

### Rule 10

Payments can be partial.

### Rule 11

Storage charges accumulate based on configurable pricing.

### Rule 12

All major actions create timeline/activity records.

---

# 34. POC Mock Data

Create realistic seed data.

## Cold Store

Name:
Kashmir Fresh CA Storage

Capacity:
100,000 boxes

Chambers:

C-01: 20,000
C-02: 20,000
C-03: 20,000
C-04: 20,000
C-05: 20,000

## Growers

Create at least 15 growers.

Example:

- Abdul Rashid
- Ghulam Nabi
- Mohammad Yousuf
- Bashir Ahmad
- Tariq Ahmad
- Fayaz Ahmad
- Irfan Ahmad
- Javaid Ahmad
- Aijaz Ahmad
- Shabir Ahmad

Use realistic Kashmir villages.

## Transactions

Create enough transactions to make the dashboard look alive:

- 15 growers
- 25 storage requests
- 40 box issue transactions
- 35 apple receipts
- 30 lots
- 15 dispatches
- 25 payments

---

# 35. UI / UX Direction

The product should feel:

- modern
- trustworthy
- agricultural
- operational
- simple
- premium
- mobile friendly

Avoid:

- excessive gradients
- overly rounded cards
- generic SaaS template appearance
- too many colors
- unnecessary animations

Suggested visual direction:

- warm white background
- dark green primary
- apple green accent
- amber warning
- red critical
- clean dark typography
- subtle borders
- compact tables
- large numbers for operational KPIs

Use icons consistently.

---

# 36. Design System

Typography:

Use Inter or a similar modern UI font.

Radius:

8–12px.

Cards:

Minimal shadows.

Buttons:

Primary
Secondary
Ghost
Danger

Status pills:

Active
Pending
Partial
Paid
Due
In Storage
Dispatched
Completed

---

# 37. Responsive Design

Desktop:

Optimized for 1440px.

Tablet:

Optimized for 1024px.

Mobile:

Optimized for 390px.

The grower experience should be mobile-first.

The manager dashboard should be desktop-first but responsive.

---

# 38. Main POC Screens

Build these screens first:

### Priority 1

1. Login
2. Manager Dashboard
3. Growers
4. Grower Detail
5. Storage Requests
6. Allocation
7. Box Issue
8. Apple Receipt
9. Storage Inventory
10. Storage Lot Detail
11. Payments
12. Grower Ledger
13. Dispatch
14. Grower Mobile Home
15. Grower Storage Detail

### Priority 2

16. Chambers
17. Reports
18. Notifications
19. Settings
20. Registration

---

# 39. Dashboard Drill-Down

This is important.

Do not make dashboard cards decorative.

Every important KPI should be clickable.

Example:

**Currently Stored: 68,420**

Click →

Storage Inventory filtered to:

Status = In Storage

Similarly:

**Outstanding ₹8,45,000**

Click →

Payments filtered:

Status = Due

**Today's Inward 2,450**

Click →

Apple Receipts filtered:

Today

---

# 40. Activity Timeline

Create a global activity model:

```text
activityId
type
title
description
entityType
entityId
user
timestamp
status
metadata
```

Examples:

```text
BOX_ISSUED
APPLE_RECEIVED
STORAGE_ALLOCATED
PAYMENT_RECEIVED
DISPATCH_CREATED
DISPATCH_COMPLETED
GROWER_REGISTERED
```

---

# 41. Frontend Architecture

For the POC:

Use mock services/repositories.

Do NOT create a backend yet.

Recommended structure:

```text
src/
  app/
    core/
      models/
      services/
      mock-data/
      guards/

    features/
      auth/
      dashboard/
      growers/
      storage-requests/
      box-management/
      apple-receipts/
      inventory/
      dispatch/
      payments/
      reports/
      chambers/
      notifications/

    shared/
      components/
      tables/
      charts/
      dialogs/
      status-badge/
      empty-state/
      loading/
```

---

# 42. Data Models

## Grower

```ts
interface Grower {
  id: string;
  growerCode: string;
  name: string;
  phone: string;
  village: string;
  district: string;
  address?: string;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  createdAt: string;
}
```

## StorageRequest

```ts
interface StorageRequest {
  id: string;
  growerId: string;
  requestedBoxes: number;
  allocatedBoxes: number;
  expectedArrivalStart: string;
  expectedArrivalEnd: string;
  expectedDurationMonths: number;
  variety?: string;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'PARTIALLY_ALLOCATED'
    | 'FULLY_ALLOCATED'
    | 'ACTIVE'
    | 'COMPLETED';
}
```

## BoxTransaction

```ts
interface BoxTransaction {
  id: string;
  growerId: string;
  allocationId: string;
  type: 'ISSUE' | 'RETURN';
  quantity: number;
  date: string;
  reference: string;
}
```

## AppleReceipt

```ts
interface AppleReceipt {
  id: string;
  growerId: string;
  allocationId: string;
  lotId: string;
  boxes: number;
  variety: string;
  grade?: string;
  receivedDate: string;
  chamberId: string;
  rackId?: string;
}
```

## StorageLot

```ts
interface StorageLot {
  id: string;
  growerId: string;
  receiptId: string;
  boxesReceived: number;
  boxesDispatched: number;
  currentBoxes: number;
  storageStartDate: string;
  chamberId: string;
  rackId?: string;
  rateType: 'PER_DAY' | 'PER_MONTH' | 'PER_SEASON';
  rate: number;
  status: 'IN_STORAGE' | 'PARTIAL' | 'COMPLETED';
}
```

## Payment

```ts
interface Payment {
  id: string;
  growerId: string;
  amount: number;
  date: string;
  method: 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'OTHER';
  reference?: string;
  notes?: string;
}
```

---

# 43. Mock Service Layer

Create services:

```text
GrowerService
StorageRequestService
BoxService
AppleReceiptService
InventoryService
PaymentService
DispatchService
ReportService
DashboardService
NotificationService
```

Services should initially read/write local mock state.

Use RxJS/Signals depending on the frontend framework.

Do not couple components directly to mock arrays.

---

# 44. State Management

For the POC, use a lightweight state approach.

If Angular:

Prefer Angular Signals for local feature state unless the existing project already uses NgRx.

Maintain centralized state for:

- current store
- growers
- requests
- allocations
- transactions
- inventory
- payments
- notifications

The architecture should allow replacing mock repositories with REST APIs later.

---

# 45. Future Backend Contract

Design frontend services so that later we can replace:

```text
MockGrowerService
```

with:

```text
ApiGrowerService
```

without rewriting UI components.

Future backend could use:

- NestJS
- PostgreSQL
- Prisma

Potential backend entities:

```text
User
Grower
ColdStore
Chamber
Rack
StorageRequest
Allocation
BoxTransaction
AppleReceipt
StorageLot
Dispatch
Payment
Invoice
Notification
ActivityLog
```

---

# 46. Important Future Architecture

The actual system should be transaction/event driven.

For example:

```text
StorageRequest
       ↓
Allocation
       ↓
BoxIssue
       ↓
AppleReceipt
       ↓
StorageLot
       ↓
Dispatch
       ↓
LotBalance
```

Financial:

```text
StorageLot
       ↓
Charge
       ↓
Invoice
       ↓
Payment
       ↓
GrowerLedger
```

This will prevent inventory and accounting numbers from becoming inconsistent.

---

# 47. Mobile App Concept

The POC should be structured so the same backend can later support:

### Manager Web App

Full operational control.

### Staff Mobile App

Fast transaction entry.

### Grower Mobile App

Simple self-service.

Potential staff actions:

- Scan grower
- Scan lot
- Issue boxes
- Receive apples
- Assign chamber
- Create dispatch
- Capture vehicle
- Print/share receipt

---

# 48. QR / Barcode — Future Feature

For the POC, visually demonstrate QR codes.

Possible QR:

Grower QR

```text
GRW-2026-0012
```

Lot QR

```text
LOT-2026-0042
```

Gate pass QR

```text
DISP-2026-0034
```

Later the mobile app can scan these.

---

# 49. Documents

Future generated documents:

- Storage Request Receipt
- Box Issue Receipt
- Apple Inward Receipt
- Storage Lot Receipt
- Payment Receipt
- Invoice
- Dispatch/Gate Pass
- Grower Ledger
- Storage Statement

The POC should include buttons and preview dialogs, even if PDF generation is mocked.

---

# 50. Demo Scenario

The entire POC must support this demo without manually editing data.

### Step 1

Manager sees:

100,000 capacity

68,420 stored

31,580 available

### Step 2

Grower Abdul registers.

### Step 3

Abdul requests:

10,000 boxes.

### Step 4

Manager approves 10,000.

### Step 5

Manager issues:

5,000 boxes.

Dashboard updates.

### Step 6

Next day:

4,000 boxes issued.

### Step 7

Abdul returns:

5,000 apple boxes.

System creates a lot.

### Step 8

Manager allocates:

5,000 boxes to Chamber C-03.

### Step 9

Storage inventory increases.

### Step 10

Charges start accumulating.

### Step 11

Abdul makes:

₹20,000 payment.

Ledger updates.

### Step 12

Abdul requests:

1,000 boxes dispatch.

### Step 13

Manager approves.

### Step 14

Current storage becomes:

4,000 boxes.

### Step 15

Dashboard updates all KPIs.

This demo should be the "golden path" of the POC.

---

# 51. UX Principle

The application should always answer these questions:

### For manager

> How much space do I have?

> Who has my boxes?

> Which growers have brought apples?

> Where are their apples?

> How many boxes are currently stored?

> How long have they been stored?

> How much should I charge?

> Who owes me money?

> What came in today?

> What went out today?

> What requires my attention?

### For grower

> How many boxes were allocated to me?

> How many boxes did I receive?

> How many apples did I store?

> Where are my apples?

> How long have they been stored?

> How much do I owe?

> What have I paid?

> How many boxes remain?

> Can I request dispatch?

---

# 52. What NOT to Build in POC

Do not spend time initially on:

- real payment gateway
- real OTP
- real SMS
- WhatsApp integration
- real QR scanning
- IoT temperature integration
- accounting integration
- GST complexity
- real PDF backend generation
- real offline sync
- complex permissions backend
- real API
- AI features

Show placeholders where appropriate.

---

# 53. POC Acceptance Criteria

The POC is successful when:

1. Manager can see total capacity.
2. Manager can see allocated capacity.
3. Manager can see actual stored boxes.
4. Manager can see available capacity.
5. Manager can register a grower.
6. Grower can submit storage request.
7. Manager can approve allocation.
8. Manager can issue boxes.
9. Manager can record partial box issue.
10. Manager can record apple receipt.
11. Apple receipt creates a lot.
12. Lot has storage location.
13. Multiple lots per grower work.
14. Storage duration is visible.
15. Storage charges are calculated.
16. Payments are recorded.
17. Outstanding amount is visible.
18. Grower ledger is visible.
19. Grower can request dispatch.
20. Partial dispatch works.
21. Inventory updates after dispatch.
22. Dashboard updates from transactions.
23. Reports can filter data.
24. Mobile grower flow is usable.
25. Every major transaction has a history/timeline.

---

# 54. Build Order for the Agent

Build in this exact sequence.

## Phase 1 — Foundation

- project setup
- design system
- navigation
- responsive layout
- mock data
- models
- services
- state

## Phase 2 — Manager Dashboard

- KPI cards
- capacity
- activity
- alerts
- charts
- quick actions

## Phase 3 — Growers

- list
- create
- profile
- storage summary
- timeline

## Phase 4 — Storage Lifecycle

- requests
- allocation
- box issue
- apple receipt
- lots
- inventory

## Phase 5 — Financial

- charges
- payments
- ledger
- outstanding

## Phase 6 — Dispatch

- request
- approval
- partial dispatch
- gate pass

## Phase 7 — Grower App

- signup
- home
- storage
- payments
- dispatch

## Phase 8 — Reports

- utilization
- inventory
- inward
- outward
- payments
- aging

## Phase 9 — Polish

- empty states
- loading states
- validation
- error states
- mobile responsiveness
- accessibility
- animations
- demo data consistency

---

# 55. Agent Instructions

You are a senior product designer + frontend architect + frontend engineer.

Do not blindly build screens.

First understand the business lifecycle:

```text
Grower
  ↓
Storage Request
  ↓
Allocation
  ↓
Box Issue
  ↓
Apple Receipt
  ↓
Storage Lot
  ↓
Storage Charges
  ↓
Payment
  ↓
Dispatch
  ↓
Remaining Inventory
  ↓
Completed
```

Before implementing each screen, determine:

1. What business problem does it solve?
2. What data does it consume?
3. What action can the user perform?
4. What happens after that action?
5. Which dashboard numbers should change?
6. What validation is required?
7. What history should be recorded?

Never create a UI that does not connect to the underlying business model.

---

# 56. Agent Quality Rules

### Rule 1 — No fake interactions

Buttons must work.

### Rule 2 — No disconnected screens

Actions must update mock state.

### Rule 3 — Preserve business consistency

If 500 boxes are dispatched, inventory must reduce by 500.

### Rule 4 — Use realistic data

Do not use lorem ipsum or random meaningless names.

### Rule 5 — Think transactionally

Every operational action should create a transaction/activity.

### Rule 6 — Design for scale

100 growers today should still work with 10,000 growers later.

### Rule 7 — Mobile first for growers

The grower should be able to complete key actions from a phone.

### Rule 8 — Desktop first for operations

The store manager needs dense data and quick actions.

### Rule 9 — Do not overbuild

This is a POC.

### Rule 10 — Make the demo impressive

The golden-path workflow must feel complete from registration to storage to payment to dispatch.

---

# 57. Final Prompt to the Coding Agent

Build this application as a polished frontend POC for an Apple Cold Storage Management Platform.

The target customer is a cold-store operator who stores apples for multiple growers.

The core operational challenge is tracking the complete lifecycle of boxes and apples:

Grower → Storage Request → Allocation → Box Issue → Apple Receipt → Storage Lot → Storage Charges → Payment → Dispatch → Remaining Inventory.

The application must provide complete visibility to the cold-store manager and a simple mobile-first experience to growers.

Do not build a generic CRM or generic warehouse dashboard.

Build specifically for apple cold storage.

The manager must be able to understand:

- total storage capacity
- allocated capacity
- boxes issued
- boxes awaiting return with apples
- current apple inventory
- chamber utilization
- grower-wise stock
- lot-wise stock
- storage duration
- accrued charges
- payments
- outstanding amounts
- today's inward
- today's outward
- pending actions

The grower must be able to:

- register
- request storage
- view allocation
- view boxes issued
- view apples received
- view storage lots
- see storage duration
- see charges
- see payments
- see outstanding amount
- request dispatch
- see transaction history
- access receipts

Use mock data and frontend state only for this POC.

No backend is required.

However, architect the frontend so mock services can later be replaced by REST APIs without changing feature components.

Use a clean domain model around:

Grower
StorageRequest
Allocation
BoxTransaction
AppleReceipt
StorageLot
Dispatch
Payment
Charge
Chamber
Activity

Implement the business rules described above.

Make the Manager Dashboard the strongest screen.

Every important KPI must be clickable and drill into filtered data.

Use realistic Kashmir/J&K apple-storage demo data.

Create a polished, professional, production-quality UI.

Do not make every screen a collection of cards.

Use tables where operational data needs density, charts where trends matter, timelines for history, and visual capacity/location views where appropriate.

Ensure all critical workflows are actually interactive.

The final demo must allow this sequence:

1. Register grower.
2. Create storage request for 10,000 boxes.
3. Approve 10,000 boxes.
4. Issue 5,000 boxes.
5. Issue another 4,000 boxes.
6. Receive 5,000 boxes with apples.
7. Create storage lot.
8. Assign chamber/location.
9. Calculate storage charges.
10. Record payment.
11. Request 1,000-box dispatch.
12. Approve dispatch.
13. Reduce lot inventory.
14. Update dashboard.
15. Show complete grower timeline and ledger.

Do not stop after creating static screens.

The POC should behave like a small working product.
