import { useState } from 'react'
import { api } from '../api/http'
import { shortDate } from '../api/seller'

export default function PlanControl({ s, onDone }) {
  const [plan, setPlan] = useState(s.plan || 'free')
  const [months, setMonths] = useState(1)
  const [paid, setPaid] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    if (!window.confirm(`Set ${s.business_name} to ${plan}${plan === 'free' ? '' : ` for ${months} month(s)`}${plan !== 'free' && !paid ? ' (comped, no payment)' : ''}?`)) return
    setBusy(true)
    setMsg('')
    try {
      await api(`/admin/sellers/${s.user_id}/plan`, { method: 'PUT', body: { plan, months, paid } })
      setMsg('Saved')
      await onDone?.()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pc">
      <small>
        Plan: <b>{s.plan}</b>{s.plan_expires_at ? ` until ${shortDate(s.plan_expires_at)}` : ''} • {s.used} active member{s.used === 1 ? '' : 's'}
      </small>
      <div className="pc-row">
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="free">Free</option>
          <option value="standard">Standard</option>
          <option value="plus">Plus</option>
        </select>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} disabled={plan === 'free'}>
          {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
        </select>
        <label className="imp-cl"><input type="checkbox" checked={paid} disabled={plan === 'free'} onChange={(e) => setPaid(e.target.checked)} /> Paid</label>
        <button className="db-btn sm ghost" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Set plan'}</button>
      </div>
      {msg && <small className="muted">{msg}</small>}
    </div>
  )
}