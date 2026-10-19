import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { api } from '../api/http'
import ImagePicker from './ImagePicker'

const CATS = [
  ['fashion', 'Fashion'], ['shoes_bags', 'Shoes & bags'], ['kitchen', 'Kitchen'], ['electronics', 'Electronics'],
  ['beauty', 'Beauty'], ['food', 'Food'], ['kids', 'Kids'], ['other', 'Other'],
]

export default function GroupEditor({ channel, kind, onChanged }) {
  const [open, setOpen] = useState(false)
  const [realKind, setRealKind] = useState('')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('other')
  const [img, setImg] = useState(null)
  const [members, setMembers] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const isGroup = (realKind || kind || channel.kind) === 'rotation'

  const loadMembers = () =>
    api(`/seller/groups/${channel.id}/members`).then((d) => setMembers(d.members)).catch(() => {})

  useEffect(() => {
    if (!open) return
    api(`/seller/channels/${channel.id}/details`)
      .then((d) => {
        setRealKind(d.kind)
        setName(d.name || '')
        setDesc(d.description || '')
        setCat(d.category || 'other')
        if (d.kind === 'rotation') loadMembers()
      })
      .catch(() => {})
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (pid, k, v) =>
    setMembers((ms) => ms.map((m) => (m.plan_id === pid ? { ...m, [k]: v, dirty: true } : m)))

  async function saveDetails() {
    setBusy('d')
    setMsg('')
    try {
      await api(`/seller/channels/${channel.id}/details`, {
        method: 'PUT',
        body: { name, description: desc, category: cat, image_url: img || undefined },
      })
      setMsg('Saved.')
      setImg(null)
      onChanged?.()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy('')
  }

  async function saveMember(m) {
    setBusy(m.plan_id)
    setMsg('')
    try {
      const body = { paid: Number(m.paid) }
      if (m.is_guest) {
        body.name = m.name || ''
        body.phone = m.phone || ''
      }
      await api(`/seller/groups/${channel.id}/members/${m.plan_id}`, { method: 'PUT', body })
      setMsg(`Saved ${m.name}.`)
      loadMembers()
      onChanged?.()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy('')
  }

  if (!open) {
    return (
      <button className="db-btn ghost sm" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
        <Pencil size={14} /> Edit {isGroup ? 'group & members' : 'package'}
      </button>
    )
  }

  return (
    <section className="db-card" style={{ marginTop: 12 }}>
      <div className="db-card-head">
        <h2>Edit {isGroup ? 'group' : 'package'}</h2>
        <button className="db-btn sm ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="bk-ctl" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
        <small className="muted">Cover photo</small>
        <ImagePicker value={img} onChange={setImg} onError={setMsg} label="Change cover photo" />
        <small className="muted">Name</small>
        <input className="adm-search" style={{ height: 42 }} value={name} onChange={(e) => setName(e.target.value)} />
        <small className="muted">Description</small>
        <textarea className="pp-note" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Tell people what this is about" />
        <small className="muted">Category</small>
        <select className="adm-search" style={{ height: 42 }} value={cat} onChange={(e) => setCat(e.target.value)}>
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="bk-row">
          <button className="db-btn sm" disabled={busy === 'd'} onClick={saveDetails}>{busy === 'd' ? 'Saving...' : 'Save details'}</button>
        </div>
      </div>

      {isGroup && (
        <>
          <div className="db-card-head" style={{ marginTop: 18 }}><h2>Members ({members.length})</h2></div>
          <p className="muted small" style={{ margin: '0 0 6px' }}>
            Change how many rounds each person has paid, then tap Save on that row. Collection rounds and Who has paid update straight away.
          </p>
          {members.map((m) => (
            <div className="bk-line" key={m.plan_id}>
              <div className="bk-info">
                <b>#{m.position}{m.collected ? ' • Collected' : ''}</b>
                {m.is_guest ? (
                  <>
                    <input className="adm-search" style={{ height: 40, marginTop: 6 }} value={m.name || ''} onChange={(e) => setField(m.plan_id, 'name', e.target.value)} />
                    <input className="adm-search" style={{ height: 40, marginTop: 6 }} placeholder="Phone (optional)" value={m.phone || ''} onChange={(e) => setField(m.plan_id, 'phone', e.target.value)} />
                  </>
                ) : (
                  <small>{m.name} (has an account)</small>
                )}
              </div>
              <div className="bk-end">
                <small>Rounds paid (of {members.length})</small>
                <input
                  className="adm-search"
                  style={{ height: 40, width: 80, textAlign: 'center' }}
                  inputMode="numeric"
                  value={m.paid}
                  onChange={(e) => setField(m.plan_id, 'paid', e.target.value.replace(/[^0-9]/g, ''))}
                />
                <button className="db-btn sm" disabled={busy === m.plan_id || !m.dirty} onClick={() => saveMember(m)}>
                  {busy === m.plan_id ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      {msg && <div className="alert info" style={{ marginTop: 10 }}>{msg}</div>}
    </section>
  )
}
