import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Package, Plus } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import ImagePicker from '../components/ImagePicker'
import { api, toKobo } from '../api/http'
import { getSession } from '../api/auth'
import { naira } from '../api/seller'
import { CATEGORIES } from '../api/categories'
import './dashboard.css'

export default function Packages() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [show, setShow] = useState(params.get('new') === '1')
  const [form, setForm] = useState({ kind: 'save', name: '', description: '', amount: '', days: '5', slots: '20', category: 'fashion', pub: true })
  const [image, setImage] = useState(null)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api('/seller/channels'), api('/seller/plans'), api('/seller/profile')])
      .then(([channels, plans, profile]) => setData({ channels, plans, profile }))
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const bizName = data?.profile?.business_name || getSession()?.user?.full_name || 'Seller'
  const verified = data?.profile?.verified
  const group = form.kind === 'rotation'
  const pot = Number(form.amount) * Number(form.slots)

  async function create(e) {
    e.preventDefault()
    setFormError('')
    const amount = Number(form.amount)
    if (form.name.trim().length < 2) return setFormError('Enter a package name')
    if (!amount || amount < 100) return setFormError('The minimum contribution is ₦100')
    if (group && !(Number(form.slots) >= 2 && Number(form.slots) <= 100)) return setFormError('Group size must be between 2 and 100')
    setSaving(true)
    try {
      const ch = await api('/seller/channels', {
        method: 'POST',
        body: {
          kind: form.kind,
          slots: group ? Number(form.slots) : null,
          name: form.name.trim(),
          description: form.description.trim() || null,
          contribution_amount: toKobo(amount),
          frequency_days: Number(form.days),
          image_url: image,
          category: form.category,
          is_public: form.pub,
        },
      })
      nav(group ? `/groups/${ch.id}` : `/packages/${ch.id}?add=1`)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim().toLowerCase()
  const list = (data?.channels || []).filter((c) => c.name.toLowerCase().includes(q))

  return (
    <DashboardLayout name={bizName} role="seller" active="packages" search={search} onSearch={setSearch}>
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Packages</h1>
            <p className="muted">Create a package your customers can join, either to save for an item or as a rotating group.</p>
          </div>
          <button className="db-btn" disabled={!verified} onClick={() => setShow(!show)}>
            <Plus size={16} /> Create Package
          </button>
        </div>

        {error && <div className="alert">{error}</div>}
        {data && !verified && (
          <div className="warn-card">
            Your seller account is waiting for approval from Kobkart. You can create packages as soon as you are verified.
          </div>
        )}

        {show && verified && (
          <section className="db-card">
            <div className="db-card-head"><h2>New package</h2></div>
            {formError && <div className="alert">{formError}</div>}
            <form className="fm" onSubmit={create}>
              <div className="kind-pick">
                <button type="button" className={!group ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, kind: 'save' }))}>
                  <b>Save &amp; Collect</b>
                  <small>Each customer picks an item and pays until it is fully paid, then receives it.</small>
                </button>
                <button type="button" className={group ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, kind: 'rotation' }))}>
                  <b>Group Rotation</b>
                  <small>A fixed group pays every round. Each round one member collects the full pot as goods, in the order you set.</small>
                </button>
              </div>

              <ImagePicker value={image} onChange={setImage} onError={setFormError} label="Add a cover photo (optional)" />
              <label>Package name
                <input value={form.name} onChange={set('name')} placeholder={group ? 'e.g. 2k every 5 days, shoes and bags' : 'e.g. September Clothing Package'} />
              </label>
              <label>Description (optional)
                <textarea value={form.description} onChange={set('description')} placeholder={group ? 'What can members collect? Any rules?' : 'What is this package about?'} />
              </label>
              <label>Category
                <select value={form.category} onChange={set('category')}>
                  {CATEGORIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
              <div className="fm-row">
                <label>{group ? 'Contribution per round (₦)' : 'Contribution (₦)'}
                  <input type="number" inputMode="numeric" min="100" value={form.amount} onChange={set('amount')} placeholder="1000" />
                </label>
                <label>{group ? 'A round every' : 'Pay every'}
                  <select value={form.days} onChange={set('days')}>
                    {[1, 3, 5, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
                  </select>
                </label>
              </div>
              {group && (
                <>
                  <label>Group size (number of members)
                    <input type="number" inputMode="numeric" min="2" max="100" value={form.slots} onChange={set('slots')} />
                  </label>
                  <small className="muted">
                    {pot > 0 ? `When full, the pot each round is ${naira(pot * 100)}. ` : ''}
                    You set the collection order and start date after members join.
                  </small>
                </>
              )}
              {!group && <small className="muted">Every customer pays this amount on this schedule until their product is fully paid.</small>}
              <label className="chk">
                <input type="checkbox" checked={form.pub} onChange={(e) => setForm((f) => ({ ...f, pub: e.target.checked }))} />
                <span>
                  List on Kobkart's Browse page
                  <small>New customers can find your package. Turn this off for a private group that joins only with your link.</small>
                </span>
              </label>
              <div className="fm-actions">
                <button className="db-btn" disabled={saving}>{saving ? 'Creating...' : group ? 'Create group' : 'Create & add products'}</button>
                <button type="button" className="db-btn ghost" onClick={() => setShow(false)}>Cancel</button>
              </div>
            </form>
          </section>
        )}

        {!data && !error && <div className="db-loading">Loading packages...</div>}

        {data && list.length === 0 && (
          <section className="db-card db-empty-pkg">
            <Package size={34} />
            <h2>{data.channels.length ? 'No match found' : 'No packages yet'}</h2>
            <p>{data.channels.length ? 'Try a different name.' : 'Create your first package to start collecting contributions.'}</p>
          </section>
        )}

        <div className="pk-grid">
          {list.map((c) => {
            const mine = data.plans.filter((p) => p.channel_id === c.id)
            const paid = mine.reduce((a, p) => a + p.amount_paid, 0)
            const target = mine.reduce((a, p) => a + p.locked_price, 0)
            const pct = target ? Math.round((paid / target) * 100) : 0
            const isGroup = c.kind === 'rotation'
            return (
              <button className="pk-card" key={c.id} onClick={() => nav(isGroup ? `/groups/${c.id}` : `/packages/${c.id}`)}>
                <div className="pk-img">
                  {c.image_url ? <img src={c.image_url} alt="" /> : <Package size={34} />}
                  <span className={`pk-pub ${c.is_public ? '' : 'off'}`}>{c.is_public ? 'Public' : 'Private'}</span>
                  {isGroup && <span className="bp-kind">Group</span>}
                </div>
                <div className="pk-body">
                  <h3>{c.name}</h3>
                  <p>{naira(c.contribution_amount)} every {c.frequency_days} day{c.frequency_days > 1 ? 's' : ''}</p>
                  <div className="pk-meta">
                    <span>{isGroup ? `${mine.length}/${c.slots} members` : `${mine.length} participant${mine.length === 1 ? '' : 's'}`}</span>
                    <span>{naira(paid)} collected</span>
                  </div>
                  <div className="db-bar-row"><div className="db-bar"><i style={{ width: `${pct}%` }} /></div><em>{pct}%</em></div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}