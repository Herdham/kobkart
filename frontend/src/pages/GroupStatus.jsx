import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import Logo from '../components/Logo'
import { api } from '../api/http'
import { naira } from '../api/seller'
import './dashboard.css'

export default function GroupStatus() {
  const { code } = useParams()
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  const [rounds, setRounds] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState('')
  const [copied, setCopied] = useState('')

  const load = () =>
    api(`/public/g/${code}`)
      .then(setSt)
      .catch((e) => setErr(e.status === 404 ? 'This group link is not valid.' : e.message))
  useEffect(() => {
    load()
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <header className="jn-top">
      <Logo />
      <div className="jn-links"><Link to="/" className="plain">What is Kobkart?</Link></div>
    </header>
  )
  if (err) return <div className="jn">{header}<main className="jn-wrap"><div className="alert">{err}</div></main></div>
  if (!st) return <div className="jn">{header}<main className="jn-wrap"><div className="db-loading">Loading group...</div></main></div>

  const n = st.members_count
  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      /* ignore */
    }
  }
  const open = (m) => {
    setPick(m)
    setRounds(1)
    setMsg('')
    setDone('')
  }
  async function submit() {
    setBusy(true)
    setMsg('')
    try {
      const r = await api(`/public/g/${code}/claim`, { method: 'POST', body: { plan_id: pick.plan_id, rounds } })
      setDone(`Sent! ${st.seller} will confirm your ${naira(r.amount)} payment.`)
      load()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }
  const chip = (m) =>
    m.paid >= n ? ['ok', 'Completed'] : m.pending ? ['wait', 'Waiting for confirmation'] : m.behind ? ['late', 'Behind'] : ['ok', 'Up to date']
  const b = st.bank || {}
  const maxRounds = pick ? Math.max(1, Math.min(n - pick.paid, 6)) : 1

  return (
    <div className="jn">
      {header}
      <main className="jn-wrap gs">
        <h1 className="gs-title">{st.name}</h1>
        <p className="muted small" style={{ margin: '2px 0 14px' }}>Run by {st.seller}</p>

        <section className="db-card">
          <div className="gs-facts">
            <div><span>Contribution</span><b>{naira(st.contribution)} every {st.frequency_days} days</b></div>
            <div><span>Pot each round</span><b>{naira(st.pot)}</b></div>
            <div><span>Round</span><b>{st.current_round ? `${st.current_round} of ${n}` : 'All collected'}</b></div>
            {st.next_collector && <div><span>Next to collect</span><b>{st.next_collector}{st.next_date ? ` • ${st.next_date}` : ''}</b></div>}
            <div><span>Up to date</span><b>{st.up_to_date} of {n}</b></div>
          </div>
        </section>

        <section className="db-card">
          <div className="db-card-head"><h2>How to pay</h2></div>
          {b.account_number ? (
            <div className="gs-bank">
              <div><span>Bank</span><b>{b.bank_name || '-'}</b></div>
              <div><span>Account name</span><b>{b.account_name || '-'}</b></div>
              <div>
                <span>Account number</span>
                <b>{b.account_number}</b>
                <button className="db-btn sm ghost" onClick={() => copy('acc', b.account_number)}>
                  {copied === 'acc' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                </button>
              </div>
            </div>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>Ask {st.seller} for the account details.</p>
          )}
          <p className="muted small" style={{ margin: '10px 0 0' }}>
            After you pay, find your name below and tap <b>I have paid</b>. {st.seller} will confirm it.
          </p>
        </section>

        <section className="db-card">
          <div className="db-card-head"><h2>Members</h2></div>
          {st.members.map((m) => {
            const [cls, label] = chip(m)
            return (
              <div className="gs-row" key={m.plan_id}>
                <span className="gs-pos">{m.position}</span>
                <div className="gs-who">
                  <b>{m.name}</b>
                  <small>{m.paid}/{n} contributions</small>
                </div>
                <div className="gs-end">
                  <span className={`gs-chip ${cls}`}>{label}</span>
                  {m.paid < n && !m.pending && <button className="db-btn sm" onClick={() => open(m)}>I have paid</button>}
                </div>
              </div>
            )
          })}
        </section>

        <section className="db-card">
          <div className="db-card-head"><h2>Collection rounds</h2></div>
          {st.rounds.map((r) => (
            <div className="gs-row" key={r.round}>
              <span className="gs-pos">{r.round}</span>
              <div className="gs-who">
                <b>{st.members.find((m) => m.position === r.round)?.name}</b>
                <small>{r.date}</small>
              </div>
              <div className="gs-end"><span className={`gs-chip ${r.collected ? 'ok' : r.round === st.current_round ? 'wait' : ''}`}>{r.collected ? 'Collected' : r.round === st.current_round ? 'Current' : 'Upcoming'}</span></div>
            </div>
          ))}
        </section>

        <p className="muted small" style={{ textAlign: 'center', margin: '18px 0 30px' }}>
          Powered by <Link to="/" className="link-strong">Kobkart</Link> • Run a group? Start free
        </p>
      </main>

      {pick && (
        <>
          <div className="jn-sheet-bg" onClick={() => setPick(null)} />
          <div className="jn-sheet">
            {done ? (
              <>
                <h3>{done}</h3>
                <div className="fm-actions"><button className="db-btn" onClick={() => setPick(null)}>Done</button></div>
              </>
            ) : (
              <>
                <h3>Is this you?</h3>
                <div className="jn-sum">
                  <div><span>Name</span><b>{pick.name}</b></div>
                  <div>
                    <span>Contributions paid</span>
                    <b>
                      <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
                        {Array.from({ length: maxRounds }, (_, i) => i + 1).map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </b>
                  </div>
                  <div><span>Amount</span><b>{naira(st.contribution * rounds)}</b></div>
                </div>
                <p className="muted small">Only tap this after you have sent the money to the account above.</p>
                {msg && <div className="alert">{msg}</div>}
                <div className="fm-actions">
                  <button className="db-btn" disabled={busy} onClick={submit}>{busy ? 'Sending...' : 'Yes, I have paid'}</button>
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