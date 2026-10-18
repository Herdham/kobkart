import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Package, Pencil, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo'
import { API, api } from '../api/http'
import { getSession } from '../api/auth'
import { naira } from '../api/seller'
import './dashboard.css'

export default function ProductPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const session = getSession()
  const role = session?.user?.role
  const trackRef = useRef(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [mine, setMine] = useState([])
  const [grp, setGrp] = useState(null)
  const [member, setMember] = useState(null)
  const [color, setColor] = useState(params.get('color') || '')
  const [size, setSize] = useState(params.get('size') || '')
  const [idx, setIdx] = useState(0)
  const [sheet, setSheet] = useState(false)
  const [joining, setJoining] = useState(false)
  const [msg, setMsg] = useState('')
  const [qty, setQty] = useState(Math.min(50, Math.max(1, Number(params.get('qty')) || 1)))
  const [note, setNote] = useState(params.get('note') || '')

  useEffect(() => {
    api(`/products/${id}`)
      .then(setData)
      .catch((e) => setError(e.status === 404 ? 'This item is no longer available.' : e.message))
    if (role === 'customer') {
      api('/plans')
        .then((p) => setMine(p.filter((x) => x.product_id === id && ['active', 'completed'].includes(x.status))))
        .catch(() => {})
    }
  }, [id, role])

  // extra information for items that belong to a group
  useEffect(() => {
    if (!data || data.package.kind !== 'rotation') return
    api(`/channels/code/${data.package.invite_code}`).then((d) => setGrp(d.rotation)).catch(() => {})
    if (role === 'customer') {
      api(`/rotation/${data.package.id}`)
        .then((d) => setMember(d.members.find((m) => m.is_me) || null))
        .catch(() => setMember(null))
    }
  }, [data, role])

  // coming back after sign up (Save & Collect): reopen the confirmation with the same choices
  useEffect(() => {
    if (!data || data.package.kind === 'rotation' || params.get('join') !== '1' || role !== 'customer') return
    const needColor = data.colors.length > 0 && !color
    const needSize = data.sizes.length > 0 && !size
    if (!needColor && !needSize) setSheet(true)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <header className="jn-top">
      <Logo />
      <div className="jn-links">
        {session ? <Link to="/dashboard" className="plain">My dashboard</Link> : (
          <>
            <Link to="/login" className="plain">Log In</Link>
            <Link to="/register" className="db-btn">Sign Up</Link>
          </>
        )}
      </div>
    </header>
  )

  if (error) return <div className="jn">{header}<main className="jn-wrap"><div className="alert">{error}</div></main></div>
  if (!data) return <div className="jn">{header}<main className="jn-wrap"><div className="db-loading">Loading item...</div></main></div>

  const { product: p, package: ch, colors, sizes, images } = data
  const isGroup = ch.kind === 'rotation'
  const total = p.price * qty
  const each = Math.min(ch.contribution_amount, total)
  const payCount = Math.ceil(total / Math.max(ch.contribution_amount, 1))
  const pot = grp?.pot || 0
  const isOwner = session?.user?.id === ch.seller_id
  const need = colors.length && !color ? 'Choose a colour' : sizes.length && !size ? 'Choose a size' : ''
  const current = member?.choice?.product_id === id ? member.choice : null

  const onScroll = () => {
    const el = trackRef.current
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth))
  }
  const pickColor = (label) => {
    setColor(label)
    setMsg('')
    const i = images.findIndex((im) => (im.color || '').toLowerCase() === label.toLowerCase())
    if (i >= 0 && trackRef.current) trackRef.current.scrollTo({ left: i * trackRef.current.clientWidth, behavior: 'smooth' })
  }

  const nextPath = () =>
    `/product/${id}?join=1${color ? `&color=${encodeURIComponent(color)}` : ''}${size ? `&size=${encodeURIComponent(size)}` : ''}&qty=${qty}${note ? `&note=${encodeURIComponent(note)}` : ''}`
  const remember = () => localStorage.setItem('kobkart_next', JSON.stringify({ path: nextPath(), at: Date.now() }))

  function start() {
    if (need) return setMsg(need)
    setMsg('')
    setSheet(true)
  }

  async function confirm() {
    setJoining(true)
    setMsg('')
    try {
      await api('/catalog/join', { method: 'POST', body: { product_id: id, color: color || null, size: size || null, quantity: qty, note: note || null } })
      nav('/my-orders', { replace: true })
    } catch (e) {
      setMsg(e.message)
    } finally {
      setJoining(false)
    }
  }

  async function choose() {
    if (need) return setMsg(need)
    setJoining(true)
    setMsg('')
    try {
      await api(`/rotation/${ch.id}/choice`, { method: 'PUT', body: { product_id: id, color: color || null, size: size || null } })
      nav(`/groups/${ch.id}`, { replace: true })
    } catch (e) {
      setMsg(e.message)
    } finally {
      setJoining(false)
    }
  }

  let action
  if (isOwner) action = <Link className="db-btn ghost" to={`/products/${id}/edit`}><Pencil size={15} /> Edit item</Link>
  else if (isGroup) {
    if (role === 'customer' && member) action = <button className="db-btn" disabled={joining} onClick={choose}>{joining ? 'Saving...' : current ? 'Update my pick' : 'Choose for my turn'}</button>
    else if (session && role !== 'customer') action = <span className="muted small">Log in as a customer to join</span>
    else action = <Link className="db-btn" to={`/join/${ch.invite_code}`}>Join the group first <ArrowRight size={16} /></Link>
  } else if (ch.closed) action = <span className="muted small">Not taking new people</span>
  else if (session && role !== 'customer') action = <span className="muted small">Log in as a customer to join</span>
  else action = <button className="db-btn" onClick={start}>Join with this <ArrowRight size={16} /></button>

  return (
    <div className="jn">
      {header}
      <main className="pp">
        <div className="gal">
          {images.length === 0 ? (
            <div className="gal-track"><div className="gal-slide"><Package size={44} /></div></div>
          ) : (
            <div className="gal-track" ref={trackRef} onScroll={onScroll}>
              {images.map((im) => (
                <div className="gal-slide" key={im.id}>
                  <img src={`${API}/product-images/${im.id}`} alt={p.name} loading="lazy" />
                </div>
              ))}
            </div>
          )}
          {images.length > 1 && <div className="gal-dots">{images.map((im, i) => <i key={im.id} className={i === idx ? 'on' : ''} />)}</div>}
          <div className="gal-cap">{images[idx]?.color || ''}</div>
        </div>

        <div className="pp-info">
          {p.brand && <p className="pp-brand">{p.brand}</p>}
          <h1>{p.name}</h1>
          <div className="pp-price">{naira(p.price)}</div>
          {!isGroup && qty > 1 && <p className="muted small" style={{ margin: '2px 0 0' }}>{qty} × {naira(p.price)} = <b>{naira(total)}</b></p>}
          {isGroup ? (
            <p className="muted small" style={{ margin: 0 }}>
              {grp ? `The group pot is ${naira(pot)} each round. ` : ''}
              {grp && (p.price <= pot ? 'This item is covered by the pot.' : `The pot covers ${naira(pot)}, so you would add ${naira(p.price - pot)} yourself.`)}
            </p>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              Pay {naira(each)} every {ch.frequency_days} day{ch.frequency_days > 1 ? 's' : ''} • {payCount} payment{payCount === 1 ? '' : 's'} • about {payCount * ch.frequency_days} days
            </p>
          )}

          {colors.length > 0 && (
            <OptionPicker title="Colour" items={colors} value={color} setValue={(v) => { setColor(v); setMsg('') }} onPick={pickColor} placeholder="Type the colour you want" />
          )}
          {sizes.length > 0 && (
            <OptionPicker title="Size" items={sizes} value={size} setValue={(v) => { setSize(v); setMsg('') }} onPick={(l) => { setSize(l); setMsg('') }} placeholder="Type the size you want" />
          )}

          {!isGroup && !isOwner && !ch.closed && (
            <div className="opt">
              <b>Quantity</b>
              <div className="qty">
                <button type="button" aria-label="Less" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
                <span>{qty}</span>
                <button type="button" aria-label="More" onClick={() => setQty((n) => Math.min(50, n + 1))}>+</button>
              </div>
              <b style={{ display: 'block', marginTop: 16 }}>Note to the seller <small className="muted">(optional)</small></b>
              <textarea
                className="pp-note"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything the seller should know, for example: my shoe size is 44"
              />
            </div>
          )}

          {p.description && <p style={{ margin: '18px 0 0', fontSize: 14.5, lineHeight: 1.7 }}>{p.description}</p>}

          <div className="pp-seller">
            <span>Sold by <b>{ch.seller}</b></span>
            {ch.seller_verified && <span className="bd ontrack"><ShieldCheck size={13} style={{ marginRight: 4 }} />Verified seller</span>}
            <Link to={`/join/${ch.invite_code}`} className="link-strong">{isGroup ? 'About this group' : 'More from this package'} <ArrowRight size={14} /></Link>
          </div>

          {!isGroup && mine.length > 0 && (
            <div className="alert info" style={{ marginTop: 14 }}>
              You already have this item in <Link to="/my-orders" className="link-strong">My Orders</Link>. Joining again adds another order, for example in a different colour or size.
            </div>
          )}
          {isGroup && current && (
            <div className="alert info" style={{ marginTop: 14 }}>
              This is your current pick{current.color || current.size ? ` (${[current.color, current.size].filter(Boolean).join(', ')})` : ''}. You can change it until you collect.
            </div>
          )}
          {isGroup && role === 'customer' && !member && !isOwner && (
            <div className="alert info" style={{ marginTop: 14 }}>You can choose this item for your turn once you have joined the group.</div>
          )}
          {msg && !sheet && <div className="alert" style={{ marginTop: 14 }}>{msg}</div>}
        </div>
      </main>

      <div className="pp-bar">
        <div>
          <b>{naira(isGroup ? p.price : total)}</b>
          <small>{isGroup ? (grp ? `Group pot ${naira(pot)}` : 'Group item') : `${payCount} payments of ${naira(each)}`}</small>
        </div>
        {action}
      </div>

      {sheet && !isGroup && (
        <>
          <div className="jn-sheet-bg" onClick={() => setSheet(false)} />
          <div className="jn-sheet">
            {!session ? (
              <>
                <h3>Create a free account to join</h3>
                <p className="muted small">It takes a minute. We will bring you back here with {color || size ? `${[color, size].filter(Boolean).join(', ')} selected` : 'your choices'}.</p>
                <div className="fm-actions" style={{ marginTop: 14 }}>
                  <Link to="/register" className="db-btn" onClick={remember}>Sign Up <ArrowRight size={16} /></Link>
                  <Link to="/login" className="db-btn ghost" onClick={remember}>Log In</Link>
                </div>
              </>
            ) : (
              <>
                <h3>Join "{p.name}"?</h3>
                <div className="jn-sum">
                  {color && <div><span>Colour</span><b>{color}</b></div>}
                  {size && <div><span>Size</span><b>{size}</b></div>}
                  {qty > 1 && <div><span>Quantity</span><b>{qty} × {naira(p.price)}</b></div>}
                  {note && <div><span>Your note</span><b>{note}</b></div>}
                  <div><span>Total price (locked)</span><b>{naira(total)}</b></div>
                  <div><span>You pay</span><b>{naira(each)} every {ch.frequency_days} days</b></div>
                  <div><span>Number of payments</span><b>{payCount}</b></div>
                </div>
                {msg && <div className="alert">{msg}</div>}
                <div className="fm-actions">
                  <button className="db-btn" onClick={confirm} disabled={joining}>{joining ? 'Joining...' : 'Confirm & join'}</button>
                  <button className="db-btn ghost" onClick={() => setSheet(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
// The seller's list as chips, plus an "Other" chip so customers can type their own.
function OptionPicker({ title, items, value, setValue, onPick, placeholder }) {
  const listed = items.some((x) => x.label.toLowerCase() === value.toLowerCase())
  const [other, setOther] = useState(!!value && !listed)
  return (
    <div className="opt">
      <b>{title}{value ? `: ${value}` : ''}</b>
      <div className="chips">
        {items.map((c) => (
          <button key={c.label} type="button" disabled={c.sold_out} className={`chip ${!other && value === c.label ? 'on' : ''}`} onClick={() => { setOther(false); onPick(c.label) }}>
            {c.label}{c.sold_out && <small>Sold out</small>}
          </button>
        ))}
        <button type="button" className={`chip ${other ? 'on' : ''}`} onClick={() => { setOther(true); setValue('') }}>Other</button>
      </div>
      {other && (
        <input className="adm-search" style={{ height: 42, marginTop: 10 }} maxLength={30} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}
