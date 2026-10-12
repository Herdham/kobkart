import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import Logo from '../components/Logo'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import './dashboard.css'

export default function Claim() {
  const { token } = useParams()
  const nav = useNavigate()
  const session = getSession()
  const role = session?.user?.role
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api(`/claim/${token}`)
      .then(setInfo)
      .catch((e) => setError(e.status === 404 ? 'This link is not valid.' : e.message))
  }, [token])

  const remember = () =>
    localStorage.setItem('kobkart_next', JSON.stringify({ path: `/claim/${token}`, at: Date.now() }))

  async function claim() {
    setBusy(true)
    setError('')
    try {
      const r = await api(`/claim/${token}`, { method: 'POST' })
      nav(r.kind === 'rotation' ? `/groups/${r.channel_id}` : `/plans/${r.plan_id}`, { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jn">
      <header className="jn-top">
        <Logo />
      </header>
      <main className="jn-wrap">
        {error && <div className="alert">{error}</div>}
        {!info && !error && <div className="db-loading">Loading...</div>}
        {info && (
          <section className="db-card jn-enter">
            <Link2 size={34} color="#6b0f1e" />
            <h1>Hello {info.first_name}</h1>
            <p className="muted">
              <b>{info.seller}</b> added you to <b>{info.package}</b>
              {info.kind === 'save' ? ` for ${info.item}` : ''}. Link it to your own Kobkart account to pay online, get receipts and see your history.
            </p>
            {!info.claimable ? (
              <div className="alert info" style={{ width: '100%' }}>This link has already been used.</div>
            ) : !session ? (
              <div className="fm-actions" style={{ marginTop: 10, justifyContent: 'center' }}>
                <Link to="/register" className="db-btn" onClick={remember}>Create an account</Link>
                <Link to="/login" className="db-btn ghost" onClick={remember}>Log in</Link>
              </div>
            ) : role === 'customer' ? (
              <button className="db-btn" style={{ marginTop: 10 }} disabled={busy} onClick={claim}>
                {busy ? 'Linking...' : 'Link this to my account'}
              </button>
            ) : (
              <div className="alert" style={{ width: '100%' }}>Log in with a customer account to use this link.</div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}