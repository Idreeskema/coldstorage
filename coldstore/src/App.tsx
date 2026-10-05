import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useStore } from './core/store'
import type { Role } from './core/types'
import { AdminLayout } from './layout/AdminLayout'
import { GrowerLayout } from './layout/GrowerLayout'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import DashboardPage from './features/dashboard/DashboardPage'
import ChambersPage from './features/chambers/ChambersPage'
import GrowersPage from './features/growers/GrowersPage'
import GrowerDetailPage from './features/growers/GrowerDetailPage'
import RequestsPage from './features/requests/RequestsPage'
import BoxesPage from './features/boxes/BoxesPage'
import ReceiptsPage from './features/receipts/ReceiptsPage'
import InventoryPage from './features/inventory/InventoryPage'
import LotDetailPage from './features/inventory/LotDetailPage'
import DispatchPage from './features/dispatch/DispatchPage'
import PaymentsPage from './features/payments/PaymentsPage'
import LedgerPage from './features/payments/LedgerPage'
import ReportsPage from './features/reports/ReportsPage'
import NotificationsPage from './features/notifications/NotificationsPage'
import SettingsPage from './features/settings/SettingsPage'
import GrowerHomePage from './features/grower-app/GrowerHomePage'
import GrowerStoragePage from './features/grower-app/GrowerStoragePage'
import GrowerTransactionsPage from './features/grower-app/GrowerTransactionsPage'
import GrowerPaymentsPage from './features/grower-app/GrowerPaymentsPage'
import GrowerProfilePage from './features/grower-app/GrowerProfilePage'
import GrowerRequestPage from './features/grower-app/GrowerRequestPage'
import GrowerDispatchPage from './features/grower-app/GrowerDispatchPage'

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const session = useStore((s) => s.session)
  if (!session) return <Navigate to="/login" replace />
  if (!roles.includes(session.role)) return <Navigate to={session.role === 'GROWER' ? '/app' : '/admin'} replace />
  return <>{children}</>
}

export default function App() {
  const session = useStore((s) => s.session)
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/admin" element={<Guard roles={['MANAGER', 'STAFF']}><AdminLayout /></Guard>}>
        <Route index element={<DashboardPage />} />
        <Route path="growers" element={<GrowersPage />} />
        <Route path="growers/:id" element={<GrowerDetailPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="receipts" element={<ReceiptsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/:lotId" element={<LotDetailPage />} />
        <Route path="dispatch" element={<DispatchPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="ledger/:growerId" element={<LedgerPage />} />
        <Route path="chambers" element={<ChambersPage />} />
        <Route path="chambers/:chamberId" element={<ChambersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/app" element={<Guard roles={['GROWER']}><GrowerLayout /></Guard>}>
        <Route index element={<GrowerHomePage />} />
        <Route path="storage" element={<GrowerStoragePage />} />
        <Route path="transactions" element={<GrowerTransactionsPage />} />
        <Route path="payments" element={<GrowerPaymentsPage />} />
        <Route path="profile" element={<GrowerProfilePage />} />
        <Route path="request" element={<GrowerRequestPage />} />
        <Route path="dispatch" element={<GrowerDispatchPage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? (session.role === 'GROWER' ? '/app' : '/admin') : '/login'} replace />} />
    </Routes>
  )
}
