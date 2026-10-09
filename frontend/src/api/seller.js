import { clearSession, getSession } from './auth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/* ---------- helpers ---------- */
export const naira = (kobo = 0) =>
  '₦' + (kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })

export function shortDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysUntil(iso) {
  const due = new Date(`${iso}T00:00:00`)
  const today = new Date(new Date().toDateString())
  return Math.round((due - today) / 86400000)
}

export function whatsappLink(phone, text) {
  let n = String(phone).replace(/\D/g, '')
  if (n.startsWith('0')) n = '234' + n.slice(1)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

/* ---------- api ---------- */
async function get(path) {
  const session = getSession()
  let res
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${session?.token}` } })
  } catch {
    throw new Error('Cannot reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearSession()
    const e = new Error('Please log in again')
    e.status = 401
    throw e
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong')
  return data
}

/* ---------- sample data: open /dashboard?demo=1 ---------- */
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
const person = (i, name, phone, paid, due, late = false, status = 'active') => ({
  id: `demo-${i}`,
  channel_id: 'demo-ch',
  channel_name: 'September Clothing Package',
  customer_name: name,
  customer_phone: phone,
  product_name: 'September Clothing Package',
  locked_price: 2000000,
  installment_amount: 100000,
  amount_paid: paid,
  next_due_date: day(due),
  status,
  late,
})
const DEMO = {
  stats: { total_collected: 1400000, platform_fees: 42000, net_to_seller: 1358000, total_members: 8, active_plans: 6, late_plans: 2, ready_for_delivery: 1 },
  plans: [
    person(1, 'Amina Yusuf', '08123456789', 400000, 3),
    person(2, 'Fatima Bello', '08098765432', 300000, 5),
    person(3, 'Zainab Musa', '08111222333', 200000, -2, true),
    person(4, 'Hauwa Ibrahim', '07033445566', 400000, 4),
    person(5, 'Maryam Sani', '08055667788', 100000, -1, true),
    person(6, 'Rukayat Ali', '07088776655', 2000000, 0, false, 'completed'),
  ],
  channels: [{ id: 'demo-ch', name: 'September Clothing Package', contribution_amount: 100000, frequency_days: 5, invite_code: 'DEMO1234', created_at: new Date(Date.now() - 31 * 86400000).toISOString() }],
  profile: { business_name: 'Aisha Fashion', verified: true, payout_ready: true },
}

export async function getSellerData() {
  if (new URLSearchParams(window.location.search).get('demo') === '1') return DEMO
  const [stats, plans, channels, profile] = await Promise.all([
    get('/dashboard/seller'),
    get('/seller/plans'),
    get('/seller/channels'),
    get('/seller/profile'),
  ])
  return { stats, plans, channels, profile }
}