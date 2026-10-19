import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira } from '../api/seller'
import { startPayment } from '../api/customer'
import './dashboard.css'

export default function Basket() {
  const { planId } = useParams()
  const nav = useNavigate()
  const user = getSession()?.user
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 3200)
  }

  const load = useCallback(() => {
    api(`/baskets/${planId}`)
      .then(setData)
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [planId, nav])
  useEffect(() => {
    load()
  }, [load])

  async function setQty(it, q) {
    setBusy(it.id)
    try {
      await api(`/basket-items/${it.id}`, { method: 'PUT', body: { quantity: q } })
      load()
    } catch (e) {
      say(e.message)
    }
    setBusy('')
  }

  async function remove(it) {
    setBusy(it.id)
    try {
      await api(`/basket-items/${it.id}`, { method: 'DELETE' })
      load()
    } catch (e) {
      say(e.message)
    }
    setBusy('')
  }

  async function pay() {
    setBusy('pay')
    try {
      await startPayment(planId)
    } catch (e) {
      if (e.message) say(e.message) // an empty message means the transfer popup was opened
    }
    setBusy('')
  }

  const d = data
  const pct = d ? Math.min(100, Math.round((d.spent / d.budget) * 100)) : 0
  const paidPct = d ? Math.min(100, Math.round((d.paid / d.budget) * 100)) : 0
  const addMore = d && (d.channel.kind === 'rotation' ? `/groups/${d.channel.id}` : `/join/${d.channel.invite_code}`)

  return (
    <DashboardLayout name={user?.full_name} role="customer" active="orders">
      <div className="db-stack">
        <button className="db-link" onClick={() => nav('/my-orders')}><ArrowLeft size={14} /> My Orders</button>
        {error && <div className="alert">{error}</div>}
        {!d && !error && <div className="db-loading">Loading your basket...</div>}

        {d && (
          <>
            <div className="db-page-head">
              <div>
                <h1>My basket</h1>
                <p className="muted">{d.channel.name} • {d.channel.seller}</p>
              </div>
            </div>

            <section className="db-card">
              <div className="db-card-head"><h2>Your budget: {naira(d.budget)}</h2></div>
              <p className="small" style={{ margin: '0 0 8px' }}>
                Picked <b>{naira(d.spent)}</b> • <b>{naira(d.remaining)}</b> left
              </p>
              <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div>
              <p className="small" style={{ margin: '14px 0 8px' }}>
                Paid so far <b>{naira(d.paid)}</b> of {naira(d.budget)}
              </p>
              <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${paidPct}%` }} /></div><em>{paidPct}%</em></div>
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Items ({d.items.length})</h2></div>
              {d.items.length === 0 && <p className="muted small" style={{ margin: 0 }}>Your basket is empty. Add items to start.</p>}
              {d.items.map((it) => (
                <div className="bk-line" key={it.id}>
                  <div className="bk-info">
                    <b>{it.name}</b>
                    <small>
                      {[it.color, it.size].filter(Boolean).join(' • ')}
                      {[it.color, it.size].filter(Boolean).length > 0 && ' • '}
                      {naira(it.unit_price)} each
                    </small>
                    {it.note && <small>Note: {it.note}</small>}
                  </div>
                  <div className="bk-end">
                    <b>{naira(it.unit_price * it.quantity)}</b>
                    {d.editable && (
                      <div className="bk-qty">
                        <button disabled={busy === it.id} aria-label="Less" onClick={() => (it.quantity > 1 ? setQty(it, it.quantity - 1) : remove(it))}><Minus size={14} /></button>
                        <span>{it.quantity}</span>
                        <button disabled={busy === it.id} aria-label="More" onClick={() => setQty(it, it.quantity + 1)}><Plus size={14} /></button>
                        <button disabled={busy === it.id} aria-label="Remove" onClick={() => remove(it)}><Trash2 size={14} /></button>
                      </div>
                    )}
                    {!d.editable && <small>Qty {it.quantity}</small>}
                  </div>
                </div>
              ))}
              {d.items.length > 0 && <div className="bk-total"><span>Total picked</span><b>{naira(d.spent)}</b></div>}

              {d.remaining > 0 && d.items.length > 0 && (
                <div className="bk-left">
                  You still have <b>{naira(d.remaining)}</b> in your budget. Add more items, or if you leave it, you collect the {naira(d.remaining)} balance from <b>{d.channel.seller}</b> after delivery.
                </div>
              )}
              {d.remaining === 0 && d.items.length > 0 && <div className="bk-left">Your basket is full. If you want more items, please talk to your seller directly.</div>}
              {!d.editable && <div className="bk-left">This basket is locked. Please talk to your seller about any change.</div>}
            </section>

            <div className="row-actions">
              {d.editable && <Link className="db-btn" to={addMore}>Add more items</Link>}
              {d.status === 'active' && d.paid < d.budget && (
                <button className="db-btn ghost" disabled={busy === 'pay'} onClick={pay}>{busy === 'pay' ? 'Opening...' : 'Pay now'}</button>
              )}
            </div>
          </>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}