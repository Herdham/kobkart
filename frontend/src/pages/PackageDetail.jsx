import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Copy, Link2, MessageCircle, Package, Plus, Trash2, UserPlus } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import ImagePicker from '../components/ImagePicker'
import ListingToggle from '../components/ListingToggle'
import { api, toKobo } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate, whatsappLink } from '../api/seller'
import { packageList } from '../api/whatsappList'
import './dashboard.css'

export default function PackageDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const me = getSession()?.user
  const [data, setData] = useState(null)
  const [plans, setPlans] = useState([])
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(params.get('add') === '1')
  const [form, setForm] = useState({ name: '', price: '', description: '' })
  const [image, setImage] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [guest, setGuest] = useState({ open: false, product_id: '', name: '', phone: '' })
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  const load = useCallback(async () => {
    try {
      const [d, p, pr] = await Promise.all([api(`/channels/${id}`), api('/seller/plans'), api('/seller/profile')])
      setData(d)
      setPlans(p.filter((x) => x.channel_id === id))
      setProfile(pr)
    } catch (e) {
      if (e.status === 401) nav('/login', { replace: true })
      else setError(e.status === 404 ? 'Package not found' : e.message)
    }
  }, [id, nav])

  useEffect(() => {
    load()
  }, [load])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const bizName = profile?.business_name || me?.full_name || 'Seller'
  const ch = data?.channel
  const link = ch ? `${window.location.origin}/join/${ch.invite_code}` : ''

  const copyText = async (text, ok) => {
    try {
      await navigator.clipboard.writeText(text)
      say(ok)
    } catch {
      say(text)
    }
  }

  async function addProduct(e) {
    e.preventDefault()
    setFormError('')
    const price = Number(form.price)
    if (form.name.trim().length < 2) return setFormError('Enter the product name')
    if (!price || price < 100) return setFormError('Enter a price of at least ₦100')
    setSaving(true)
    try {
      await api(`/channels/${id}/products`, {
        method: 'POST',
        body: { name: form.name.trim(), description: form.description.trim() || null, price: toKobo(price), image_url: image },
      })
      setForm({ name: '', price: '', description: '' })
      setImage(null)
      setShowAdd(false)
      say('Product added')
      load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeProduct(p) {
    if (!window.confirm(`Remove "${p.name}" from this package? People already paying for it are not affected.`)) return
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' })
      say('Product removed')
      load()
    } catch (err) {
      say(err.message)
    }
  }

  async function addGuest(e) {
    e.preventDefault()
    const product_id = guest.product_id || data.products[0]?.id
    if (!product_id) return say('Add a product first')
    setBusy('guest')
    try {
      await api('/seller/guest-plans', { method: 'POST', body: { product_id, name: guest.name, phone: guest.phone } })
      setGuest({ open: false, product_id: '', name: '', phone: '' })
      say('Customer added')
      await load()
    } catch (err) {
      say(err.message)
    } finally {
      setBusy('')
    }
  }

  async function recordPayment(p) {
    const raw = window.prompt(`How much did ${p.customer_name} pay for "${p.product_name}"? Enter the amount in naira:`, String(p.installment_amount / 100))
    if (raw === null) return
    const amount = Number(raw.replace(/,/g, ''))
    if (!amount || amount < 100) return say('Enter an amount of at least ₦100')
    const method = (window.prompt('How did they pay? Type transfer, cash or other:', 'transfer') || '').trim().toLowerCase()
    if (!method) return
    setBusy('rp' + p.id)
    try {
      await api('/seller/payments/manual', { method: 'POST', body: { plan_id: p.id, amount: toKobo(amount), method } })
      say('Payment recorded')
      await load()
    } catch (err) {
      say(err.message)
    } finally {
      setBusy('')
    }
  }

  let body = null
  if (error) body = <div className="alert">{error}</div>
  else if (!data) body = <div className="db-loading">Loading...</div>
  else if (ch.seller_id !== me?.id) body = <div className="alert">This package belongs to another seller.</div>
  else {
    const wa = `https://wa.me/?text=${encodeURIComponent(
      `Join my "${ch.name}" package on Kobkart and pay ${naira(ch.contribution_amount)} every ${ch.frequency_days} days: ${link}`
    )}`
    body = (
      <div className="db-stack">
        <button className="db-link" onClick={() => nav('/packages')}><ArrowLeft size={14} /> All packages</button>

        <section className="db-card pd-head">
          <div className="pd-cover">{ch.image_url ? <img src={ch.image_url} alt="" /> : <Package size={36} />}</div>
          <div className="pd-info">
            <h1>{ch.name}</h1>
            <p>{naira(ch.contribution_amount)} every {ch.frequency_days} day{ch.frequency_days > 1 ? 's' : ''} • {plans.length} participant{plans.length === 1 ? '' : 's'}</p>
            {ch.description && <p>{ch.description}</p>}
            <span className="pd-code">Code: {ch.invite_code}</span>
            <div className="pd-actions">
              <button className="db-btn" onClick={() => copyText(link, 'Link copied')}><Link2 size={16} /> Copy link</button>
              <button className="db-btn ghost" onClick={() => copyText(packageList(ch, plans, link), 'WhatsApp list copied. Paste it in your group.')}><Copy size={16} /> Copy WhatsApp list</button>
              <a className="db-btn ghost" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Share on WhatsApp</a>
            </div>
            <ListingToggle channel={ch} onSaved={load} />
          </div>
        </section>

        <section className="db-card">
          <div className="db-card-head">
            <h2>Products</h2>
            <button className="db-btn" onClick={() => setShowAdd(!showAdd)}><Plus size={16} /> Add Product</button>
          </div>

          {showAdd && (
            <form className="fm" onSubmit={addProduct} style={{ marginBottom: 20 }}>
              {formError && <div className="alert">{formError}</div>}
              <ImagePicker value={image} onChange={setImage} onError={setFormError} label="Add a product photo" />
              <label>Product name
                <input value={form.name} onChange={set('name')} placeholder="e.g. Ankara 3-piece set" />
              </label>
              <label>Full price (₦)
                <input type="number" inputMode="numeric" min="100" value={form.price} onChange={set('price')} placeholder="20000" />
                <small>
                  {form.price && Number(form.price) > 0
                    ? `Customers will finish paying in ${Math.ceil((Number(form.price) * 100) / ch.contribution_amount)} payments (about ${Math.ceil((Number(form.price) * 100) / ch.contribution_amount) * ch.frequency_days} days).`
                    : 'The price is locked when a customer joins, so inflation does not change it for them.'}
                </small>
              </label>
              <label>Description (optional)
                <textarea value={form.description} onChange={set('description')} placeholder="Size, colour, what is included..." />
              </label>
              <div className="fm-actions">
                <button className="db-btn" disabled={saving}>{saving ? 'Saving...' : 'Save product'}</button>
                <button type="button" className="db-btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          )}

          {data.products.length === 0 ? (
            <div className="db-empty">
              <Package size={30} />
              <b>No products yet</b>
              <p>Add what customers can pick from, with a price and photo.</p>
            </div>
          ) : (
            <div className="prod-grid">
              {data.products.map((p) => {
                const n = Math.ceil(p.price / ch.contribution_amount)
                return (
                  <div className="prod-card" key={p.id}>
                    <div className="prod-img">{p.image_url ? <img src={p.image_url} alt="" /> : <Package size={30} />}</div>
                    <button className="prod-x" onClick={() => removeProduct(p)} aria-label="Remove product"><Trash2 size={15} /></button>
                    <div className="prod-body">
                      <b>{p.name}</b>
                      <div className="price">{naira(p.price)}</div>
                      <small>{n} payment{n === 1 ? '' : 's'} • about {n * ch.frequency_days} days</small>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="db-card">
          <div className="db-card-head"><h2>Participants</h2></div>

          {data.products.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {guest.open ? (
                <form className="fm" onSubmit={addGuest}>
                  <p className="muted small" style={{ margin: 0 }}>
                    For a customer who has not signed up. After you add them, send them their personal link so they can use their own account.
                  </p>
                  <label>Item
                    <select value={guest.product_id || data.products[0].id} onChange={(e) => setGuest({ ...guest, product_id: e.target.value })}>
                      {data.products.map((p) => <option key={p.id} value={p.id}>{p.name} ({naira(p.price)})</option>)}
                    </select>
                  </label>
                  <div className="fm-row">
                    <label>Name<input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></label>
                    <label>Phone<input type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
                  </div>
                  <div className="fm-actions">
                    <button className="db-btn sm" disabled={busy === 'guest'}>{busy === 'guest' ? 'Adding...' : 'Add customer'}</button>
                    <button type="button" className="db-btn sm ghost" onClick={() => setGuest({ open: false, product_id: '', name: '', phone: '' })}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="db-btn sm ghost" onClick={() => setGuest({ ...guest, open: true })}>
                  <UserPlus size={14} /> Add someone without an account
                </button>
              )}
            </div>
          )}

          {plans.length === 0 ? (
            <div className="db-empty">
              <b>No participants yet</b>
              <p>Share the link above, or add people from your WhatsApp list.</p>
            </div>
          ) : (
            <div className="db-table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Phone</th><th>Product</th><th>Paid</th><th>Status</th><th>Next due</th><th>Actions</th></tr></thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td>{p.customer_name} {p.is_guest && <span className="bd cancelled">No account</span>}</td>
                      <td>{p.customer_phone}</td>
                      <td>{p.product_name}</td>
                      <td>{naira(p.amount_paid)} / {naira(p.locked_price)}</td>
                      <td><span className={`bd ${p.late ? 'late' : p.status === 'active' ? 'ontrack' : 'completed'}`}>{p.late ? 'Late' : p.status === 'active' ? 'On track' : p.status}</span></td>
                      <td>{p.status === 'active' ? shortDate(p.next_due_date) : '-'}</td>
                      <td>
                        <div className="row-actions">
                          {p.status === 'active' && (
                            <button className="db-btn sm ghost" disabled={busy === 'rp' + p.id} onClick={() => recordPayment(p)}>Record payment</button>
                          )}
                          {p.is_guest && p.claim_token && (
                            <button
                              className="ic-btn"
                              aria-label="Copy link for this person"
                              title="Copy a link so this person can use their own account"
                              onClick={() => copyText(`${window.location.origin}/claim/${p.claim_token}`, `Link copied. Send it only to ${p.customer_name}.`)}
                            >
                              <Link2 size={15} />
                            </button>
                          )}
                          {p.status === 'active' && p.customer_phone && (
                            <a
                              className="db-remind"
                              target="_blank"
                              rel="noreferrer"
                              href={whatsappLink(p.customer_phone, `Hello ${p.customer_name}, this is ${bizName}. A friendly reminder about your ${naira(p.installment_amount)} contribution for ${p.product_name}. Thank you!`)}
                            >
                              <MessageCircle size={15} /> Remind
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <DashboardLayout name={bizName} role="seller" active="packages">
      {body}
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}