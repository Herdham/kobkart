import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession, saveSession } from '../api/auth'
import './dashboard.css'

export default function Settings() {
  const nav = useNavigate()
  const sess = getSession()
  const role = sess?.user?.role
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  useEffect(() => {
    api('/account')
      .then((d) => {
        setData(d)
        const a = d.account
        setForm({
          full_name: a.full_name, phone: a.phone, whatsapp: a.whatsapp || '', location: a.location || '', bio: a.bio || '',
          instagram: a.instagram || '', facebook: a.facebook || '', x_handle: a.x_handle || '', website: a.website || '',
        })
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/account', { method: 'PUT', body: form })
      const s = getSession()
      if (s) saveSession({ ...s, user: { ...s.user, full_name: form.full_name.trim() } }, !!localStorage.getItem('kobkart_session'))
      say('Profile saved')
    } catch (err) {
      say(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwError('')
    if (pw.next.length < 8) return setPwError('Use at least 8 characters')
    if (pw.next !== pw.confirm) return setPwError('The new passwords do not match')
    setPwBusy(true)
    try {
      await api('/account/password', { method: 'POST', body: { current_password: pw.current, new_password: pw.next } })
      setPw({ current: '', next: '', confirm: '' })
      say('Password changed')
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwBusy(false)
    }
  }

  async function copyInvite() {
    const rc = data.account.referral_code
    const text = `Join me on Kobkart! ${window.location.origin}/register${rc ? ` Use my referral code ${rc}.` : ''}`
    try {
      await navigator.clipboard.writeText(text)
      say('Invite message copied')
    } catch {
      say(text)
    }
  }

  const a = data?.account
  const seller = data?.seller

  return (
    <DashboardLayout name={seller?.business_name || a?.full_name || sess?.user?.full_name} role={role} active="settings">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Settings</h1>
            <p className="muted">Your profile, referral code and password.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {!form && !error && <div className="db-loading">Loading...</div>}

        {form && (
          <>
            <form className="db-card" onSubmit={saveProfile}>
              <div className="db-card-head"><h2>Profile</h2></div>
              <div className="fm">
                <label>Full name<input value={form.full_name} onChange={set('full_name')} /></label>
                <div className="fm-row">
                  <label>Phone number<input type="tel" value={form.phone} onChange={set('phone')} /></label>
                  <label>WhatsApp number (optional)<input type="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="Same as phone if blank" /></label>
                </div>
                <label>Email<input value={a.email} disabled /></label>
                <label>City and state (optional)<input value={form.location} onChange={set('location')} placeholder="e.g. Ikeja, Lagos" /></label>
                <label>{role === 'seller' ? 'About your business' : 'About you (optional)'}
                  <textarea value={form.bio} onChange={set('bio')} maxLength={400} placeholder={role === 'seller' ? 'What do you sell? How long have you been selling?' : 'A short line about you'} />
                </label>
              </div>

              <div className="db-card-head" style={{ marginTop: 22 }}><h2>Social pages</h2></div>
              {role === 'seller' ? (
                <p className="muted small" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
                  Kobkart looks at your page before approving your seller account. Add at least one that shows your business.
                </p>
              ) : (
                <p className="muted small" style={{ margin: '0 0 12px' }}>Optional. Add a handle or a link.</p>
              )}
              <div className="fm">
                <div className="fm-row">
                  <label>Instagram<input value={form.instagram} onChange={set('instagram')} placeholder="@yourname" /></label>
                  <label>Facebook<input value={form.facebook} onChange={set('facebook')} placeholder="Page name or link" /></label>
                </div>
                <div className="fm-row">
                  <label>X (Twitter)<input value={form.x_handle} onChange={set('x_handle')} placeholder="@yourname" /></label>
                  <label>Website<input value={form.website} onChange={set('website')} placeholder="https://" /></label>
                </div>
                <div className="fm-actions">
                  <button className="db-btn" disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</button>
                </div>
              </div>
            </form>

            <section className="db-card">
              <div className="db-card-head"><h2>Your referral code</h2></div>
              <div className="payout-box">
                <div><b>{a.referral_code || 'Not available'}</b><small>Share it so friends can join with your code.</small></div>
                <button className="db-btn ghost" onClick={copyInvite}><Copy size={15} /> Copy invite</button>
              </div>
              {seller && (
                <p className="muted small" style={{ margin: '12px 0 0' }}>
                  Business name and payout account are in <Link to="/store" className="link-strong">My Store</Link>.
                </p>
              )}
            </section>

            <form className="db-card" onSubmit={changePassword}>
              <div className="db-card-head"><h2>Change password</h2></div>
              {pwError && <div className="alert">{pwError}</div>}
              <div className="fm">
                <label>Current password<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
                <div className="fm-row">
                  <label>New password<input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
                  <label>Confirm new password<input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
                </div>
                <div className="fm-actions">
                  <button className="db-btn" disabled={pwBusy || !pw.current || !pw.next}>{pwBusy ? 'Saving...' : 'Change password'}</button>
                </div>
              </div>
            </form>

            <p className="muted small">
              <Link to="/terms" className="link-strong">Terms</Link> · <Link to="/privacy" className="link-strong">Privacy</Link>
              {role === 'seller' && <> · <Link to="/seller-agreement" className="link-strong">Seller Agreement</Link></>}
            </p>
          </>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}