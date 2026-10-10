import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, MessageCircle } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { naira, shortDate, whatsappLink } from '../api/seller'
import './dashboard.css'

const TABS = [
  ['completed', 'Ready to deliver'],
  ['groups', 'Group collections'],
  ['active', 'Still paying'],
  ['delivered', 'Delivered'],
]

export default function Orders() {
  const nav = useNavigate()
  const [plans, setPlans] = useState(null)
  const [cols, setCols] = useState([])
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
      Promise.all([api('/seller/plans'), api('/seller/profile'), api('/seller/collections').catch(() => [])])
        .then(([p, pr, c]) => {
          setPlans(p)
          setBiz(pr.business_name)
          setCols(c)
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

  async function collected(c) {
    const key = `${c.channel_id}-${c.round_no}`
    if (!c.collected && !window.confirm(`Confirm that ${c.collector_name} has received goods worth ${naira(c.pot)}?`)) return
    setBusy(key)
    try {
      await api(`/rotation/${c.channel_id}/rounds/${c.round_no}/collected`, { method: 'PUT', body: { collected: !c.collected } })
      say(c.collected ? 'Marked as not collected' : 'Marked as collected')
      await load()
    } catch (e) {
      say(e.message)
    } finally {
      setBusy('')
    }
  }

  const today = new Date().toLocaleDateString('en-CA')
  const items = (plans || []).filter((p) => p.kind !== 'rotation')
  const q = search.trim().toLowerCase()
  const itemRows = items.filter(
    (p) => p.status === tab && `${p.customer_name} ${p.customer_phone} ${p.product_name}`.toLowerCase().includes(q)
  )
  const groupRows = cols.filter((c) => `${c.collector_name} ${c.collector_phone} ${c.channel_name}`.toLowerCase().includes(q))
  const dueNow = cols.filter((c) => !c.collected && c.due_date <= today).length
  const count = (k) => (k === 'groups' ? dueNow : items.filter((p) => p.status === k).length)

  const itemMsg = (p) =>
    p.status === 'completed'
      ? `Hello ${p.customer_name}, great news! Your ${p.product_name} from ${biz} is fully paid and ready. Please confirm where and when you would like to receive it.`
      : `Hello ${p.customer_name}, this is ${biz}. A friendly reminder about your ${p.product_name} contribution. Thank you!`

  return (
    <DashboardLayout name={biz} role="seller" active="orders" search={search} onSearch={setSearch}>
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Orders</h1>
            <p className="muted">Goods to hand over: fully paid items and group collections. All payments are on the Payments page.</p>
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
              {tab === 'groups' ? (
                groupRows.length === 0 ? (
                  <div className="db-empty">
                    <b>No group collections yet</b>
                    <p>When you start a group, each round appears here with who should collect.</p>
                  </div>
                ) : (
                  <div className="db-table-wrap">
                    <table>
                      <thead>
                        <tr><th>Group</th><th>Round</th><th>Collects</th><th>Phone</th><th>Pot</th><th>Paid in</th><th>Due</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {groupRows.map((c) => {
                          const key = `${c.channel_id}-${c.round_no}`
                          const state = c.collected ? ['Collected', 'ontrack'] : c.due_date <= today ? ['Due now', 'late'] : ['Upcoming', 'cancelled']
                          return (
                            <tr key={key}>
                              <td>{c.channel_name}</td>
                              <td>{c.round_no} of {c.member_count}</td>
                              <td>{c.collector_name}</td>
                              <td>{c.collector_phone}</td>
                              <td>{naira(c.pot)}</td>
                              <td>{c.paid_count}/{c.member_count}</td>
                              <td><span className={`bd ${state[1]}`}>{state[0]}</span> {shortDate(c.due_date)}</td>
                              <td>
                                <div className="row-actions">
                                  <button className={`db-btn sm ${c.collected ? 'ghost' : ''}`} disabled={busy === key} onClick={() => collected(c)}>
                                    <Check size={14} /> {c.collected ? 'Undo' : 'Mark collected'}
                                  </button>
                                  {!c.collected && (
                                    <a
                                      className="db-remind"
                                      target="_blank"
                                      rel="noreferrer"
                                      href={whatsappLink(c.collector_phone, `Hello ${c.collector_name}, it is your turn to collect for round ${c.round_no} of "${c.channel_name}" from ${biz}. Please tell me when you are ready to receive your goods.`)}
                                    >
                                      <MessageCircle size={15} /> WhatsApp
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : itemRows.length === 0 ? (
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
                      {itemRows.map((p) => (
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
                                <a className="db-remind" href={whatsappLink(p.customer_phone, itemMsg(p))} target="_blank" rel="noreferrer">
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