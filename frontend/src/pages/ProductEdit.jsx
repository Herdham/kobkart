import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Plus, X } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { API, api, compressImage, toKobo } from '../api/http'
import { getSession } from '../api/auth'
import './dashboard.css'

const QUICK_SIZES = ['S', 'M', 'L', 'XL', 'XXL']

function OptionEditor({ title, hint, items, setItems, input, setInput, quick, onRemove }) {
  const add = (label) => {
    const l = label.trim()
    if (!l || items.some((x) => x.label.toLowerCase() === l.toLowerCase())) return
    setItems([...items, { label: l, sold_out: false }])
    setInput('')
  }
  return (
    <section className="db-card">
      <div className="db-card-head"><h2>{title}</h2></div>
      <p className="muted small" style={{ margin: '0 0 10px' }}>{hint}</p>
      {items.length > 0 && (
        <div className="pe-list">
          {items.map((it, i) => (
            <div className="pe-item" key={it.label}>
              <b>{it.label}</b>
              <label className="imp-cl">
                <input type="checkbox" checked={it.sold_out} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, sold_out: e.target.checked } : x)))} /> Sold out
              </label>
              <button type="button" className="ic-btn bad" aria-label={`Remove ${it.label}`} onClick={() => { setItems(items.filter((_, j) => j !== i)); onRemove?.(it.label) }}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="pe-add-row">
        <input className="adm-search" style={{ height: 42 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type and tap Add" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input) } }} />
        <button type="button" className="db-btn sm" onClick={() => add(input)}><Plus size={14} /> Add</button>
      </div>
      {quick && (
        <div className="chips" style={{ marginTop: 10 }}>
          {quick.filter((q) => !items.some((x) => x.label === q)).map((q) => (
            <button type="button" key={q} className="chip" onClick={() => add(q)}>{q}</button>
          ))}
        </div>
      )}
    </section>
  )
}

export default function ProductEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const me = getSession()?.user
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [f, setF] = useState(null)
  const [colors, setColors] = useState([])
  const [sizes, setSizes] = useState([])
  const [images, setImages] = useState([])
  const [newColor, setNewColor] = useState('')
  const [newSize, setNewSize] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    api(`/products/${id}`)
      .then((d) => {
        setData(d)
        setF({ name: d.product.name, brand: d.product.brand || '', price: String(d.product.price / 100), description: d.product.description || '' })
        setColors(d.colors)
        setSizes(d.sizes)
        setImages(d.images.map((im) => ({ id: im.id, color: im.color || '' })))
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.status === 404 ? 'Item not found' : e.message)))
  }, [id, nav])

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const back = () => (data?.package.kind === 'rotation' ? `/groups/${data.package.id}` : `/packages/${data.package.id}`)

  async function addPhotos(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    const out = []
    for (const file of files.slice(0, 6 - images.length)) {
      try {
        out.push({ data: await compressImage(file), color: '' })
      } catch (err) {
        say(err.message)
      }
    }
    setImages((x) => [...x, ...out])
  }

  const makeCover = (i) => setImages((x) => [x[i], ...x.filter((_, j) => j !== i)])

  async function save() {
    setSaving(true)
    try {
      await api(`/products/${id}`, {
        method: 'PUT',
        body: {
          name: f.name,
          brand: f.brand,
          description: f.description,
          price: toKobo(f.price),
          colors,
          sizes,
          images: images.map((im) => (im.id ? { id: im.id, color: im.color || null } : { data: im.data, color: im.color || null })),
        },
      })
      nav(back())
    } catch (e) {
      say(e.message)
      setSaving(false)
    }
  }

  let body
  if (error) body = <div className="alert">{error}</div>
  else if (!data || !f) body = <div className="db-loading">Loading...</div>
  else if (data.package.seller_id !== me?.id) body = <div className="alert">This item belongs to another seller.</div>
  else {
    body = (
      <div className="db-stack">
        <button className="db-link" onClick={() => nav(back())}><ArrowLeft size={14} /> Back to package</button>
        <div className="db-page-head">
          <div>
            <h1>Edit item</h1>
            <p className="muted">Everything here is optional except the name and price.</p>
          </div>
          <button className="db-btn" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button>
        </div>

        <section className="db-card">
          <div className="fm">
            <label>Item name<input value={f.name} onChange={set('name')} /></label>
            <div className="fm-row">
              <label>Brand (optional)<input value={f.brand} onChange={set('brand')} placeholder="e.g. Nike, or your own label" /></label>
              <label>Price (₦)<input type="number" inputMode="numeric" value={f.price} onChange={set('price')} /></label>
            </div>
            <small className="muted">Customers who already joined keep the price they locked in. A new price applies to new customers only.</small>
            <label>Description<textarea value={f.description} onChange={set('description')} placeholder="Material, fit, what is included..." /></label>
          </div>
        </section>

        <OptionEditor
          title="Colours"
          hint="Add every colour you have. Tick Sold out to grey one out without deleting it."
          items={colors}
          setItems={setColors}
          input={newColor}
          setInput={setNewColor}
          onRemove={(label) => setImages((x) => x.map((im) => (im.color === label ? { ...im, color: '' } : im)))}
        />
        <OptionEditor title="Sizes" hint="Clothes: S, M, L. Shoes: 40, 41, 42. Leave empty if it does not apply." items={sizes} setItems={setSizes} input={newSize} setInput={setNewSize} quick={QUICK_SIZES} />

        <section className="db-card">
          <div className="db-card-head"><h2>Photos ({images.length}/6)</h2></div>
          <p className="muted small" style={{ margin: '0 0 10px' }}>The first photo is the cover. Tag a photo with its colour so customers jump to it when they pick that colour.</p>
          <div className="pe-photos">
            {images.map((im, i) => (
              <div className="pe-photo" key={im.id || `new-${i}`}>
                <img src={im.data || `${API}/product-images/${im.id}`} alt="" />
                {i === 0 ? <span className="cover">Cover</span> : <button type="button" className="cover btn" onClick={() => makeCover(i)}>Make cover</button>}
                <button type="button" className="x" aria-label="Remove photo" onClick={() => setImages((x) => x.filter((_, j) => j !== i))}><X size={14} /></button>
                <select value={im.color} onChange={(e) => setImages((x) => x.map((y, j) => (j === i ? { ...y, color: e.target.value } : y)))}>
                  <option value="">No colour tag</option>
                  {colors.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
              </div>
            ))}
            {images.length < 6 && (
              <label className="pe-add">
                <ImagePlus size={24} />
                <span>Add photos</span>
                <input type="file" accept="image/*" multiple hidden onChange={addPhotos} />
              </label>
            )}
          </div>
        </section>

        <div className="fm-actions">
          <button className="db-btn" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save changes'}</button>
          <button className="db-btn ghost" onClick={() => nav(back())}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout name={me?.full_name} role="seller" active="packages">
      {body}
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}