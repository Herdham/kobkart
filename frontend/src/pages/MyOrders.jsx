import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, MessageCircle, Package, Users } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira, shortDate, whatsappLink } from '../api/seller'
import { startPayment } from '../api/customer'
import MyBaskets from '../components/MyBaskets'
import './dashboard.css'

const STEPS = ['Paying', 'Fully paid', 'Delivered']
const stepAt = (s) => (s === 'delivered' ? 2 : s === 'completed' ? 1 : 0)

function Stepper({ at }) {
  return (
    <div className="stp">
      {STEPS.map((label, i) => (
        <div key={label} className={`stp-i ${i < at || at === 2 ? 'done' : ''} ${i === at ? 'now' : ''}`}>
          <span>{i < at || at === 2 ? <Check size={12} /> : i + 1}</span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  )
}

export default function MyOrders() {
  const nav = useNavigate()
  const user = getSession()?.user
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('items')
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    api('/orders')
      .then((d) => {
        setData(d)
        if (!d.items.length && d.groups.length) setTab('groups')
      })
      .catch((e) => (e.status === 401 ? nav('/login', { replace: true }) : setError(e.message)))
  }, [nav])

  const say = (m) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  async function pay(id) {
    setPaying(id)
    try {
      await startPayment(id)
    } catch (e) {
      say(e.message)
      setPaying('')
    }
  }

  const q = search.trim().toLowerCase()
  const today = new Date().toLocaleDateString('en-CA')
  const items = (data?.items || []).filter((o) => `${o.product_name} ${o.seller_name} ${o.channel_name}`.toLowerCase().includes(q))
  const groups = (data?.groups || []).filter((g) => `${g.channel_name} ${g.seller_name}`.toLowerCase().includes(q))

  const contact = (who, phone, text) => (phone ? whatsappLink(phone, text) : null)

  return (
    <DashboardLayout name={user?.full_name} role="customer" active="orders" search={search} onSearch={setSearch}>
      <div className="db-stack">
        <MyBaskets />
        <div className="db-page-head">
          <div>
            <h1>My Orders</h1>
            <p className="muted">Follow your items from the first payment to delivery, and see when it is your turn in a group.</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}
        {!data && !error && <div className="db-loading">Loading your orders...</div>}

        {data && (
          <>
            <div className="tabs">
              <button className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>Items<em>{data.items.length}</em></button>
              <button className={tab === 'groups' ? 'on' : ''} onClick={() => setTab('groups')}>Group turns<em>{data.groups.length}</em></button>
            </div>

            {tab === 'items' && (
              items.length === 0 ? (
                <section className="db-card db-empty-pkg">
                  <Package size={34} />
                  <h2>{data.items.length ? 'No match found' : 'No orders yet'}</h2>
                  <p>{data.items.length ? 'Try a different name.' : 'When you join a Save & Collect package, your item shows up here.'}</p>
                  {!data.items.length && <button className="db-btn" onClick={() => nav('/browse')}>Browse packages</button>}
                </section>
              ) : (
                <div className="od-list">
                  {items.map((o) => {
                    const at = stepAt(o.status)
                    const wa = contact(o.seller_name, o.seller_contact, `Hello ${o.seller_name}, this is ${user?.full_name} about my "${o.product_name}" on Kobkart.`)
                    return (
                      <section className="db-card od-card" key={o.plan_id}>
                        <div className="od-img">{o.image_url ? <img src={o.image_url} alt="" /> : <Package size={30} />}</div>
                        <div className="od-body">
                          <h3>{o.product_name}</h3>
                          <small className="muted">{o.channel_name} • {o.seller_name}</small>
                          <Stepper at={at} />
                          <p className="small" style={{ margin: '8px 0 0' }}>
                            {naira(o.amount_paid)} of {naira(o.locked_price)} paid ({o.payments_made}/{o.payments_total} payments) • joined {shortDate(o.joined_at)}
                          </p>
                          {o.status === 'completed' && (
                            <p className="od-note">Fully paid{o.paid_at ? ` on ${shortDate(o.paid_at)}` : ''}. Your seller will arrange delivery. Contact them to agree a time and place.</p>
                          )}
                          {o.status === 'delivered' && <p className="od-note ok">Delivered. Thank you for using Kobkart.</p>}
                          <div className="cp-actions" style={{ marginTop: 10 }}>
                            {o.status === 'active' && (
                              <button className="db-btn sm" disabled={paying === o.plan_id} onClick={() => pay(o.plan_id)}>
                                {paying === o.plan_id ? 'Opening...' : 'Pay now'}
                              </button>
                            )}
                            <button className="db-btn sm ghost" onClick={() => nav(`/plans/${o.plan_id}`)}>Receipts</button>
                            {wa && <a className="db-remind" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Contact seller</a>}
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )
            )}

            {tab === 'groups' && (
              groups.length === 0 ? (
                <section className="db-card db-empty-pkg">
                  <Users size={34} />
                  <h2>{data.groups.length ? 'No match found' : 'No groups yet'}</h2>
                  <p>{data.groups.length ? 'Try a different name.' : 'When you join a Group Rotation package, your turn shows up here.'}</p>
                </section>
              ) : (
                <div className="od-list">
                  {groups.map((g) => {
                    const open = g.group_status === 'open'
                    const state = g.collected ? ['You collected', 'ontrack'] : open ? ['Waiting to start', 'completed'] : g.turn_date && g.turn_date <= today ? ['Your turn now', 'late'] : ['Upcoming', 'cancelled']
                    const wa = contact(g.seller_name, g.seller_contact, `Hello ${g.seller_name}, this is ${user?.full_name} from your group "${g.channel_name}" on Kobkart.`)
                    return (
                      <section className="db-card od-card" key={g.channel_id}>
                        <div className="od-img"><Users size={30} /></div>
                        <div className="od-body">
                          <h3>{g.channel_name} <span className={`bd ${state[1]}`}>{state[0]}</span></h3>
                          <small className="muted">{g.seller_name} • member #{g.position} of {g.member_count}</small>
                          <p className="small" style={{ margin: '8px 0 0' }}>
                            {open
                              ? 'The seller has not started the group yet. Your turn date is set when it starts.'
                              : `You collect goods worth ${naira(g.contribution_amount * g.member_count)} in round ${g.position}${g.turn_date ? ` on ${shortDate(g.turn_date)}` : ''}.`}
                          </p>
                          {!open && <p className="small" style={{ margin: '4px 0 0' }}>{g.paid_count}/{g.member_count} of your contributions paid.</p>}
                          <p className="small" style={{ margin: '4px 0 0' }}>Your pick: <b>{g.choice || 'not chosen yet'}</b></p>
                          <div className="cp-actions" style={{ marginTop: 10 }}>
                            <button className="db-btn sm" onClick={() => nav(`/groups/${g.channel_id}`)}>View group</button>
                            {wa && <a className="db-remind" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Contact seller</a>}
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )
            )}
          </>
        )}
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </DashboardLayout>
  )
}