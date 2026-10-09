import { useState } from 'react'
import { Globe } from 'lucide-react'
import { api } from '../api/http'
import { CATEGORIES } from '../api/categories'

export default function ListingToggle({ channel, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save(body) {
    setBusy(true)
    setErr('')
    try {
      await api(`/seller/channels/${channel.id}`, { method: 'PUT', body })
      await onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lt">
      <label className="lt-row">
        <input type="checkbox" checked={!!channel.is_public} disabled={busy} onChange={(e) => save({ is_public: e.target.checked })} />
        <span>
          <b><Globe size={14} /> List on Kobkart's Browse page</b>
          <small>
            {channel.is_public
              ? 'Anyone on Kobkart can find and join this package. It needs at least one product.'
              : 'Private: only people with your link or code can join.'}
          </small>
        </span>
      </label>
      <label className="lt-cat">
        Category
        <select value={channel.category} disabled={busy} onChange={(e) => save({ category: e.target.value })}>
          {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      {err && <div className="alert">{err}</div>}
    </div>
  )
}