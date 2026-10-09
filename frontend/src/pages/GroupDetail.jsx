import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Link2, MessageCircle, Users, X } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import ListingToggle from '../components/ListingToggle'
import { API, api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate, whatsappLink } from '../api/seller'
import { startPayment } from '../api/customer'
import './dashboard.css'

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
    } catch (e) {
      say(e.message)
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
    const pay = async () => {
      setBusy('pay')
      try {
        await startPayment(me.plan_id)
      } catch (e) {
        say(e.message)
        setBusy('')
      }
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
                  <a className="db-btn ghost" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Share on WhatsApp</a>
                </div>
                <ListingToggle channel={ch} onSaved={load} />
              </>
            )}
          </div>
        </section>

        {/* member's own turn + pay */}
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

        {/* seller: before start */}
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
                  <p>Share the link above. Members appear here when they join. Then arrange who collects first.</p>
                </div>
              ) : (
                <>
                  <p className="muted small" style={{ margin: '0 0 8px' }}>
                    Position 1 collects in round 1. Use the arrows to arrange the order. Members can see this order.
                  </p>
                  {list.map((m, i) => (
                    <div className="mb-row" key={m.id}>
                      <span className="rd-no">{i + 1}</span>
                      <div className="rd-main"><b>{m.name}</b><small>{m.phone}</small></div>
                      <div className="row-actions">
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
            </section>

            <section className="db-card">
              <div className="db-card-head"><h2>Start the group</h2></div>
              <p className="muted small" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
                Round 1 is collected on the date you choose, then a new round every {ch.frequency_days} days. Everyone pays {naira(ch.contribution_amount)} by each round's date.
                {members.length >= 2 && ` With ${members.length} members the pot is ${naira(ch.contribution_amount * members.length)} per round.`}
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
                  onClick={() => window.confirm('Start this group now? The order will be locked.') && run('start', () => api(`/rotation/${id}/start`, { method: 'POST', body: { start_date: startDate } }), 'Group started')}
                >
                  {busy === 'start' ? 'Starting...' : 'Start group'}
                </button>
              </div>
              {order && <p className="small" style={{ color: 'var(--error)', margin: '8px 0 0' }}>Save the new order before you start.</p>}
              {members.length < 2 && <p className="muted small" style={{ margin: '8px 0 0' }}>You need at least 2 members to start.</p>}
            </section>
          </>
        )}

        {/* member: before start sees the order */}
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

        {/* running / finished: the round tracker */}
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
                    <b>{m.name}{m.is_me && ' (you)'}</b>
                    <small>{m.paid_count}/{rounds.length} contributions</small>
                  </div>
                  <span className={`bd ${m.late ? 'late' : 'ontrack'}`}>{m.late ? 'Late' : 'Up to date'}</span>
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