import { useCallback, useEffect, useState } from 'react'
import { Check, MessageCircle, X } from 'lucide-react'
import { api } from '../api/http'
import { socialUrl } from '../api/links'
import { timeAgo } from '../api/customer'
import { whatsappLink } from '../api/seller'

const LINKS = [['Instagram', 'instagram'], ['Facebook', 'facebook'], ['X', 'x_handle'], ['Website', 'website']]

export default function JoinRequests({ channel, onChanged }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(() => api(`/rotation/${channel.id}/requests`).then(setData).catch(() => {}), [channel.id])
  useEffect(() => {
    load()
  }, [load])
  if (!data) return null
  const open = channel.status === 'open'
  if (!open && data.requests.length === 0) return null

  async function setMode(mode) {
    setBusy('mode')
    setErr('')
    try {
      await api(`/rotation/${channel.id}/join-mode`, { method: 'PUT', body: { mode } })
      await load()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  async function act(r, kind) {
    if (kind === 'decline' && !window.confirm(`Decline ${r.name}? They will be told by email.`)) return
    setBusy(r.id)
    setErr('')
    try {
      await api(`/rotation/${channel.id}/requests/${r.id}/${kind}`, { method: 'POST' })
      await load()
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  const n = data.requests.length
  return (
    <section className="db-card">
      <div className="db-card-head">
        <h2>New members</h2>
        {n > 0 && <span className="db-count">{n} waiting</span>}
      </div>

      {open && (
        <div className="jr-opts">
          <label className={`jr-opt ${data.mode === 'approval' ? 'on' : ''}`}>
            <input type="radio" name="mode" checked={data.mode === 'approval'} disabled={busy === 'mode'} onChange={() => setMode('approval')} />
            <span><b>I approve each new member</b><small>People who find the group send a request. A request does not take a seat until you approve it.</small></span>
          </label>
          <label className={`jr-opt ${data.mode === 'open' ? 'on' : ''}`}>
            <input type="radio" name="mode" checked={data.mode === 'open'} disabled={busy === 'mode'} onChange={() => setMode('open')} />
            <span><b>Anyone with the link joins instantly</b><small>Seats are taken in the order people join. Good when you only shared the link with your own people.</small></span>
          </label>
        </div>
      )}
      {err && <div className="alert">{err}</div>}

      {n === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>No requests waiting.</p>
      ) : (
        data.requests.map((r) => (
          <div className="jr-row" key={r.id}>
            <div className="jr-top">
              <div>
                <b>{r.name}</b>
                <small className="muted" style={{ display: 'block' }}>{r.phone}{r.location ? ` • ${r.location}` : ''} • asked {timeAgo(r.created_at)}</small>
                <div className="ad-links">
                  {LINKS.map(([label, key]) => (r[key] ? <a key={key} href={socialUrl(key, r[key])} target="_blank" rel="noreferrer noopener">{label}</a> : null))}
                  {!r.instagram && !r.facebook && !r.x_handle && !r.website && <span className="muted">No social link</span>}
                </div>
              </div>
              <div className="row-actions">
                <a className="db-remind" target="_blank" rel="noreferrer" href={whatsappLink(r.phone, `Hello ${r.name}, this is ${channel.name}'s organizer on Kobkart. You asked to join the group. How do you know about it?`)}>
                  <MessageCircle size={15} /> Ask
                </a>
                <button className="db-btn sm" disabled={busy === r.id || !open} onClick={() => act(r, 'approve')}><Check size={14} /> Approve</button>
                <button className="db-btn sm danger" disabled={busy === r.id} onClick={() => act(r, 'decline')}><X size={14} /> Decline</button>
              </div>
            </div>
          </div>
        ))
      )}
    </section>
  )
}