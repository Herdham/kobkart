import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate } from '../api/seller'
import './dashboard.css'

const CHIP = { success: ['Paid', 'ontrack'], pending: ['Pending', 'completed'], failed: ['Failed', 'late'] }

export default function Contributions() {
  const nav = useNavigate()
  const user = getSession()?.user
  const [rows, setRows] = useState(null)
  const [plans, setPlans] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/payments'), api('/plans')])
      .then(([p, pl]) => {
        setRows(p)
        setPlans(pl)
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const names = Object.fromEntries(plans.map((p) => [p.id, p.product_name]))
  const total = (rows || []).filter((r) => r.status === 'success').reduce((a, r) => a + r.amount, 0)

  return (
    <DashboardLayout name={user?.full_name} role="customer" active="contributions">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>My Contributions</h1>
            <p className="muted">Every payment you have made on Kobkart.</p>
          </div>
          {rows && <span className="bd completed">Total paid: {naira(total)}</span>}
        </div>

        {error && <div className="alert">{error}</div>}
        {!rows && !error && <div className="db-loading">Loading...</div>}

        {rows && (
          <section className="db-card">
            {rows.length === 0 ? (
              <div className="db-empty">
                <Receipt size={30} />
                <b>No payments yet</b>
                <p>When you pay for a package, your receipts will appear here.</p>
              </div>
            ) : (
              <div className="db-table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const [label, tone] = CHIP[r.status] || [r.status, 'completed']
                      return (
                        <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/plans/${r.plan_id}`)}>
                          <td>{shortDate(r.paid_at || r.created_at)}</td>
                          <td>{names[r.plan_id] || '-'}</td>
                          <td>{naira(r.amount)}</td>
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
        )}
      </div>
    </DashboardLayout>
  )
}