import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, MessageCircle } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { naira, whatsappLink } from '../api/seller'
import './dashboard.css'

const TABS = [
  ['completed', 'Ready to deliver'],
  ['active', 'Still paying'],
  ['delivered', 'Delivered'],
]

export default function Orders() {
  const nav = useNavigate()
  const [plans, setPlans] = useState(null)
  const [biz, setBiz] = useState('Seller')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('completed')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  const load = useCallback(
    () =>
      Promise.all([api('/seller/plans'), api('/seller/profile')])
        .then(([p, pr]) => {
          setPlans(p)
          setBiz(pr.business_name)
        })
        .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message))),
    [nav]
  )

  useEffect(() => {
    load()
  }, [load])

  async function deliver(p) {
    if (!window.confirm(`Mark "${p.product_name}" for ${p.customer_name} as delivered?`)) return
    setBusy(p.id)
    try {
      await api(`/plans/${p.id}/delivered`, { method: 'PUT' })
      say('Marked as delivered')
      await load()
    } catch (e) {
      say(e.message)
    } finally {
      setBusy('')
    }
  }

  const all = (plans || []).filter((p) => p.kind !== 'rotation')
  const count = (k) => all.filter((p) => p.status === k).length
  const q = search.trim().toLowerCase()
  const rows = all.filter(
    (p) => p.status === tab && `${p.customer_name} ${p.customer_phone} ${p.product_name}`.toLowerCase().includes(q)
  )

  const msg = (p) =>
    p.status === 'completed'
      ? `Hello ${p.customer_name}, great news! Your ${p.product_name} from ${biz} is fully paid and ready. Please confirm where and when you would like to receive it.`
      : `Hello ${p.customer_name}, this is ${biz}. A friendly reminder about your ${p.product_name} contribution. Thank you!`

  return (
    <DashboardLayout name={biz} role="seller" active="orders" search={search} onSearch={setSearch}>
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Orders</h1>
            <p className="muted">Items your customers have fully paid for, ready for you to deliver.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {!plans && !error && <div className="db-loading">Loading orders...</div>}

        {plans && (
          <>
            <div className="tabs">
              {TABS.map(([k, label]) => (
                <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {label}<em>{count(k)}</em>
                </button>
              ))}
            </div>

            <section className="db-card">
              {rows.length === 0 ? (
                <div className="db-empty">
                  <b>{tab === 'completed' ? 'Nothing to deliver yet' : 'Nothing here'}</b>
                  <p>
                    {tab === 'completed'
                      ? 'When a customer finishes paying for an item, it appears here.'
                      : 'Orders in this tab will show up here.'}
                  </p>
                </div>
              ) : (
                <div className="db-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Customer</th><th>Phone</th><th>Item</th><th>Paid</th><th>Package</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id}>
                          <td>{p.customer_name}</td>
                          <td>{p.customer_phone}</td>
                          <td>{p.product_name}</td>
                          <td>{naira(p.amount_paid)} / {naira(p.locked_price)}</td>
                          <td>{p.channel_name}</td>
                          <td>
                            <div className="row-actions">
                              {p.status === 'completed' && (
                                <button className="db-btn sm" disabled={busy === p.id} onClick={() => deliver(p)}>
                                  <Check size={14} /> {busy === p.id ? 'Saving...' : 'Mark delivered'}
                                </button>
                              )}
                              {p.status !== 'delivered' && (
                                <a className="db-remind" href={whatsappLink(p.customer_phone, msg(p))} target="_blank" rel="noreferrer">
                                  <MessageCircle size={15} /> WhatsApp
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
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