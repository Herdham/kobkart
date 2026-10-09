import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Check, Clock, Crown, Link2, MessageCircle, Package, Plus, TrendingUp, Users, Wallet } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { getSession } from '../api/auth'
import { daysUntil, getSellerData, naira, shortDate, whatsappLink } from '../api/seller'
import './dashboard.css'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}

function badge(p) {
  if (p.status === 'delivered') return { key: 'delivered', label: 'Delivered' }
  if (p.status === 'completed') return { key: 'completed', label: 'Completed' }
  if (p.status === 'cancelled') return { key: 'cancelled', label: 'Cancelled' }
  return p.late ? { key: 'late', label: 'Late' } : { key: 'ontrack', label: 'On track' }
}

function dueText(days) {
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}

export default function SellerDashboard() {
  const nav = useNavigate()
  const session = getSession()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getSellerData()
      .then(setData)
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const say = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2400)
  }
  const soon = (label) => say(`${label} is coming soon`)

  const businessName = data?.profile?.business_name || session?.user?.full_name || 'Seller'
  let content = null

  if (data) {
    const { stats, plans, channels, profile } = data
    const collected = plans.reduce((a, p) => a + p.amount_paid, 0)
    const target = plans.reduce((a, p) => a + p.locked_price, 0)
    const pct = target ? Math.round((collected / target) * 100) : 0

    const upcoming = plans
      .filter((p) => p.status === 'active')
      .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
      .slice(0, 4)

    const pkg = channels[0]
    const pkgPlans = pkg ? plans.filter((p) => !p.channel_id || p.channel_id === pkg.id) : []
    const pkgPaid = pkgPlans.reduce((a, p) => a + p.amount_paid, 0)
    const pkgTarget = pkgPlans.reduce((a, p) => a + p.locked_price, 0)
    const pkgPct = pkgTarget ? Math.round((pkgPaid / pkgTarget) * 100) : 0
    const nextDue = pkgPlans
      .filter((p) => p.status === 'active')
      .map((p) => p.next_due_date)
      .sort()[0]

    const q = search.trim().toLowerCase()
    const rows = plans.filter(
      (p) =>
        (filter === 'all' || badge(p).key === filter) &&
        `${p.customer_name} ${p.customer_phone}`.toLowerCase().includes(q)
    )

    const steps = [
      { done: true, label: 'Create your account', hint: 'Done' },
      { done: profile.verified, label: 'Get verified', hint: profile.verified ? 'Approved' : 'Pending review by Kobkart' },
      { done: profile.payout_ready, label: 'Add payout account', hint: profile.payout_ready ? 'Ready' : 'Add your bank account in My Store' },
      { done: channels.length > 0, label: 'Create your first package', hint: channels.length ? 'Done' : 'Add products and a contribution plan' },
    ]
    const doneCount = steps.filter((s) => s.done).length

    const copyLink = async () => {
      if (!pkg) return say('Create your first package to get a store link')
      const link = `${window.location.origin}/join/${pkg.invite_code}`
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        say(link)
      }
    }

    content = (
      <div className="db-grid">
        {/* ---------- left / main ---------- */}
        <div className="db-col">
          <div className="db-hello">
            <div>
              <p>{greeting()},</p>
              <h1>{businessName} <Crown size={22} /></h1>
              <p className="muted">Here's what's happening with your store today.</p>
            </div>
            <div className="db-date">
              <CalendarDays size={20} />
              <div>
                <b>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b>
                <small>Keep going, you're doing great!</small>
              </div>
            </div>
          </div>

          {doneCount < steps.length && (
            <section className="db-card db-setup">
              <div className="db-card-head">
                <h2>Set up your store</h2>
                <span className="db-count">{doneCount}/{steps.length} done</span>
              </div>
              <ul>
                {steps.map((s) => (
                  <li key={s.label} className={s.done ? 'done' : ''}>
                    <span className="db-tick">{s.done && <Check size={14} />}</span>
                    <div><b>{s.label}</b><small>{s.hint}</small></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="db-stats">
            <div className="db-card db-stat">
              <span className="db-stat-icon"><Users size={22} /></span>
              <p>Total Participants</p>
              <b>{stats.total_members}</b>
              <small>{stats.active_plans} active plan{stats.active_plans === 1 ? '' : 's'}</small>
            </div>
            <div className="db-card db-stat">
              <span className="db-stat-icon"><Wallet size={22} /></span>
              <p>Total Collected</p>
              <b className="red">{naira(collected)}</b>
              <small>{target ? `of ${naira(target)}` : 'No plans yet'}</small>
              <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div>
            </div>
            <div className="db-card db-stat">
              <span className="db-stat-icon"><Package size={22} /></span>
              <p>Completed Orders</p>
              <b>{stats.ready_for_delivery}</b>
              <small>Ready for delivery</small>
            </div>
            <div className="db-card db-stat">
              <span className="db-stat-icon"><Clock size={22} /></span>
              <p>Pending Payments</p>
              <b>{stats.late_plans}</b>
              <small className={stats.late_plans ? 'warn' : ''}>{stats.late_plans ? 'Need attention' : 'All up to date'}</small>
            </div>
          </div>

          {pkg ? (
            <section className="db-card db-pkg">
              <div className="db-pkg-img"><Package size={36} /></div>
              <div className="db-pkg-body">
                <div className="db-pkg-head">
                  <div>
                    <span className="bd ontrack">Active</span>
                    <h2>{pkg.name}</h2>
                    <p>{naira(pkg.contribution_amount)} every {pkg.frequency_days} days &nbsp;•&nbsp; <b>{pkgPlans.length} participants</b></p>
                  </div>
                  <button className="db-btn" onClick={() => nav(`/packages/${pkg.id}`)}>View Package <ArrowRight size={16} /></button>
                </div>
                <div className="db-pkg-meta">
                  <span><CalendarDays size={15} /> Started: {shortDate(pkg.created_at)}</span>
                  <span><Clock size={15} /> Next due: {nextDue ? shortDate(nextDue) : '-'}</span>
                  <span><Users size={15} /> {pkgPlans.length} participants</span>
                </div>
                <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pkgPct}%` }} /></div><em>{pkgPct}%</em></div>
              </div>
            </section>
          ) : (
            <section className="db-card db-empty-pkg">
              <Package size={34} />
              <h2>Create your first package</h2>
              <p>A package is what your customers join: a product, an amount and how often they pay.</p>
              <button className="db-btn" onClick={() => nav('/packages?new=1')}><Plus size={16} /> Create Package</button>
            </section>
          )}

          <section className="db-card">
            <div className="db-card-head">
              <h2>Participants</h2>
              <div className="db-filters">
                <label className="db-mini-search">
                  <input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="ontrack">On track</option>
                  <option value="late">Late</option>
                  <option value="completed">Completed</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="db-empty">
                <Users size={30} />
                <b>{plans.length ? 'No match found' : 'No participants yet'}</b>
                <p>{plans.length ? 'Try a different name or status.' : 'Share your store link and your first customers will show up here.'}</p>
              </div>
            ) : (
              <div className="db-table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Phone</th><th>Contribution</th><th>Total Paid</th><th>Status</th><th>Next Due</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((p, i) => {
                      const b = badge(p)
                      const msg = `Hello ${p.customer_name}, this is a friendly reminder from ${businessName}. Your ${naira(p.installment_amount || 0)} contribution for ${p.product_name} is due. Thank you!`
                      return (
                        <tr key={p.id}>
                          <td>{i + 1}</td>
                          <td><span className="db-row-name"><span className="db-mini-avatar">{p.customer_name[0]}</span>{p.customer_name}</span></td>
                          <td>{p.customer_phone}</td>
                          <td>{naira(p.installment_amount || 0)}</td>
                          <td>{naira(p.amount_paid)}</td>
                          <td><span className={`bd ${b.key}`}>{b.label}</span></td>
                          <td>{p.status === 'active' ? shortDate(p.next_due_date) : '-'}</td>
                          <td>
                            {p.status === 'active' ? (
                              <a className="db-remind" href={whatsappLink(p.customer_phone, msg)} target="_blank" rel="noreferrer" title="Remind on WhatsApp">
                                <MessageCircle size={15} /> Remind
                              </a>
                            ) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ---------- right column ---------- */}
        <aside className="db-col">
          <section className="db-promo">
            <h3>Make It Easier<br />for Your Customers</h3>
            <p>Share your store link and let more people join your packages.</p>
            <button onClick={copyLink}><Link2 size={16} /> {copied ? 'Link copied!' : 'Share Store Link'}</button>
          </section>

          <section className="db-card">
            <div className="db-card-head">
              <h2>Upcoming Payments</h2>
              <button className="db-link" onClick={() => soon('Payments')}>View all <ArrowRight size={14} /></button>
            </div>
            {upcoming.length === 0 ? (
              <p className="muted small">No upcoming payments yet.</p>
            ) : (
              <ul className="db-upcoming">
                {upcoming.map((p) => {
                  const days = daysUntil(p.next_due_date)
                  return (
                    <li key={p.id}>
                      <span className="db-cal"><CalendarDays size={18} /></span>
                      <div><b>{p.customer_name}</b><small>{naira(p.installment_amount || 0)} • {shortDate(p.next_due_date)}</small></div>
                      <span className={`pill-due ${days < 0 ? 'overdue' : ''}`}>{dueText(days)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="db-card">
            <div className="db-card-head"><h2>Quick Actions</h2></div>
            <div className="db-qa">
              <button onClick={() => nav('/packages')}><span><Plus size={20} /></span>Add Product</button>
              <button onClick={() => nav('/packages?new=1')}><span><Package size={20} /></span>Create Package</button>
              <button onClick={() => soon('Customers')}><span><Users size={20} /></span>View Customers</button>
              <button onClick={() => soon('Reports')}><span><TrendingUp size={20} /></span>View Reports</button>
            </div>
          </section>
        </aside>
      </div>
    )
  }

  return (
    <DashboardLayout name={businessName} search={search} onSearch={setSearch} onSoon={soon}>
      {error && <div className="alert">{error}</div>}
      {!data && !error && <div className="db-loading">Loading your dashboard...</div>}
      {content}
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}