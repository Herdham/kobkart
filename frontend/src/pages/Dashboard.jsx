import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import SellerDashboard from './SellerDashboard'
import CustomerDashboard from './CustomerDashboard'
import AdminDashboard from './AdminDashboard'
import { getSession } from '../api/auth'

export default function Dashboard() {
  const role = getSession()?.user?.role
  const [next] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kobkart_next') || 'null')
      return saved && Date.now() - saved.at < 3600000 ? saved.path : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    localStorage.removeItem('kobkart_next')
  }, [])

  if (next) return <Navigate to={next} replace />
  if (role === 'admin') return <AdminDashboard />
  return role === 'seller' ? <SellerDashboard /> : <CustomerDashboard />
}