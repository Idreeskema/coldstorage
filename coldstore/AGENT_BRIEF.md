# Agent brief — Cold Store web POC (React + TS + Vite)

Spec: ../apple_cold_store_management_poc.md. Design: clean, minimalist, warm-white + deep green, dense tables, large KPI numbers, NO excess cards/gradients/animation.

## You may only edit files inside YOUR feature folder(s) under src/features/. Do NOT edit src/core, src/ui, src/layout, src/App.tsx.
If you need a shared change (a missing helper, a bug in core), do NOT edit it - describe it in your final report. Put feature CSS in your own `<feature>.css` (import it from your page) with class names prefixed by your feature (e.g. `.dash-…`). Reuse global classes from src/ui/ui.css (.card, .btn, .tbl, .pill, .kpi, .grid .cols-N, .row, .stack, .muted, .num, .toolbar, .chips …).

## Read first
- src/core/types.ts (domain), src/core/calc.ts (all derived numbers & business formulas), src/core/store.ts (actions that enforce business rules, return {ok,error,id}), src/core/format.ts, src/ui/index.tsx (kit: Button, Card, PageHeader, Kpi, SegBar, Progress, StatusPill, Modal, Field/Input/Select/Textarea, Tabs, Chips, TableWrap, Timeline, DocPreview, QrCode, Alert, EmptyState, toast()).
- Always read numbers from `useDerived()` (store KPIs, lots w/ accrued charges, growerStats, allocStats, chamber/rack stats) — never recompute differently. Mutate ONLY via store actions; show `toast(res.error,'error')` on failure and `toast('…')` on success. Every action already logs an Activity + Notification.
- `useStore((s)=>s.session)` gives role. Admin pages are rendered inside AdminLayout; grower pages (role GROWER, session.growerId) inside the mobile GrowerLayout (max 480px).
- Pages are default exports in the existing stub files (replace stub contents; keep file names/exports). Page wrapper is `<div className="page">`.

## URL contract for drill-downs (so dashboard KPIs link correctly) — implement the ones for your pages by reading `useSearchParams`
- /admin/growers?filter=active|pending|storage|due|completed&q=
- /admin/requests?status=PENDING|…
- /admin/boxes?grower=<id>&allocation=<id>   (prefill issue form) 
- /admin/receipts?date=today&grower=<id>&allocation=<id>  (list filter + prefill form)
- /admin/inventory?status=IN_STORAGE|PARTIAL|READY|COMPLETED&grower=<id>&chamber=C-03&bucket=0-30|31-60|61-90|90+&variety=&q=
- /admin/inventory/:lotId   /admin/growers/:id   /admin/ledger/:growerId   /admin/chambers/:chamberId
- /admin/dispatch?status=PENDING&date=today   /admin/payments?status=due|partial|paid&grower=<id>&new=1
- Money: ₹ with Indian grouping via format.ts `inr()`; numbers via `num()`; dates via `fmtDate()`.

## Quality bar
Buttons work. Forms validate and surface business-rule errors from store actions. Empty states. Responsive (desktop 1440 first, tablet 1024, mobile 390 usable). Realistic labels. No lorem. Keep code tidy; `npx tsc -p .` must pass for your files (run it; ignore errors in other folders still being built).
