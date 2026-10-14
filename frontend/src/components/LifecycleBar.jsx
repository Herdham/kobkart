import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Copy, RotateCcw } from 'lucide-react'
import { api } from '../api/http'

export default function LifecycleBar({ channel, onChanged }) {
  const nav = useNavigate()
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(() => api(`/seller/channels/${channel.id}/state`).then(setSt).catch(() => {}), [channel.id])
  useEffect(() => {
    load()
  }, [load])
  if (!st) return null

  async function archive(flag) {
    if (flag && !window.confirm('Archive this package? It disappears from Browse and takes no new people. All records and receipts are kept.')) return
    setBusy('a')
    setErr('')
    try {
      await api(`/seller/channels/${channel.id}/archive`, { method: 'PUT', body: { archived: flag } })
      await load()
      onChanged?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy('')
    }
  }

  async function clone() {
    setBusy('c')
    setErr('')
    try {
      const r = await api(`/seller/channels/${channel.id}/clone`, { method: 'POST' })
      nav(r.kind === 'rotation' ? `/groups/${r.id}` : `/packages/${r.id}`)
    } catch (e) {
      setErr(e.message)
      setBusy('')
    }
  }

  const finished = st.kind === 'rotation' && st.status === 'finished'
  return (
    <div className="lc">
      {finished && !st.archived && <div className="alert info">Every round has been collected. You can run this group again with the same settings, or archive it.</div>}
      {st.archived && <div className="alert info">Archived: hidden from Browse and closed to new people. Your records and receipts are kept.</div>}
      {err && <div className="alert">{err}</div>}
      <div className="fm-actions">
        <button className="db-btn sm ghost" disabled={busy === 'c'} onClick={clone}>
          {finished ? <><RotateCcw size={14} /> Run again</> : <><Copy size={14} /> Duplicate</>}
        </button>
        {st.archived ? (
          <button className="db-btn sm ghost" disabled={busy === 'a'} onClick={() => archive(false)}><ArchiveRestore size={14} /> Restore</button>
        ) : (
          <button className="db-btn sm ghost" disabled={!st.can_archive || busy === 'a'} onClick={() => archive(true)}><Archive size={14} /> Archive</button>
        )}
      </div>
      {!st.archived && !st.can_archive && st.reason && <small className="muted">{st.reason}</small>}
    </div>
  )
}