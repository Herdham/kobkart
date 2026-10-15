import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate } from '../api/seller'
import './dashboard.css'

const BLURB = {
  free: 'For a first group or a small shop.',
  standard: 'For a busy seller or one large group.',
  plus: 'For several large groups and packages.',
}

export default function Billing() {
  const nav = useNavigate()
  const user = getSession()?.user
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    api('/billing')
      .then(setData)
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  async function upgrade(plan) {
    setBusy(plan)
    setNote('')
    try {
      const r = await api('/billing/checkout', { method: 'POST', body: { plan } })
      window.location.href = r.authorization_url
    } catch (e) {
      setNote(e.message)
      setBusy('')
    }
  }

  const pct = data ? Math.min(100, Math.round((data.used / data.limit) * 100)) : 0
  const rank = (k) => ['free', 'standard', 'plus'].indexOf(k)

  return (
    <DashboardLayout name={user?.full_name} role="seller" active="billing">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Plan &amp; billing</h1>
            <p className="muted">Kobkart takes nothing from your customers' payments. You pay only for the plan that fits how many people you manage.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {!data && !error && <div className="db-loading">Loading...</div>}

        {data && (
          <>
            <section className="db-card">
              <div className="db-card-head">
                <h2>Your plan: {data.plans.find((p) => p.key === data.plan)?.label}</h2>
                {data.plan !== 'free' && data.expires_at && <span className="bd ontrack">Active until {shortDate(data.expires_at)}</span>}
              </div>
              <p className="small" style={{ margin: '0 0 8px' }}>
                <b>{data.used}</b> of <b>{data.limit}</b> active members used
              </p>
              <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div>
              <p className="muted small" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
                An active member is anyone still paying in one of your packages or groups. People who have finished paying stop counting.
                If your plan ends or you reach your limit, existing members, receipts and payments keep working. You just cannot add new people until you upgrade.
              </p>
              {data.stored_plan !== 'free' && data.plan === 'free' && (
                <div className="alert" style={{ marginTop: 12 }}>Your {data.stored_plan} plan has ended, so you are back on Free. Renew below to add more people.</div>
              )}
            </section>

            {note && <div className="alert">{note}</div>}
            {!data.online && (
              <div className="warn-card">
                Online payment for plans opens soon. To upgrade now, pay by bank transfer and message Kobkart support at kobkartsupport@gmail.com. We activate your plan the same day.
              </div>
            )}

            <div className="plans-grid">
              {data.plans.map((p) => {
                const current = p.key === data.plan
                return (
                  <section className={`db-card plan-card ${current ? 'now' : ''}`} key={p.key}>
                    <h3>{p.label}</h3>
                    <div className="plan-price">{p.price ? naira(p.price) : 'Free'}{p.price > 0 && <small> / month</small>}</div>
                    <p className="muted small" style={{ margin: 0 }}>{BLURB[p.key]}</p>
                    <ul>
                      <li><Check size={14} /> Up to {p.limit} active members</li>
                      <li><Check size={14} /> Online payments and receipts</li>
                      <li><Check size={14} /> Record payments and import lists</li>
                    </ul>
                    {p.price > 0 && data.online && <small className="muted">You pay {naira(p.charge)}. That covers the card fee, so Kobkart receives {naira(p.price)}.</small>}
                    {current ? (
                      <span className="bd ontrack">Current plan</span>
                    ) : p.price > 0 ? (
                      <button className="db-btn" disabled={busy === p.key} onClick={() => upgrade(p.key)}>
                        {busy === p.key ? 'Opening...' : rank(p.key) > rank(data.plan) ? 'Upgrade' : 'Switch'}
                      </button>
                    ) : null}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}