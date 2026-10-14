import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardPaste, X } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api, toKobo } from '../api/http'
import { getSession } from '../api/auth'
import { naira } from '../api/seller'
import { parseList } from '../api/parseList'
import './dashboard.css'

export default function ImportList() {
  const nav = useNavigate()
  const user = getSession()?.user
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [form, setForm] = useState({ name: '', amount: '', days: '5', start: '' })
  const [members, setMembers] = useState([])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function read() {
    const p = parseList(text)
    if (p.members.length < 2) {
      setError('I could not find at least 2 members. Paste the whole list, one person per line.')
      return
    }
    setError('')
    setParsed(p)
    setForm({ name: p.header.name, amount: p.header.amount, days: String(p.header.days), start: p.startDate })
    setMembers(p.members)
  }

  const upd = (i, patch) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const n = members.length
  const done = members.filter((m) => m.collected).length
  const next = members.findIndex((m) => !m.collected)
  const amount = Number(form.amount)
  const problems = []
  if (form.name.trim().length < 2) problems.push('Give the group a name.')
  if (!amount || amount < 100) problems.push('Enter the contribution per round (at least ₦100).')
  if (!(Number(form.days) >= 1 && Number(form.days) <= 90)) problems.push('Days between rounds must be 1 to 90.')
  if (!form.start) problems.push('Choose the date of round 1.')
  if (n < 2 || n > 100) problems.push('A group needs 2 to 100 members.')
  if (members.some((m) => m.name.trim().length < 2)) problems.push('Every member needs a name.')
  if (members.some((m) => Number(m.paid) < 0 || Number(m.paid) > n)) problems.push(`Rounds paid cannot be more than ${n}.`)

  async function create() {
    setBusy(true)
    setError('')
    try {
      const r = await api('/seller/import-group', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          category: 'other',
          contribution_amount: toKobo(amount),
          frequency_days: Number(form.days),
          start_date: form.start,
          members: members.map((m) => ({
            name: m.name.trim(),
            phone: m.phone.trim() || null,
            paid: Number(m.paid) || 0,
            collected: !!m.collected,
          })),
        },
      })
      nav(`/groups/${r.channel_id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardLayout name={user?.full_name} role="seller" active="import">
      <div className="db-stack">
        <div className="db-page-head">
          <div>
            <h1>Import from WhatsApp</h1>
            <p className="muted">Bring a running group into Kobkart. Paste your list and check what I understood before anything is saved.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        {!parsed && (
          <section className="db-card">
            <div className="fm">
              <label>Paste the list from your group
                <textarea
                  className="imp-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={'1k every 5days to pack shoes\n🆑1.ALM ✅✅✅\n🆑2.raphael ✅✅✅✅\n3.sister maryam ✅✅✅\n4.eniola ✅✅'}
                />
              </label>
              <small className="muted">
                Each line is one person: the number, the name, one ✅ for each round they have paid, and 🆑 or CL if they have already collected.
                Put the contribution and days in the first line, like "1k every 5days".
              </small>
              <div className="fm-actions">
                <button className="db-btn" disabled={!text.trim()} onClick={read}><ClipboardPaste size={16} /> Read my list</button>
              </div>
            </div>
          </section>
        )}

        {parsed && (
          <>
            <section className="db-card">
              <div className="db-card-head"><h2>The group</h2></div>
              <div className="fm">
                <label>Group name<input value={form.name} onChange={setF('name')} placeholder="e.g. 1k every 5 days" /></label>
                <div className="fm-row">
                  <label>Contribution per round (₦)<input type="number" inputMode="numeric" value={form.amount} onChange={setF('amount')} /></label>
                  <label>Days between rounds<input type="number" inputMode="numeric" value={form.days} onChange={setF('days')} /></label>
                </div>
                <label>Date of round 1 (when the first person collects)
                  <input type="date" value={form.start} onChange={setF('start')} />
                  <small>
                    {next >= 0
                      ? `I guessed this so that round ${next + 1} is due today. Change it if you know the real date.`
                      : 'Every member has collected.'}
                  </small>
                </label>
              </div>
              <p className="small" style={{ margin: '12px 0 0' }}>
                <b>{n}</b> members • <b>{done}</b> collected • pot per round <b>{amount ? naira(toKobo(amount) * n) : '-'}</b>
                {next >= 0 && <> • next to collect: <b>{members[next].name}</b> (round {next + 1})</>}
              </p>
            </section>

            {parsed.warnings.length > 0 && (
              <div className="warn-card">
                {parsed.warnings.map((w) => <div key={w}>{w}</div>)}
              </div>
            )}

            <section className="db-card">
              <div className="db-card-head">
                <h2>Members</h2>
                <button className="db-btn sm ghost" onClick={() => setParsed(null)}>Paste again</button>
              </div>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Rounds paid is the number of ✅. Tick "Collected" for people marked 🆑 or CL. Phone numbers are optional and can stay empty.
              </p>
              {members.map((m, i) => (
                <div className="imp-row" key={i}>
                  <span className="rd-no">{i + 1}</span>
                  <div className="imp-name">
                    <input value={m.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Name" />
                    <input type="tel" value={m.phone} onChange={(e) => upd(i, { phone: e.target.value })} placeholder="Phone (optional)" aria-label="Phone" />
                  </div>
                  <label className="imp-paid">Paid
                    <input type="number" inputMode="numeric" min="0" max={n} value={m.paid} onChange={(e) => upd(i, { paid: e.target.value })} />
                  </label>
                  <label className="imp-cl">
                    <input type="checkbox" checked={m.collected} onChange={(e) => upd(i, { collected: e.target.checked })} /> Collected
                  </label>
                  <button className="ic-btn bad" aria-label="Remove" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}><X size={16} /></button>
                </div>
              ))}
            </section>

            <section className="db-card">
              <div className="fm">
                <p className="muted small" style={{ margin: 0, lineHeight: 1.6 }}>
                  Nothing moves money. Each ✅ becomes a payment marked "Recorded (imported)". The group is created as <b>private</b>.
                  Members get no message until you send each person their link from the group page.
                </p>
                <label className="chk">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>These members agreed to be in this group, and I may keep their names (and phone numbers, if I add them) in Kobkart.</span>
                </label>
                {problems.length > 0 && <div className="alert">{problems.map((p) => <div key={p}>{p}</div>)}</div>}
                <div className="fm-actions">
                  <button className="db-btn" disabled={busy || !consent || problems.length > 0} onClick={create}>
                    {busy ? 'Creating...' : `Create group with ${n} members`}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}