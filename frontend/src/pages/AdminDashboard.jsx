import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Landmark, MessageCircle, ShieldCheck, Store, Users, Wallet } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { naira, shortDate, whatsappLink } from '../api/seller'
import './dashboard.css'

const TABS = [
  ['pending', 'Pending approval'],
  ['approved', 'Approved'],
  ['all', 'All sellers'],
]
const CHIP = { success: ['Paid', 'ontrack'], pending: ['Pending', 'completed'], failed: ['Failed', 'late'] }

export default function AdminDashboard() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('pending')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  const load = useCallback(
    () =>
      Promise.all([api('/admin/overview'), api('/admin/sellers'), api('/admin/payments')])
        .then(([overview, sellers, payments]) => setData({ overview, sellers, payments }))
        .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message))),
    [nav]
  )

  useEffect(() => {
    load()
  }, [load])

  async function setVerified(s, verified) {
    if (!verified && !window.confirm(`Remove approval for ${s.business_name}? They will not be able to create new packages.`)) return
    setBusy(s.user_id)
    try {
      await api(`/admin/sellers/${s.user_id}/verify`, { method: 'PUT', body: { verified } })
      say(verified ? 'Seller approved' : 'Approval removed')
      await load()
    } catch (e) {
      say(e.message)
    } finally {
      setBusy('')
    }
  }

  const o = data?.overview
  const sellers = (data?.sellers || []).filter((s) => tab === 'all' || (tab === 'pending' ? !s.verified : s.verified))

  return (
    <DashboardLayout name="Admin" role="admin" active="dashboard">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Admin</h1>
            <p className="muted">Approve sellers and keep an eye on money moving through Kobkart.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {!data && !error && <div className="db-loading">Loading...</div>}

        {data && (
          <>
            <div className="db-stats">
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Users size={22} /></span>
                <p>Users</p><b>{o.users}</b>
              </div>
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Store size={22} /></span>
                <p>Sellers</p><b>{o.sellers}</b>
                <small className={o.pending_sellers ? 'warn' : ''}>{o.pending_sellers} waiting for approval</small>
              </div>
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Wallet size={22} /></span>
                <p>Total volume</p><b>{naira(o.total_volume)}</b>
              </div>
              <div className="db-card db-stat">
                <span className="db-stat-icon"><Landmark size={22} /></span>
                <p>Your income</p><b className="red">{naira(o.platform_income)}</b>
                <small>Platform fees</small>
              </div>
            </div>

            <section className="db-card">
              <div className="db-card-head"><h2>Sellers</h2></div>
              <div className="tabs" style={{ marginBottom: 6 }}>
                {TABS.map(([k, label]) => (
                  <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
                ))}
              </div>
              <p className="muted small" style={{ margin: '10px 0 0' }}>
                Before approving: message them on WhatsApp, confirm their identity and ask about their past deliveries.
              </p>

              {sellers.length === 0 ? (
                <div className="db-empty">
                  <ShieldCheck size={30} />
                  <b>{tab === 'pending' ? 'No sellers waiting' : 'No sellers here'}</b>
                </div>
              ) : (
                sellers.map((s) => (
                  <div className="ad-row" key={s.user_id}>
                    <div className="ad-info">
                      <b>{s.business_name}</b>
                      <small>{s.full_name} • {s.phone}</small>
                      <small>{s.email}</small>
                      <div className="ad-badges">
                        <span className={`bd ${s.verified ? 'ontrack' : 'completed'}`}>{s.verified ? 'Approved' : 'Pending'}</span>
                        <span className={`bd ${s.payout_ready ? 'ontrack' : 'late'}`}>{s.payout_ready ? 'Payout ready' : 'No payout account'}</span>
                      </div>
                    </div>
                    <div className="row-actions">
                      <a
                        className="db-remind"
                        href={whatsappLink(s.phone, `Hello ${s.full_name}, this is Kobkart. We are reviewing your seller account for ${s.business_name}.`)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle size={15} /> WhatsApp
                      </a>
                      {s.verified ? (
                        <button className="db-btn sm danger" disabled={busy === s.user_id} onClick={() => setVerified(s, false)}>
                          Remove approval
                        </button>
                      ) : (
                        <button className="db-btn sm" disabled={busy === s.user_id} onClick={() => setVerified(s, true)}>
                          {busy === s.user_id ? 'Saving...' : 'Approve'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Recent payments</h2></div>
              {data.payments.length === 0 ? (
                <p className="muted small">No payments yet.</p>
              ) : (
                <div className="db-table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Amount</th><th>Your fee</th><th>Status</th><th>Reference</th></tr></thead>
                    <tbody>
                      {data.payments.slice(0, 15).map((r) => {
                        const [label, tone] = CHIP[r.status] || [r.status, 'completed']
                        return (
                          <tr key={r.id}>
                            <td>{shortDate(r.paid_at || r.created_at)}</td>
                            <td>{naira(r.amount)}</td>
                            <td>{naira(r.platform_fee)}</td>
                            <td><span className={`bd ${tone}`}>{label}</span></td>
                            <td>{r.reference.slice(-10)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}