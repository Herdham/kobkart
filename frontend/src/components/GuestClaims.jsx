import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/http'
import { naira } from '../api/seller'

export default function GuestClaims() {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const load = useCallback(() => {
    api('/seller/guest-claims').then(setRows).catch(() => {})
  }, [])
  useEffect(() => {
    load()
  }, [load])
  if (!rows.length && !msg) return null

  async function act(id, what) {
    setBusy(id)
    setMsg('')
    try {
      await api(`/seller/guest-claims/${id}/${what}`, { method: 'POST', body: {} })
      load()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy('')
  }

  return (
    <section className="db-card">
      <div className="db-card-head"><h2>Members saying they paid ({rows.length})</h2></div>
      <p className="muted small" style={{ margin: '0 0 6px' }}>
        These came from your group status link. Check your bank alert, then confirm.
      </p>
      {rows.map((r) => (
        <div className="bk-line" key={r.id}>
          <div className="bk-info">
            <b>{r.name} • {naira(r.amount)}</b>
            <small>{r.group_name} • {r.sent}</small>
          </div>
          <div className="bk-end">
            <button className="db-btn sm" disabled={busy === r.id} onClick={() => act(r.id, 'confirm')}>Confirm</button>
            <button className="db-btn sm ghost" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>Not received</button>
          </div>
        </div>
      ))}
      {msg && <div className="alert" style={{ marginTop: 10 }}>{msg}</div>}
    </section>
  )
}