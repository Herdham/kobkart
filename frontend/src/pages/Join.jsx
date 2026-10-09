import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, Package, ShieldCheck } from 'lucide-react'
import Logo from '../components/Logo'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate } from '../api/seller'
import './dashboard.css'

export default function Join() {
  const { code } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const session = getSession()
  const role = session?.user?.role
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [pick, setPick] = useState(null)
  const [joining, setJoining] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!code) return
    setData(null)
    setError('')
    setPick(null)
    api(`/channels/code/${code}`)
      .then((d) => {
        setData(d)
        // coming back after login: reopen what they chose
        if (getSession()?.user?.role === 'customer') {
          if (d.rotation && params.get('pick') === 'group') setPick({ group: true })
          else {
            const pre = d.products.find((p) => p.id === params.get('pick'))
            if (pre) setPick(pre)
          }
        }
      })
      .catch((e) =>
        setError(e.status === 404 ? 'We could not find a package with that code. Please check it and try again.' : e.message)
      )
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  // After login or sign up, the dashboard sends them back here.
  const remember = (p) => {
    if (!code) return
    const q = p ? (p.group ? '?pick=group' : `?pick=${p.id}`) : ''
    localStorage.setItem('kobkart_next', JSON.stringify({ path: `/join/${code}${q}`, at: Date.now() }))
  }

  function choose(p) {
    setMsg('')
    if (session && role !== 'customer') {
      setMsg("You're logged in as a seller. Log in with a customer account to join.")
      return
    }
    setPick(p)
  }

  async function confirmJoin() {
    setJoining(true)
    setMsg('')
    try {
      if (pick.group) {
        await api(`/rotation/${ch.id}/join`, { method: 'POST' })
        nav(`/groups/${ch.id}`, { replace: true })
      } else {
        await api('/plans', { method: 'POST', body: { product_id: pick.id } })
        nav('/dashboard', { replace: true })
      }
    } catch (e) {
      setMsg(e.message)
    } finally {
      setJoining(false)
    }
  }

  const ch = data?.channel
  const rot = data?.rotation
  const count = (p) => Math.ceil(p.price / ch.contribution_amount)
  const full = rot && (rot.filled >= rot.slots || rot.status !== 'open')

  const steps = rot
    ? [
        ['1. Join the group', 'Take your place. The seller sets the collection order.'],
        ['2. Everyone pays each round', `${naira(ch?.contribution_amount || 0)} every ${ch?.frequency_days} days.`],
        ['3. Collect on your turn', 'One member collects the whole pot as goods each round.'],
      ]
    : [
        ['1. Pick an item', 'Choose what you want below.'],
        ['2. Pay small small', "Pay on the schedule until it's complete."],
        ['3. Receive it', 'The price never changes after you join.'],
      ]

  return (
    <div className="jn">
      <header className="jn-top">
        <Logo />
        <div className="jn-links">
          {session ? (
            <Link to="/dashboard" className="plain">My dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="plain" onClick={() => remember()}>Log In</Link>
              <Link to="/register" className="db-btn" onClick={() => remember()}>Sign Up</Link>
            </>
          )}
        </div>
      </header>

      <main className="jn-wrap">
        {!code && (
          <section className="db-card jn-enter">
            <Package size={34} color="#6b0f1e" />
            <h1>Join a package</h1>
            <p className="muted">Enter the code your seller shared with you, or open the link they sent.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (input.trim()) nav(`/join/${input.trim()}`)
              }}
            >
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="CODE" maxLength={12} />
              <button className="db-btn">Continue</button>
            </form>
            <Link to="/browse" className="db-link" style={{ marginTop: 10 }}>Or browse all packages <ArrowRight size={14} /></Link>
          </section>
        )}

        {code && error && <div className="alert">{error}</div>}
        {code && !data && !error && <div className="db-loading">Loading package...</div>}

        {ch && (
          <>
            <section className="db-card pd-head">
              <div className="pd-cover">{ch.image_url ? <img src={ch.image_url} alt="" /> : <Package size={36} />}</div>
              <div className="pd-info">
                <h1>{ch.name}</h1>
                <p>
                  Sold by <b>{data.seller}</b>{' '}
                  {data.seller_verified && <span className="bd ontrack"><ShieldCheck size={13} style={{ marginRight: 4 }} />Verified seller</span>}
                </p>
                {ch.description && <p>{ch.description}</p>}
                <span className="pd-code">{naira(ch.contribution_amount)} every {ch.frequency_days} day{ch.frequency_days > 1 ? 's' : ''}</span>
                {rot && (
                  <p style={{ marginTop: 10 }}>
                    <b>{rot.filled}/{rot.slots}</b> joined • pot per round <b>{naira(rot.pot)}</b>
                    {rot.start_date && ` • first collection ${shortDate(rot.start_date)}`}
                  </p>
                )}
              </div>
            </section>

            <div className="jn-steps">
              {steps.map(([t, d]) => <div key={t}><b>{t}</b>{d}</div>)}
            </div>

            {msg && !pick && <div className="alert">{msg}</div>}

            {rot ? (
              <section className="db-card jn-enter" style={{ maxWidth: 'none' }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{full ? 'This group is closed' : 'Take your place'}</h2>
                <p className="muted small" style={{ margin: 0 }}>
                  {full
                    ? 'It is full or has already started. Ask your seller about the next group.'
                    : 'You will pay every round, and collect the full pot as goods when your turn comes.'}
                </p>
                {!full && (
                  <button className="db-btn" style={{ marginTop: 10 }} onClick={() => choose({ group: true })}>
                    Join this group
                  </button>
                )}
              </section>
            ) : (
              <section className="db-card">
                <div className="db-card-head"><h2>Choose your item</h2></div>
                {data.products.length === 0 ? (
                  <div className="db-empty"><b>No items yet</b><p>This seller hasn't added products to this package.</p></div>
                ) : (
                  <div className="prod-grid">
                    {data.products.map((p) => (
                      <div className="prod-card" key={p.id}>
                        <div className="prod-img">{p.image_url ? <img src={p.image_url} alt="" /> : <Package size={30} />}</div>
                        <div className="prod-body">
                          <b>{p.name}</b>
                          <div className="price">{naira(p.price)}</div>
                          <small>{count(p)} payment{count(p) === 1 ? '' : 's'} • about {count(p) * ch.frequency_days} days</small>
                          <button className="db-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => choose(p)}>
                            Join with this
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {pick && ch && (
        <>
          <div className="jn-sheet-bg" onClick={() => setPick(null)} />
          <div className="jn-sheet">
            {!session ? (
              <>
                <h3>Create a free account to join</h3>
                <p className="muted small">It takes a minute. We'll bring you right back here.</p>
                <div className="fm-actions" style={{ marginTop: 14 }}>
                  <Link to="/register" className="db-btn" onClick={() => remember(pick)}>Sign Up <ArrowRight size={16} /></Link>
                  <Link to="/login" className="db-btn ghost" onClick={() => remember(pick)}>Log In</Link>
                </div>
              </>
            ) : pick.group ? (
              <>
                <h3>Join "{ch.name}"?</h3>
                <div className="jn-sum">
                  <div><span>You pay</span><b>{naira(ch.contribution_amount)} every {ch.frequency_days} days</b></div>
                  <div><span>Pot per round</span><b>{naira(rot.pot)}</b></div>
                  <div><span>Your turn</span><b>Set by the seller</b></div>
                </div>
                {msg && <div className="alert">{msg}</div>}
                <div className="fm-actions">
                  <button className="db-btn" onClick={confirmJoin} disabled={joining}>{joining ? 'Joining...' : 'Confirm & join'}</button>
                  <button className="db-btn ghost" onClick={() => setPick(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h3>Join "{pick.name}"?</h3>
                <div className="jn-sum">
                  <div><span>Item price (locked)</span><b>{naira(pick.price)}</b></div>
                  <div><span>You pay</span><b>{naira(Math.min(ch.contribution_amount, pick.price))} every {ch.frequency_days} days</b></div>
                  <div><span>Number of payments</span><b>{count(pick)}</b></div>
                </div>
                {msg && <div className="alert">{msg}</div>}
                <div className="fm-actions">
                  <button className="db-btn" onClick={confirmJoin} disabled={joining}>{joining ? 'Joining...' : 'Confirm & join'}</button>
                  <button className="db-btn ghost" onClick={() => setPick(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}