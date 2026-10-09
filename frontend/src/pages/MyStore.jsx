import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Landmark, Link2 } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import './dashboard.css'

export default function MyStore() {
  const nav = useNavigate()
  const [profile, setProfile] = useState(null)
  const [channels, setChannels] = useState([])
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [bizName, setBizName] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [editBank, setEditBank] = useState(false)
  const [banks, setBanks] = useState(null)
  const [bankError, setBankError] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [acct, setAcct] = useState('')
  const [resolved, setResolved] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [savingBank, setSavingBank] = useState(false)

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  useEffect(() => {
    Promise.all([api('/seller/profile'), api('/seller/channels')])
      .then(([p, c]) => {
        setProfile(p)
        setBizName(p.business_name)
        setChannels(c)
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const showBankForm = profile && (!profile.payout_ready || editBank)

  // load the bank list only when the form is opened
  useEffect(() => {
    if (!showBankForm || banks) return
    api('/seller/banks').then(setBanks).catch((e) => setBankError(e.message))
  }, [showBankForm, banks])

  // show the account holder's name as soon as bank + 10 digits are entered
  useEffect(() => {
    setResolved('')
    setResolveError('')
    setResolving(false)
    if (!bankCode || acct.length !== 10) return
    let cancelled = false
    setResolving(true)
    api(`/seller/resolve-account?bank_code=${bankCode}&account_number=${acct}`)
      .then((r) => !cancelled && setResolved(r.account_name))
      .catch((e) => !cancelled && setResolveError(e.message))
      .finally(() => !cancelled && setResolving(false))
    return () => {
      cancelled = true
    }
  }, [bankCode, acct])

  async function saveName() {
    setSavingName(true)
    try {
      await api('/seller/profile', { method: 'PUT', body: { business_name: bizName } })
      setProfile((p) => ({ ...p, business_name: bizName.trim() }))
      say('Business name saved')
    } catch (e) {
      say(e.message)
    } finally {
      setSavingName(false)
    }
  }

  async function saveBank() {
    setSavingBank(true)
    try {
      const bank = banks.find((b) => b.code === bankCode)
      const r = await api('/seller/bank', {
        method: 'POST',
        body: { bank_code: bankCode, bank_name: bank?.name || '', account_number: acct },
      })
      setProfile((p) => ({ ...p, payout_ready: true, bank_name: r.bank_name, account_name: r.account_name, account_last4: r.account_last4 }))
      setEditBank(false)
      setAcct('')
      setBankCode('')
      say('Payout account saved')
    } catch (e) {
      say(e.message)
    } finally {
      setSavingBank(false)
    }
  }

  async function copy(code) {
    const link = `${window.location.origin}/join/${code}`
    try {
      await navigator.clipboard.writeText(link)
      say('Link copied')
    } catch {
      say(link)
    }
  }

  return (
    <DashboardLayout name={profile?.business_name || getSession()?.user?.full_name} role="seller" active="store">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>My Store</h1>
            <p className="muted">Your business details, where your money is sent, and your store links.</p>
          </div>
          {profile && (
            <span className={`bd ${profile.verified ? 'ontrack' : 'completed'}`}>
              {profile.verified ? 'Verified seller' : 'Pending review'}
            </span>
          )}
        </div>

        {error && <div className="alert">{error}</div>}
        {!profile && !error && <div className="db-loading">Loading...</div>}

        {profile && (
          <>
            <section className="db-card">
              <div className="db-card-head"><h2>Business details</h2></div>
              <div className="fm">
                <label>Business or store name
                  <input value={bizName} onChange={(e) => setBizName(e.target.value)} />
                </label>
                <div className="fm-actions">
                  <button className="db-btn" disabled={savingName || bizName.trim() === profile.business_name} onClick={saveName}>
                    {savingName ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Payout account</h2></div>
              {!showBankForm ? (
                <div className="payout-box">
                  <Landmark size={26} color="#6b0f1e" />
                  <div>
                    <b>{profile.account_name}</b>
                    <small>{profile.bank_name} • ****{profile.account_last4}</small>
                  </div>
                  <button className="db-btn ghost" onClick={() => setEditBank(true)}>Change</button>
                </div>
              ) : (
                <div className="fm">
                  <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                    This is where customer payments are sent. We show the account name before you save so a wrong number is caught early.
                  </p>
                  {bankError && <div className="bank-err">{bankError}</div>}
                  <label>Bank
                    <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} disabled={!banks}>
                      <option value="">{banks ? 'Choose your bank' : bankError ? 'Could not load banks' : 'Loading banks...'}</option>
                      {(banks || []).map((b, i) => <option key={`${b.code}-${i}`} value={b.code}>{b.name}</option>)}
                    </select>
                  </label>
                  <label>Account number
                    <input
                      inputMode="numeric"
                      maxLength={10}
                      value={acct}
                      onChange={(e) => setAcct(e.target.value.replace(/\D/g, ''))}
                      placeholder="10 digits"
                    />
                  </label>
                  {resolving && <div className="muted" style={{ fontSize: 13 }}>Checking account...</div>}
                  {resolved && <div className="bank-ok"><CheckCircle2 size={15} style={{ verticalAlign: -3 }} /> {resolved}</div>}
                  {resolveError && <div className="bank-err">{resolveError}</div>}
                  <div className="fm-actions">
                    <button className="db-btn" disabled={!resolved || savingBank} onClick={saveBank}>
                      {savingBank ? 'Saving...' : 'Save payout account'}
                    </button>
                    {editBank && <button className="db-btn ghost" onClick={() => setEditBank(false)}>Cancel</button>}
                  </div>
                </div>
              )}
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Store links</h2></div>
              {channels.length === 0 ? (
                <p className="muted small">Create a package and its link will appear here.</p>
              ) : (
                channels.map((c) => (
                  <div className="link-row" key={c.id}>
                    <div style={{ minWidth: 0 }}>
                      <b>{c.name}</b>
                      <small>{window.location.origin}/join/{c.invite_code}</small>
                    </div>
                    <button className="db-btn ghost" onClick={() => copy(c.invite_code)}><Link2 size={15} /> Copy</button>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}