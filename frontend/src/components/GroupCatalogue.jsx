import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Package, Plus, Trash2 } from 'lucide-react'
import ImagePicker from './ImagePicker'
import { api, toKobo } from '../api/http'
import { naira } from '../api/seller'

const label = (c) => (c ? `${c.name}${c.color || c.size ? ` (${[c.color, c.size].filter(Boolean).join(', ')})` : ''}` : '')

export default function GroupCatalogue({ channelId, pot, owner, me, members, onChanged }) {
  const nav = useNavigate()
  const [products, setProducts] = useState(null)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', price: '' })
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(() => api(`/channels/${channelId}`).then((d) => setProducts(d.products)).catch(() => setProducts([])), [channelId])
  useEffect(() => {
    load()
  }, [load])
  if (!products) return null
  if (!owner && !me && products.length === 0) return null

  async function add(e) {
    e.preventDefault()
    setErr('')
    const price = Number(f.price)
    if (f.name.trim().length < 2) return setErr('Enter the item name')
    if (!price || price < 100) return setErr('Enter a price of at least ₦100')
    setBusy(true)
    try {
      await api(`/channels/${channelId}/products`, { method: 'POST', body: { name: f.name.trim(), price: toKobo(price), image_url: image } })
      setF({ name: '', price: '' })
      setImage(null)
      setOpen(false)
      setNote('Item added. Tap Edit on it to add colours, sizes and more photos.')
      await load()
      onChanged?.()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(p) {
    if (!window.confirm(`Remove "${p.name}" from the catalogue?`)) return
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <section className="db-card" id="catalogue">
      <div className="db-card-head">
        <h2>What the pot can buy</h2>
        {owner && <button className="db-btn sm" onClick={() => setOpen(!open)}><Plus size={14} /> Add item</button>}
      </div>

      {!owner && me && (
        <div className={`gc-note ${me.choice ? 'ok' : ''}`}>
          {me.choice ? <>Your pick: <b>{label(me.choice)}</b>. Tap another item to change it before you collect.</> : 'You have not chosen yet. Tap an item, pick a colour and size, and choose it for your turn.'}
        </div>
      )}
      {note && <div className="alert info">{note}</div>}
      {err && <div className="alert">{err}</div>}

      {owner && open && (
        <form className="fm" onSubmit={add} style={{ marginBottom: 16 }}>
          <ImagePicker value={image} onChange={setImage} onError={setErr} label="Add a photo (optional)" />
          <div className="fm-row">
            <label>Item name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Ankara 3-piece set" /></label>
            <label>Price (₦)<input type="number" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
          </div>
          <div className="fm-actions">
            <button className="db-btn sm" disabled={busy}>{busy ? 'Saving...' : 'Save item'}</button>
            <button type="button" className="db-btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      {products.length === 0 ? (
        <div className="db-empty"><Package size={30} /><b>No items yet</b><p>Add what members can choose from, so they know what the pot can buy.</p></div>
      ) : (
        <div className="prod-grid">
          {products.map((p) => {
            const mine = me?.choice?.product_id === p.id
            return (
              <div className="prod-card" key={p.id}>
                <Link to={`/product/${p.id}`} className="prod-link">
                  <div className="prod-img">{p.image_url ? <img src={p.image_url} alt="" /> : <Package size={30} />}</div>
                  <div className="prod-body">
                    <b>{p.name}</b>
                    <div className="price">{naira(p.price)}</div>
                    <small>{p.price <= pot ? 'Covered by the pot' : `Top up ${naira(p.price - pot)}`}</small>
                    {mine && <span className="bd ontrack" style={{ marginTop: 6 }}>Your pick</span>}
                  </div>
                </Link>
                {owner && (
                  <>
                    <button className="prod-edit" onClick={() => nav(`/products/${p.id}/edit`)}>Edit</button>
                    <button className="prod-x" onClick={() => remove(p)} aria-label="Remove item"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {owner && members.length > 0 && (
        <div className="gc-picks">
          <b>Members' picks</b>
          {members.map((m) => (
            <div key={m.id}><span>#{m.position} {m.name}</span><em>{m.choice ? label(m.choice) : 'not chosen yet'}</em></div>
          ))}
        </div>
      )}
    </section>
  )
}