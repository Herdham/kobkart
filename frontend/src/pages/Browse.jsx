import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Search } from 'lucide-react'
import Logo from '../components/Logo'
import PublicPackageCard from '../components/PublicPackageCard'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { CATEGORIES } from '../api/categories'
import './dashboard.css'
import '../components/packages.css'

const AMOUNTS = [1000, 2000, 5000, 10000, 20000]

export default function Browse() {
  const session = getSession()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [category, setCategory] = useState('')
  const [max, setMax] = useState('')
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let off = false
    setItems(null)
    setError('')
    const qs = new URLSearchParams()
    if (dq) qs.set('q', dq)
    if (category) qs.set('category', category)
    if (max) qs.set('max', String(Number(max) * 100))
    qs.set('limit', '48')
    api(`/browse?${qs}`)
      .then((d) => !off && setItems(d))
      .catch((e) => !off && setError(e.message))
    return () => {
      off = true
    }
  }, [dq, category, max])

  return (
    <div className="jn">
      <header className="jn-top">
        <Logo />
        <div className="jn-links">
          {session ? (
            <Link to="/dashboard" className="plain">My dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="plain">Log In</Link>
              <Link to="/register" className="db-btn">Sign Up</Link>
            </>
          )}
        </div>
      </header>

      <main className="bp-wrap">
        <div className="bp-head">
          <h1>Find a package to join</h1>
          <p>Pay small small and get what you want. Every seller listed here has been approved by Kobkart.</p>
        </div>

        <label className="bp-search">
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shoes, kitchen, a seller..." />
        </label>

        <div className="bp-chips">
          <button className={!category ? 'on' : ''} onClick={() => setCategory('')}>All</button>
          {CATEGORIES.map(([k, label]) => (
            <button key={k} className={category === k ? 'on' : ''} onClick={() => setCategory(k)}>{label}</button>
          ))}
        </div>

        <div className="bp-filter">
          I can pay about
          <select value={max} onChange={(e) => setMax(e.target.value)}>
            <option value="">any amount</option>
            {AMOUNTS.map((a) => <option key={a} value={a}>₦{a.toLocaleString()} or less</option>)}
          </select>
          each time
        </div>

        {error && <div className="alert">{error}</div>}
        {!items && !error && <div className="db-loading">Finding packages...</div>}

        {items && items.length === 0 && (
          <section className="db-card db-empty-pkg">
            <Package size={34} />
            <h2>No packages found</h2>
            <p>{dq || category || max ? 'Try a different word or clear a filter.' : 'No packages are listed yet. Please check back soon.'}</p>
          </section>
        )}

        {items && items.length > 0 && (
          <>
            <p className="bp-count">{items.length} package{items.length === 1 ? '' : 's'}</p>
            <div className="bp-grid">
              {items.map((p) => <PublicPackageCard key={p.id} p={p} />)}
            </div>
          </>
        )}
      </main>
    </div>
  )
}