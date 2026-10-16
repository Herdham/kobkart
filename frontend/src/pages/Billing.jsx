import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, MessageCircle } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate, whatsappLink } from '../api/seller'
import './dashboard.css'

const BLURB = {
  free: 'For a first group or a small shop.',
  standard: 'For a busy seller or one large group.',
  plus: 'For several large groups and packages.',
}

export default function Billing() {
  const nav = useNavigate()
  const user = getSession()?.user
  const boxRef = useRef(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [want, setWant] = useState('standard')
  const [toast, setToast] = useState('')

  useEffect(() => {
    api('/billing')
      .then(setData)
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2400)
  }

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

  function choose(p) {
    if (data.online) return upgrade(p.key)
    setWant(p.key)
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function copy(text, ok) {
    try {
      await navigator.clipboard.writeText(text)
      say(ok)
    } catch {
      say(text)
    }
  }

  const pct = data ? Math.min(100, Math.round((data.used / data.limit) * 100)) : 0
  const rank = (k) => ['free', 'standard', 'plus'].indexOf(k)
  const paid = data ? data.plans.filter((p) => p.price > 0) : []
  const chosen = paid.find((p) => p.key === want) || paid[0]
  const t = data?.transfer

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
                      <button className="db-btn" disabled={busy === p.key} onClick={() => choose(p)}>
                        {busy === p.key ? 'Opening...' : data.online ? (rank(p.key) > rank(data.plan) ? 'Upgrade' : 'Switch') : 'Pay by transfer'}
                      </button>
                    ) : null}
                  </section>
                )
              })}
            </div>

            {!data.online && (
              <section className="db-card" ref={boxRef}>
                <div className="db-card-head"><h2>Pay by bank transfer</h2></div>
                {!t ? (
                  <p className="muted small" style={{ margin: 0 }}>
                    Our bank details are not set up yet. Please message Kobkart support at kobkartsupport@gmail.com and we will help you.
                  </p>
                ) : (
                  <>
                    <div className="chips" style={{ marginBottom: 12 }}>
                      {paid.map((p) => (
                        <button key={p.key} type="button" className={`chip ${chosen?.key === p.key ? 'on' : ''}`} onClick={() => setWant(p.key)}>
                          {p.label} {naira(p.price)}
                        </button>
                      ))}
                    </div>
                    <div className="payout-box">
                      <div>
                        <b>{t.account_number}</b>
                        <small>{t.bank} • {t.account_name}</small>
                      </div>
                      <button className="db-btn ghost" onClick={() => copy(t.account_number, 'Account number copied')}><Copy size={15} /> Copy</button>
                    </div>
                    <ol className="tr-steps">
                      <li>Transfer <b>{naira(chosen.price)}</b> for one month of {chosen.label}. Pay exactly this amount. There is no extra charge for a transfer.</li>
                      <li>Put your email, <b>{user?.email}</b>, in the transfer description if your bank lets you.</li>
                      <li>Tap the button below and send us the receipt. We activate your plan the same day.</li>
                    </ol>
                    {t.whatsapp ? (
                      <a
                        className="db-btn"
                        target="_blank"
                        rel="noreferrer"
                        href={whatsappLink(t.whatsapp, `Hello Kobkart, I have paid ${naira(chosen.price)} for the ${chosen.label} plan (1 month). Name: ${user?.full_name}. Email: ${user?.email}.`)}
                      >
                        <MessageCircle size={16} /> I have paid, send receipt
                      </a>
                    ) : (
                      <p className="small" style={{ margin: 0 }}>After paying, email your receipt to kobkartsupport@gmail.com with your name and email.</p>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}