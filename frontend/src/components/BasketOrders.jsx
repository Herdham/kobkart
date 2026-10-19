import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { api } from '../api/http'
import { naira, whatsappLink } from '../api/seller'

const lineText = (it) => {
  const opts = [it.color, it.size].filter(Boolean).join(', ')
  return `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}${opts ? ` (${opts})` : ''}`
}

export default function BasketOrders({ channelId }) {
  const [rows, setRows] = useState([])
  const [copied, setCopied] = useState('')
  useEffect(() => {
    api('/seller/baskets').then(setRows).catch(() => {})
  }, [])
  const list = channelId ? rows.filter((r) => r.channel_id === channelId) : rows
  if (!list.length) return null

  async function copy(r) {
    const text = `${r.customer_name}: ${r.items.map(lineText).join(', ')} | Total ${naira(r.spent)}${r.remaining > 0 ? ` | Balance ${naira(r.remaining)}` : ''}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(r.plan_id)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      /* ignore */
    }
  }

  const status = (r) =>
    r.status === 'delivered' ? 'Delivered' : r.paid >= r.budget ? 'Fully paid, ready to prepare' : `Paid ${naira(r.paid)} of ${naira(r.budget)}`

  return (
    <section className="db-card">
      <div className="db-card-head"><h2>Baskets to prepare ({list.length})</h2></div>
      {list.map((r) => (
        <div className="bk-line" key={r.plan_id}>
          <div className="bk-info">
            <b>{r.customer_name} • {r.channel_name}</b>
            <small>{status(r)}</small>
            {r.items.map((it) => (
              <small key={it.id}>
                {lineText(it)}: <b>{naira(it.unit_price * it.quantity)}</b>
                {it.note ? ` • Note: ${it.note}` : ''}
              </small>
            ))}
            <small><b>Total {naira(r.spent)}</b> of {naira(r.budget)}</small>
            {r.remaining > 0 && <small>Balance to give {r.customer_name} at delivery: <b>{naira(r.remaining)}</b></small>}
          </div>
          <div className="bk-end">
            <button className="db-btn sm ghost" onClick={() => copy(r)}>{copied === r.plan_id ? 'Copied' : 'Copy list'}</button>
            {r.customer_phone && (
              <a className="db-btn sm ghost" target="_blank" rel="noreferrer" href={whatsappLink(r.customer_phone, `Hello ${r.customer_name}, about your basket (${r.items.map(lineText).join(', ')}).`)}>
                <MessageCircle size={14} />
              </a>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}