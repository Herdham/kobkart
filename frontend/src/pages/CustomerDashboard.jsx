import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Gift, Package, Receipt, Users, Wallet, Zap } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { daysUntil, naira } from '../api/seller'
import { dueLabel, startPayment, timeAgo } from '../api/customer'
import './dashboard.css'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}

function statusBadge(p) {
  if (p.status === 'delivered') return ['Delivered', 'done']
  if (p.status === 'completed') return ['Ready for delivery', 'done']
  if (p.status === 'cancelled') return ['Cancelled', '']
  return daysUntil(p.next_due_date) < 0 ? ['Overdue', 'warn'] : ['Active', '']
}

export default function CustomerDashboard() {
  const nav = useNavigate()
  const user = getSession()?.user
  const [plans, setPlans] = useState(null)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [paying, setPaying] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    Promise.all([api('/plans'), api('/payments')])
      .then(([p, pay]) => {
        setPlans(p)
        setPayments(pay)
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2800)
  }

  async function pay(p) {
    setPaying(p.id)
    try {
      await startPayment(p.id)
    } catch (e) {
      say(e.message)
      setPaying('')
    }
  }

  async function invite() {
    const rc = user?.referral_code
    const text = `Join me on Kobkart and pay for what you want, small small! ${window.location.origin}/register${rc ? ` (use my referral code ${rc})` : ''}`
    try {
      await navigator.clipboard.writeText(text)
      say('Invite message copied')
    } catch {
      say(text)
    }
  }

  const list = plans || []
  const active = list.filter((p) => p.status === 'active')
  const done = list.filter((p) => p.status === 'completed' || p.status === 'delivered')
  const totalPaid = list.reduce((a, p) => a + p.amount_paid, 0)
  const next = [...active].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0]
  const q = search.trim().toLowerCase()
  const shown = list.filter((p) => `${p.product_name} ${p.seller_name} ${p.channel_name}`.toLowerCase().includes(q))
  const names = Object.fromEntries(list.map((p) => [p.id, p.product_name]))

  const activity = [
    ...list.map((p) => ({ key: `j${p.id}`, at: p.created_at, Icon: Users, title: `You joined ${p.product_name}`, sub: `${naira(p.installment_amount)} contribution` })),
    ...payments
      .filter((x) => x.status === 'success')
      .map((x) => ({ key: `p${x.id}`, at: x.paid_at || x.created_at, Icon: Wallet, title: 'Payment successful', sub: `${naira(x.amount)} for ${names[x.plan_id] || 'your package'}` })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 5)

  return (
    <DashboardLayout name={user?.full_name} role="customer" active="dashboard" search={search} onSearch={setSearch}>
      {error && <div className="alert">{error}</div>}
      {!plans && !error && <div className="db-loading">Loading your dashboard...</div>}

      {plans && (
        <div className="db-grid">
          <div className="db-col">
            <section className="cd-banner">
              <div>
                <p>{greeting()},</p>
                <h1>{user?.full_name} <span className="cd-crown"><Crown size={17} /></span></h1>
                <p className="muted">Here's what's happening with your contributions and orders.</p>
              </div>
              <div className="cd-hand">Together<br />we achieve<br /><small>more</small></div>
            </section>

            <div className="db-stats">
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Package size={22} /></span>
                <p>Active Packages</p>
                <b>{active.length}</b>
                <small>{active.length ? `You're part of ${active.length} active package${active.length === 1 ? '' : 's'}` : 'Join your first package'}</small>
              </div>
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Wallet size={22} /></span>
                <p>Total Contributions</p>
                <b className="red">{naira(totalPaid)}</b>
                <small>Across all packages</small>
              </div>
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Receipt size={22} /></span>
                <p>Completed Orders</p>
                <b>{done.length}</b>
                <small>Fully paid packages</small>
              </div>
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Zap size={22} /></span>
                <p>Next Payment</p>
                <b className="red">{next ? naira(Math.min(next.installment_amount, next.remaining)) : '-'}</b>
                <small className={next && daysUntil(next.next_due_date) < 0 ? 'warn' : ''}>
                  {next ? dueLabel(daysUntil(next.next_due_date)) : 'Nothing due right now'}
                </small>
              </div>
            </div>

            <section className="db-card">
              <div className="db-card-head">
                <div>
                  <h2>My Packages</h2>
                  <p className="muted small" style={{ margin: '2px 0 0' }}>Pay a little at a time and get what you want.</p>
                </div>
              </div>

              {list.length === 0 ? (
                <div className="db-empty">
                  <Package size={32} />
                  <b>You haven't joined a package yet</b>
                  <p>Open the link your seller sent you, or enter their code here.</p>
                  <form
                    className="jn-enter"
                    style={{ margin: '8px 0 0', maxWidth: 360, width: '100%' }}
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (code.trim()) nav(`/join/${code.trim()}`)
                    }}
                  >
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" maxLength={12} />
                    <button className="db-btn">Continue</button>
                  </form>
                </div>
              ) : shown.length === 0 ? (
                <div className="db-empty"><b>No match found</b><p>Try a different name.</p></div>
              ) : (
                <div className="cp-grid">
                  {shown.map((p) => {
                    const [label, tone] = statusBadge(p)
                    const pct = p.locked_price ? Math.round((p.amount_paid / p.locked_price) * 100) : 0
                    return (
                      <div className="cp-card" key={p.id}>
                        <div className="cp-img">
                          {p.image_url ? <img src={p.image_url} alt="" /> : <Package size={32} />}
                          <span className={`cp-badge ${tone}`}>{label}</span>
                        </div>
                        <div className="cp-body">
                          <h3>{p.product_name}</h3>
                          <small>{p.channel_name} • {p.seller_name}</small>
                          <div className="cp-price">
                            <b>{naira(p.locked_price)}</b>
                            <span className="cp-chip">{naira(p.installment_amount)} every {p.frequency_days} days</span>
                          </div>
                          <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div>
                          <div className="cp-meta">
                            <span>{p.payments_made}/{p.payments_total} contributions</span>
                            {p.status === 'active' && <span>{dueLabel(daysUntil(p.next_due_date))}</span>}
                          </div>
                          <div className="cp-actions">
                            {p.status === 'active' && (
                              <button className="db-btn" disabled={paying === p.id} onClick={() => pay(p)}>
                                {paying === p.id ? 'Opening...' : 'Pay Now'}
                              </button>
                            )}
                            <button className="db-btn ghost" onClick={() => nav(p.kind === "rotation" ? `/groups/${p.channel_id}` : `/plans/${p.id}`)}>{p.kind === "rotation" ? "View group" : "Details"}</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="db-col">
            <section className="db-card">
              <div className="db-card-head"><h2>Quick Actions</h2></div>
              <div className="db-qa">
                <button onClick={() => nav('/browse')}><span><Package size={20} /></span>Browse Packages<small>Find something to join</small></button>
                <button onClick={() => (next ? pay(next) : say('Nothing is due right now'))}><span><Zap size={20} /></span>Pay Next Due<small>{next ? next.product_name : 'All up to date'}</small></button>
                <button onClick={() => nav('/contributions')}><span><Receipt size={20} /></span>My Contributions<small>Your payment history</small></button>
                <button onClick={invite}><span><Gift size={20} /></span>Invite a Friend<small>Share Kobkart</small></button>
              </div>
            </section>

            <section className="db-card">
              <div className="db-card-head">
                <h2>Recent Activity</h2>
                <button className="db-link" onClick={() => nav('/contributions')}>View all</button>
              </div>
              {activity.length === 0 ? (
                <p className="muted small">Your activity will show up here.</p>
              ) : (
                <ul className="cd-act">
                  {activity.map(({ key, at, Icon, title, sub }) => (
                    <li key={key}>
                      <span className="cd-act-icon"><Icon size={18} /></span>
                      <div><b>{title}</b><small>{sub}</small><time>{timeAgo(at)}</time></div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}