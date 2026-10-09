import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import VerifyCode from './pages/VerifyCode'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Packages from './pages/Packages'
import PackageDetail from './pages/PackageDetail'
import MyStore from './pages/MyStore'
import Join from './pages/Join'
import PlanDetail from './pages/PlanDetail'
import Contributions from './pages/Contributions'
import PaymentCallback from './pages/PaymentCallback'
import Orders from './pages/Orders'
import Customers from './pages/Customers'
import SellerPayments from './pages/SellerPayments'
import Browse from './pages/Browse'
import GroupDetail from './pages/GroupDetail'
import { getSession } from './api/auth'

function RequireRole({ role, children }) {
  const s = getSession()
  if (!s) return <Navigate to="/login" replace />
  if (role && s.user?.role !== role) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-email" element={<VerifyCode />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/dashboard" element={<RequireRole><Dashboard /></RequireRole>} />
      <Route path="/store" element={<RequireRole role="seller"><MyStore /></RequireRole>} />
      <Route path="/packages" element={<RequireRole role="seller"><Packages /></RequireRole>} />
      <Route path="/packages/:id" element={<RequireRole role="seller"><PackageDetail /></RequireRole>} />
      <Route path="/join" element={<Join />} />
      <Route path="/join/:code" element={<Join />} />

      <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/plans/:id" element={<RequireRole role="customer"><PlanDetail /></RequireRole>} />
      <Route path="/contributions" element={<RequireRole role="customer"><Contributions /></RequireRole>} />
      <Route path="/payment/callback" element={<RequireRole role="customer"><PaymentCallback /></RequireRole>} />
      <Route path="/orders" element={<RequireRole role="seller"><Orders /></RequireRole>} />
      <Route path="/customers" element={<RequireRole role="seller"><Customers /></RequireRole>} />
      <Route path="/payments" element={<RequireRole role="seller"><SellerPayments /></RequireRole>} />
      <Route path="/browse" element={<Browse />} />
          <Route path="/groups/:id" element={<RequireRole><GroupDetail /></RequireRole>} />
    </Routes>
  )
}
