import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Users } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { shortDate, whatsappLink } from '../api/seller'
import './dashboard.css'

const ROLES = [['', 'Everyone'], ['customer', 'Customers'], ['seller', 'Sellers'], ['admin', 'Admins']]

export default function AdminUsers() {
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(() => {
    const qs = new URLSearchParams()
    if (role) qs.set('role', role)
    if (dq) qs.set('q', dq)
    return api(`/admin/users?${qs}`)
      .then(setRows)
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [role, dq, nav])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(u) {
    let reason = null
    if (!u.suspended) {
      reason = window.prompt(`Suspend ${u.full_name}? Write a short reason (only you will see it):`)
      if (reason === null) return
    } else if (!window.confirm(`Restore ${u.full_name}'s account?`)) return
    setBusy(u.id)
    try {
      await api(`/admin/users/${u.id}/suspend`, { method: 'PUT', body: { suspended: !u.suspended, reason } })
      say(u.suspended ? 'Account restored' : 'Account suspended')
      await load()
    } catch (e) {
      say(e.message)
    } finally {
      setBusy('')
    }
  }

  const suspendedCount = (rows || []).filter((u) => u.suspended).length

  return (
    <DashboardLayout name="Admin" role="admin" active="users">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Users</h1>
            <p className="muted">Find any account, contact the person, and suspend anyone who puts others at risk.</p>
          </div>
          {rows && <span className="bd completed">{rows.length} shown{suspendedCount ? ` • ${suspendedCount} suspended` : ''}</span>}
        </div>

        <input className="adm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or business" />
        <div className="tabs">
          {ROLES.map(([k, label]) => (
            <button key={k} className={role === k ? 'on' : ''} onClick={() => setRole(k)}>{label}</button>
          ))}
        </div>

        {error && <div className="alert">{error}</div>}
        {!rows && !error && <div className="db-loading">Loading users...</div>}

        {rows && (
          <section className="db-card">
            {rows.length === 0 ? (
              <div className="db-empty"><Users size={30} /><b>No users found</b></div>
            ) : (
              rows.map((u) => (
                <div className="ad-row" key={u.id}>
                  <div className="ad-info">
                    <b>{u.full_name}{u.business_name ? ` • ${u.business_name}` : ''}</b>
                    <small>{u.email} • {u.phone}</small>
                    <small>Joined {shortDate(u.created_at)}</small>
                    <div className="ad-badges">
                      <span className="bd completed">{u.role}</span>
                      <span className={`bd ${u.email_verified ? 'ontrack' : 'late'}`}>{u.email_verified ? 'Email verified' : 'Email not verified'}</span>
                      {u.suspended && <span className="bd defaulted">Suspended</span>}
                    </div>
                    {u.suspended && u.suspended_reason && <small style={{ color: 'var(--error)' }}>Reason: {u.suspended_reason}</small>}
                  </div>
                  <div className="row-actions">
                    <a className="db-remind" target="_blank" rel="noreferrer" href={whatsappLink(u.phone, `Hello ${u.full_name}, this is Kobkart support.`)}>
                      <MessageCircle size={15} /> WhatsApp
                    </a>
                    {u.role !== 'admin' && (
                      <button className={`db-btn sm ${u.suspended ? '' : 'danger'}`} disabled={busy === u.id} onClick={() => toggle(u)}>
                        {u.suspended ? 'Restore' : 'Suspend'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}