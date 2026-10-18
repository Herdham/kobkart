import { useCallback, useEffect, useState } from 'react'
import { Check, MessageCircle, X } from 'lucide-react'
import { api } from '../api/http'
import { naira, whatsappLink } from '../api/seller'

const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} day(s) ago`
}

export default function PendingTransfers() {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    api('/claims').then(setRows).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function act(id, what) {
    setBusy(id)
    setMsg('')
    try {
      await api(`/claims/${id}/${what}`, { method: 'POST' })
      setMsg(what === 'confirm' ? 'Payment recorded. Refresh the page to see updated totals.' : 'Marked as not received.')
      load()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy('')
  }

  if (!rows.length && !msg) return null

  return (
    <section className="db-card">
      <div className="db-card-head"><h2>Transfers to confirm ({rows.length})</h2></div>
      <p className="muted small" style={{ margin: '0 0 6px' }}>
        These customers say they paid you by bank transfer. Check your bank app first, then confirm.
      </p>
      {msg && <div className="alert" style={{ margin: '8px 0' }}>{msg}</div>}
      {rows.map((r) => (
        <div className="ad-row" key={r.id}>
          <div className="ad-info">
            <b>{r.full_name} • {naira(r.amount)}</b>
            <small>{r.kind === 'rotation' ? r.channel_name : r.product_name || r.channel_name} • {ago(r.created_at)}</small>
          </div>
          <div className="row-actions">
            <button className="db-btn sm" disabled={busy === r.id} onClick={() => act(r.id, 'confirm')}><Check size={14} /> Confirm</button>
            <button className="db-btn sm danger" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}><X size={14} /> Not received</button>
            <a className="db-btn sm ghost" target="_blank" rel="noreferrer" href={whatsappLink(r.phone, `Hello ${r.full_name}, I have not seen your ${naira(r.amount)} transfer yet. Please send the receipt.`)}>
              <MessageCircle size={14} />
            </a>
          </div>
        </div>
      ))}
    </section>
  )
}