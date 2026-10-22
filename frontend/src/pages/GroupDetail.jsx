import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Link2, MessageCircle, UserPlus, Users, X } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import ListingToggle from '../components/ListingToggle'
import LifecycleBar from '../components/LifecycleBar'
import ShareCardButtons from '../components/ShareCardButtons'
import { API, api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate, whatsappLink } from '../api/seller'
import { startPayment } from '../api/customer'
import { groupList } from '../api/whatsappList'
import GroupCatalogue from '../components/GroupCatalogue'
import JoinRequests from '../components/JoinRequests'
import GroupEditor from '../components/GroupEditor'
import './dashboard.css'
import GroupSharePanel from '../components/GroupSharePanel'

export default function GroupDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const user = getSession()?.user
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [order, setOrder] = useState(null)
  const [startDate, setStartDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [busy, setBusy] = useState('')
  const [guest, setGuest] = useState({ open: false, name: '', phone: '' })

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2800)
  }

  const load = useCallback(async () => {
    try {
      setData(await api(`/rotation/${id}`))
      setOrder(null)
    } catch (e) {
      if (e.status === 401) nav('/login', { replace: true })
      else setError(e.status === 404 ? 'Group not found' : e.status === 403 ? 'You are not part of this group.' : e.message)
    }
  }, [id, nav])

  useEffect(() => {
    load()
  }, [load])

  async function run(key, fn, ok) {
    setBusy(key)
    try {
      await fn()
      if (ok) say(ok)
      await load()
      return true
    } catch (e) {
      say(e.message)
      return false
    } finally {
      setBusy('')
    }
  }

  const layoutRole = user?.role === 'seller' ? 'seller' : user?.role === 'admin' ? 'admin' : 'customer'
  const layoutActive = user?.role === 'seller' ? 'packages' : 'dashboard'

  let body
  if (error) body = <div className="alert">{error}</div>
  else if (!data) body = <div className="db-loading">Loading group...</div>
  else {
    const { channel: ch, members, rounds, is_owner: owner, current_round: current } = data
    const open = ch.status === 'open'
    const me = members.find((m) => m.is_me)
    const list = order ? order.map((mid) => members.find((m) => m.id === mid)) : members
    const link = `${window.location.origin}/join/${ch.invite_code}`
    const today = new Date().toISOString().slice(0, 10)
    const myRound = me ? rounds.find((r) => r.round_no === me.position) : null

    const move = (i, d) => {
      const ids = list.map((m) => m.id)
      const j = i + d
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      setOrder(ids)
    }
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(link)
        say('Link copied')
      } catch {
        say(link)
      }
    }
    const copyClaim = async (m) => {
      const text = `${window.location.origin}/claim/${m.claim_token}`
      try {
        await navigator.clipboard.writeText(text)
        say(`Link copied. Send it only to ${m.name}.`)
      } catch {
        say(text)
      }
    }
    const copyList = async () => {
      try {
        await navigator.clipboard.writeText(groupList(data, link))
        say('WhatsApp list copied. Paste it in your group.')
      } catch {
        say('Could not copy the list')
      }
    }
    const pay = async () => {
      setBusy('pay')
      try {
        await startPayment(me.plan_id)
      } catch (e) {
        say(e.message)
        setBusy('')
      }
    }
    async function addGuest(e) {
      e.preventDefault()
      const ok = await run('guest', () => api(`/rotation/${id}/guests`, { method: 'POST', body: { name: guest.name, phone: guest.phone } }), 'Member added')
      if (ok) setGuest({ open: false, name: '', phone: '' })
    }
    async function recordPayment(m) {
      const method = window.prompt(
        `How did ${m.name} pay ${naira(ch.contribution_amount)} for round ${m.paid_count + 1}? Type transfer, cash or other:`,
        'transfer'
      )
      if (!method) return
      await run(
        'pay' + m.id,
        () => api('/seller/payments/manual', { method: 'POST', body: { plan_id: m.plan_id, amount: ch.contribution_amount, method: method.trim().toLowerCase() } }),
        'Payment recorded'
      )
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(
      `Join my group "${ch.name}" on Kobkart. ${naira(ch.contribution_amount)} every ${ch.frequency_days} days: ${link}`
    )}`

    body = (
      <div className="db-stack">
        <button className="db-link" onClick={() => nav(owner ? '/packages' : '/dashboard')}>
          <ArrowLeft size={14} /> {owner ? 'All packages' : 'Back to dashboard'}
        </button>

        <section className="db-card pd-head">
          <div className="pd-cover">
            {ch.has_image ? <img src={`${API}/channels/${ch.id}/image`} alt="" /> : <Users size={36} />}
          </div>
          <div className="pd-info">
            <h1>{ch.name}</h1>
            <p>
              {naira(ch.contribution_amount)} every {ch.frequency_days} day{ch.frequency_days > 1 ? 's' : ''} • {members.length}/{ch.slots} members
              {' '}<span className={`bd ${open ? 'completed' : ch.status === 'finished' ? 'delivered' : 'ontrack'}`}>
                {open ? 'Open' : ch.status === 'finished' ? 'Finished' : 'Running'}
              </span>
            </p>
            <p><b>{naira(ch.pot)}</b> pot per round{open ? ' when full' : ''} • run by {data.seller}</p>
            {ch.description && <p>{ch.description}</p>}
            {owner && (
              <>
                <span className="pd-code">Code: {ch.invite_code}</span>
                <div className="pd-actions">
                  <button className="db-btn" onClick={copy}><Link2 size={16} /> Copy link</button>
                  <button className="db-btn ghost" onClick={copyList}><Copy size={16} /> Copy WhatsApp list</button>
                  <a className="db-btn ghost" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Share on WhatsApp</a>
                </div>
                <ListingToggle channel={ch} onSaved={load} />
                <ShareCardButtons
                  fileName={ch.invite_code}
                  caption={`${ch.name} by ${data.seller}\nPay ${naira(ch.contribution_amount)} every ${ch.frequency_days} days.${open ? ` ${Math.max(0, ch.slots - members.length)} place(s) left.` : ''}\nJoin on Kobkart: ${link}`}
                  card={{
                    seller: data.seller,
                    title: ch.name,
                    headline: `Pay ${naira(ch.contribution_amount)} every ${ch.frequency_days} day${ch.frequency_days > 1 ? 's' : ''}`,
                    detail: `Group of ${ch.slots} • Pot ${naira(ch.pot)} each round${open ? ` • ${Math.max(0, ch.slots - members.length)} places left` : ''}`,
                    description: ch.description || '',
                    imageUrl: ch.has_image ? `${API}/channels/${ch.id}/image` : null,
                    link,
                  }}
                />
                <LifecycleBar channel={ch} onChanged={load} />
        <GroupSharePanel channel={ch} kind="rotation" />
        <GroupEditor channel={ch} kind="rotation" onChanged={load} />
              </>
            )}
          </div>
        </section>

        <GroupCatalogue channelId={ch.id} pot={ch.pot} owner={owner} me={me} members={members} onChanged={load} />

        {owner && <JoinRequests channel={ch} onChanged={load} />}

        {me && !owner && (
          open ? (
            <section className="turn-card">
              <div>
                <b>You are member #{me.position}</b>
                <small>Waiting for the seller to start the group. You can pay once it starts.</small>
              </div>
            </section>
          ) : (
            <section className="turn-card">
              <div>
                <b>You collect in round {me.position}{myRound ? ` on ${shortDate(myRound.due_date)}` : ''}</b>
                <small>
                  {me.paid_count}/{rounds.length} contributions paid
                  {myRound?.collected ? ' • You have collected' : ''}
                </small>
              </div>
              {me.paid_count < rounds.length && (
                <button className="db-btn" disabled={busy === 'pay'} onClick={pay}>
                  {busy === 'pay' ? 'Opening...' : `Pay ${naira(ch.contribution_amount)} for round ${me.paid_count + 1}`}
                </button>
              )}
            </section>
          )
        )}

        {owner && open && (
          <>
            <section className="db-card">
              <div className="db-card-head">
                <h2>Members &amp; collection order</h2>
                {order && (
                  <button className="db-btn sm" disabled={busy === 'order'} onClick={() => run('order', () => api(`/rotation/${id}/order`, { method: 'PUT', body: { member_ids: order } }), 'Order saved')}>
                    {busy === 'order' ? 'Saving...' : 'Save order'}
                  </button>
                )}
              </div>
              {list.length === 0 ? (
                <div className="db-empty">
                  <Users size={30} />
                  <b>No members yet</b>
                  <p>Share the link above, or add people from your WhatsApp list below. Then arrange who collects first.</p>
                </div>
              ) : (
                <>
                  <p className="muted small" style={{ margin: '0 0 8px' }}>
                    Position 1 collects in round 1. Use the arrows to arrange the order. Members can see this order.
                  </p>
                  {list.map((m, i) => (
                    <div className="mb-row" key={m.id}>
                      <span className="rd-no">{i + 1}</span>
                      <div className="rd-main">
                        <b>{m.name} {m.is_guest && <span className="bd cancelled">No account</span>}</b>
                        <small>{m.phone}</small>
                      </div>
                      <div className="row-actions">
                          {m.is_guest && m.claim_token && (
                          <button className="ic-btn" onClick={() => copyClaim(m)} aria-label="Copy link for this person"><Link2 size={16} /></button>
                        )}
                        <button className="ic-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={16} /></button>
                        <button className="ic-btn" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={16} /></button>
                        <button
                          className="ic-btn bad"
                          aria-label="Remove member"
                          onClick={() => window.confirm(`Remove ${m.name} from the group?`) && run('rm' + m.id, () => api(`/rotation/${id}/members/${m.id}`, { method: 'DELETE' }), 'Member removed')}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {members.length < ch.slots && (
                <div style={{ marginTop: 14 }}>
                  {guest.open ? (
                    <form className="fm" onSubmit={addGuest}>
                      <p className="muted small" style={{ margin: 0 }}>
                        For a member who has not signed up. They will not see anything in the app until they join with their own account.
                      </p>
                      <div className="fm-row">
                        <label>Name<input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} /></label>
                        <label>Phone<input type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} /></label>
                      </div>
                      <div className="fm-actions">
                        <button className="db-btn sm" disabled={busy === 'guest'}>{busy === 'guest' ? 'Adding...' : 'Add member'}</button>
                        <button type="button" className="db-btn sm ghost" onClick={() => setGuest({ open: false, name: '', phone: '' })}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <button className="db-btn sm ghost" onClick={() => setGuest({ ...guest, open: true })}>
                      <UserPlus size={14} /> Add someone without an account
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Start the group</h2></div>
              <p className="muted small" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
                Round 1 is collected on the date you choose, then a new round every {ch.frequency_days} days. Everyone pays {naira(ch.contribution_amount)} by each round's date.
                {members.length >= 2 && ` With ${members.length} members the pot is ${naira(ch.contribution_amount * members.length)} per round.`}
                {members.length < ch.slots && ` Only ${members.length} of ${ch.slots} places are filled, so starting now makes it a group of ${members.length}.`}
                {' '}Once you start, the order and members are locked.
              </p>
              <div className="start-box">
                <label className="fm" style={{ gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>First collection date</span>
                  <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <button
                  className="db-btn"
                  disabled={members.length < 2 || !!order || busy === 'start'}
                  onClick={() =>
                    window.confirm(
                      members.length < ch.slots
                        ? `Only ${members.length} of ${ch.slots} places are filled. If you start now, this becomes a group of ${members.length} and nobody else can join. Start anyway?`
                        : 'Start this group now? The order will be locked.'
                    ) && run('start', () => api(`/rotation/${id}/start`, { method: 'POST', body: { start_date: startDate } }), 'Group started')
                  }
                >
                  {busy === 'start' ? 'Starting...' : 'Start group'}
                </button>
              </div>
              {order && <p className="small" style={{ color: 'var(--error)', margin: '8px 0 0' }}>Save the new order before you start.</p>}
              {members.length < 2 && <p className="muted small" style={{ margin: '8px 0 0' }}>You need at least 2 members to start.</p>}
            </section>
          </>
        )}

        {!owner && open && (
          <section className="db-card">
            <div className="db-card-head"><h2>Members</h2></div>
            {members.map((m) => (
              <div className="mb-row" key={m.id}>
                <span className="rd-no">{m.position}</span>
                <div className="rd-main"><b>{m.name}{m.is_me && ' (you)'}</b></div>
              </div>
            ))}
          </section>
        )}

        {!open && (
          <>
            <section className="db-card">
              <div className="db-card-head"><h2>Collection rounds</h2></div>
              {rounds.map((r) => {
                const mine = me && r.collector_id === me.id
                const st = r.collected ? ['Collected', 'ontrack'] : r.round_no === current ? ['Current', 'completed'] : ['Upcoming', 'cancelled']
                return (
                  <div className={`rd-row ${mine ? 'mine' : ''}`} key={r.round_no}>
                    <span className="rd-no">{r.round_no}</span>
                    <div className="rd-main">
                      <b>{r.collector_name}{mine && ' (you)'}</b>
                      <small>{shortDate(r.due_date)} • {r.paid_count}/{r.member_count} paid</small>
                    </div>
                    <span className={`bd ${st[1]}`}>{st[0]}</span>
                    {owner && (
                      <button
                        className="db-btn sm ghost"
                        disabled={busy === 'r' + r.round_no}
                        onClick={() => run('r' + r.round_no, () => api(`/rotation/${id}/rounds/${r.round_no}/collected`, { method: 'PUT', body: { collected: !r.collected } }))}
                      >
                        {r.collected ? 'Undo' : 'Mark collected'}
                      </button>
                    )}
                  </div>
                )
              })}
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Who has paid</h2></div>
              {members.map((m) => (
                <div className="mb-row" key={m.id}>
                  <span className="rd-no">{m.position}</span>
                  <div className="rd-main">
                    <b>{m.name}{m.is_me && ' (you)'} {m.is_guest && <span className="bd cancelled">No account</span>}</b>
                    <small>{m.paid_count}/{rounds.length} contributions</small>
                  </div>
                  <span className={`bd ${m.defaulted ? 'defaulted' : m.late ? 'late' : 'ontrack'}`}>{m.defaulted ? 'Defaulted' : m.late ? 'Late' : 'Up to date'}</span>
                  {owner && m.is_guest && m.claim_token && (
                    <button className="ic-btn" onClick={() => copyClaim(m)} aria-label="Copy link for this person"><Link2 size={16} /></button>
                  )}
                  {owner && m.plan_id && m.paid_count < rounds.length && (
                    <button className="db-btn sm ghost" disabled={busy === 'pay' + m.id} onClick={() => recordPayment(m)}>
                      Record payment
                    </button>
                  )}
                  {owner && m.late && m.phone && (
                    <a
                      className="db-remind"
                      target="_blank"
                      rel="noreferrer"
                      href={whatsappLink(m.phone, `Hello ${m.name}, this is ${data.seller}. Your ${naira(ch.contribution_amount)} contribution for "${ch.name}" is due. Please pay on Kobkart: ${link}`)}
                    >
                      <MessageCircle size={15} /> Remind
                    </a>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    )
  }

  return (
    <DashboardLayout name={layoutRole === 'seller' ? data?.seller : user?.full_name} role={layoutRole} active={layoutActive}>
      {body}
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}