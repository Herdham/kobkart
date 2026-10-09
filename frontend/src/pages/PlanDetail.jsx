import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Package } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { daysUntil, naira, shortDate } from '../api/seller'
import { dueLabel, startPayment } from '../api/customer'
import './dashboard.css'

const CHIP = { success: ['Paid', 'ontrack'], pending: ['Pending', 'completed'], failed: ['Failed', 'late'] }

export default function PlanDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = getSession()?.user
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    api(`/plans/${id}`)
      .then(setData)
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.status === 404 ? 'Package not found' : e.message)))
  }, [id, nav])

  async function pay() {
    setPaying(true)
    try {
      await startPayment(id)
    } catch (e) {
      setToast(e.message)
      setTimeout(() => setToast(''), 2800)
      setPaying(false)
    }
  }

  const p = data?.plan
  let body = null
  if (error) body = <div className="alert">{error}</div>
  else if (!data) body = <div className="db-loading">Loading...</div>
  else {
    const pct = p.locked_price ? Math.round((p.amount_paid / p.locked_price) * 100) : 0
    body = (
      <div className="db-stack">
        <button className="db-link" onClick={() => nav('/dashboard')}><ArrowLeft size={14} /> Back to dashboard</button>

        <section className="db-card pd-head">
          <div className="pd-cover">{p.image_url ? <img src={p.image_url} alt="" /> : <Package size={36} />}</div>
          <div className="pd-info">
            <h1>{p.product_name}</h1>
            <p>{p.channel_name} • sold by {p.seller_name}</p>
            <p><b>{naira(p.locked_price)}</b> (price locked) • {naira(p.installment_amount)} every {p.frequency_days} days</p>
            <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div>
            <p className="small" style={{ marginTop: 8 }}>
              {p.payments_made} of {p.payments_total} payments • {naira(p.amount_paid)} paid • {naira(p.remaining)} left
            </p>
            {p.status === 'active' ? (
              <>
                <p className="small">Next payment: {shortDate(p.next_due_date)} ({dueLabel(daysUntil(p.next_due_date))})</p>
                <div className="pd-actions">
                  <button className="db-btn" disabled={paying} onClick={pay}>
                    {paying ? 'Opening...' : `Pay ${naira(Math.min(p.installment_amount, p.remaining))} now`}
                  </button>
                </div>
              </>
            ) : (
              <span className="bd completed">
                {p.status === 'delivered' ? 'Delivered' : p.status === 'completed' ? 'Fully paid. Your seller will arrange delivery.' : p.status}
              </span>
            )}
          </div>
        </section>

        <section className="db-card">
          <div className="db-card-head"><h2>Payment history</h2></div>
          {data.payments.length === 0 ? (
            <div className="db-empty"><b>No payments yet</b><p>Your receipts will appear here.</p></div>
          ) : (
            <div className="db-table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Reference</th><th></th></tr></thead>
                <tbody>
                  {data.payments.map((x) => {
                    const [label, tone] = CHIP[x.status] || [x.status, 'completed']
                    return (
                      <tr key={x.id}>
                        <td>{shortDate(x.paid_at || x.created_at)}</td>
                        <td>{naira(x.amount)}</td>
                        <td><span className={`bd ${tone}`}>{label}</span></td>
                        <td>{x.reference.slice(-10)}</td>
                        <td>
                          {x.status === 'pending' && (
                            <button className="db-link" onClick={() => nav(`/payment/callback?reference=${x.reference}`)}>Check status</button>
                          )}
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
    )
  }

  return (
    <DashboardLayout name={user?.full_name} role="customer" active="dashboard">
      {body}
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}