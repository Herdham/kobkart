import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { naira, shortDate } from '../api/seller'
import PendingTransfers from '../components/PendingTransfers'
import PendingTransfers from '../components/PendingTransfers'
import './dashboard.css'

const CHIP = { success: ['Paid', 'ontrack'], pending: ['Pending', 'completed'], failed: ['Failed', 'late'] }

export default function SellerPayments() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [biz, setBiz] = useState('Seller')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(
    () =>
      Promise.all([api('/payments'), api('/seller/plans'), api('/seller/profile')])
        .then(([payments, plans, pr]) => {
          setData({ payments, plans })
          setBiz(pr.business_name)
        })
        .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message))),
    [nav]
  )

  useEffect(() => {
    load()
  }, [load])

  async function voidPayment(r) {
    if (!window.confirm(`Void this ${naira(r.amount)} payment you recorded? The member's balance goes back up.`)) return
    setBusy(r.id)
    try {
      await api(`/seller/payments/${r.id}/void`, { method: 'POST' })
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const rows = data?.payments || []
  const byPlan = Object.fromEntries((data?.plans || []).map((p) => [p.id, p]))
  const ok = rows.filter((r) => r.status === 'success')
  const gross = ok.reduce((a, r) => a + r.amount, 0)
  const fees = ok.reduce((a, r) => a + r.platform_fee, 0)
  const pending = rows.filter((r) => r.status === 'pending').length

  return (
    <DashboardLayout name={biz} role="seller" active="payments">
      <div className="db-stack">
        <PendingTransfers />
        <PendingTransfers />
        <div className="db-page-head">
          <div>
            <h1>Payments</h1>
            <p className="muted">Every payment into your packages, online and the ones you recorded yourself.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {!data && !error && <div className="db-loading">Loading payments...</div>}

        {data && (
          <>
            <div className="mini-stats">
              <div className="db-card db-stat"><p>Total collected</p><b className="red">{naira(gross)}</b></div>
              <div className="db-card db-stat"><p>Kobkart fee</p><b>{naira(fees)}</b></div>
              <div className="db-card db-stat"><p>You receive</p><b>{naira(gross - fees)}</b><small>Online payments also lose Paystack's processing charge.</small></div>
              <div className="db-card db-stat"><p>Pending</p><b>{pending}</b></div>
            </div>

            <section className="db-card">
              {rows.length === 0 ? (
                <div className="db-empty">
                  <Wallet size={30} />
                  <b>No payments yet</b>
                  <p>When customers pay, or you record a payment, it shows here.</p>
                </div>
              ) : (
                <div className="db-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Customer</th><th>Item</th><th>Amount</th><th>Fee</th><th>Status</th><th>Method</th><th>Reference</th><th></th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const plan = byPlan[r.plan_id]
                        const [label, tone] = CHIP[r.status] || [r.status, 'completed']
                        const manual = r.method && r.method !== 'online'
                        return (
                          <tr key={r.id}>
                            <td>{shortDate(r.paid_at || r.created_at)}</td>
                            <td>{plan?.customer_name || '-'}</td>
                            <td>{plan?.product_name || '-'}</td>
                            <td>{naira(r.amount)}</td>
                            <td>{naira(r.platform_fee)}</td>
                            <td><span className={`bd ${tone}`}>{label}</span></td>
                            <td>{manual ? `Recorded (${r.method})` : 'Online'}</td>
                            <td>{r.reference.slice(-10)}</td>
                            <td>
                              {manual && r.status === 'success' && (
                                <button className="db-btn sm danger" disabled={busy === r.id} onClick={() => voidPayment(r)}>Void</button>
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
          </>
        )}
      </div>
    </DashboardLayout>
  )
}