import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Users } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { naira, whatsappLink } from '../api/seller'
import './dashboard.css'

export default function Customers() {
  const nav = useNavigate()
  const [plans, setPlans] = useState(null)
  const [biz, setBiz] = useState('Seller')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([api('/seller/plans'), api('/seller/profile')])
      .then(([p, pr]) => {
        setPlans(p)
        setBiz(pr.business_name)
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  // one row per customer, even if they joined several items
  const byPhone = {}
  for (const p of plans || []) {
    const c = (byPhone[p.customer_phone] ||= { name: p.customer_name, phone: p.customer_phone, plans: 0, paid: 0, late: 0 })
    c.plans += 1
    c.paid += p.amount_paid
    if (p.late) c.late += 1
  }
  const q = search.trim().toLowerCase()
  const rows = Object.values(byPhone).filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q))

  return (
    <DashboardLayout name={biz} role="seller" active="customers" search={search} onSearch={setSearch}>
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Customers</h1>
            <p className="muted">Everyone who has joined one of your packages.</p>
          </div>
          {plans && <span className="bd completed">{Object.keys(byPhone).length} customer{Object.keys(byPhone).length === 1 ? '' : 's'}</span>}
        </div>

        {error && <div className="alert">{error}</div>}
        {!plans && !error && <div className="db-loading">Loading customers...</div>}

        {plans && (
          <section className="db-card">
            {rows.length === 0 ? (
              <div className="db-empty">
                <Users size={30} />
                <b>{plans.length ? 'No match found' : 'No customers yet'}</b>
                <p>{plans.length ? 'Try a different name or phone.' : 'Share a package link and your customers will show up here.'}</p>
              </div>
            ) : (
              <div className="db-table-wrap">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Phone</th><th>Items</th><th>Total paid</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.phone}>
                        <td><span className="db-row-name"><span className="db-mini-avatar">{c.name[0]}</span>{c.name}</span></td>
                        <td>{c.phone}</td>
                        <td>{c.plans}</td>
                        <td>{naira(c.paid)}</td>
                        <td><span className={`bd ${c.late ? 'late' : 'ontrack'}`}>{c.late ? `${c.late} late` : 'On track'}</span></td>
                        <td>
                          <a
                            className="db-remind"
                            href={whatsappLink(c.phone, `Hello ${c.name}, this is ${biz}. Thank you for being part of our packages on Kobkart!`)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle size={15} /> WhatsApp
                          </a>
                        </td>
                      </tr>
                    ))}
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