import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShoppingBag } from 'lucide-react'
import { api } from '../api/http'
import { naira } from '../api/seller'

export default function MyBaskets() {
  const [rows, setRows] = useState([])
  useEffect(() => {
    api('/baskets/mine').then(setRows).catch(() => {})
  }, [])
  if (!rows.length) return null
  return (
    <section className="db-card">
      <div className="db-card-head"><h2>My baskets</h2></div>
      <p className="muted small" style={{ margin: '0 0 6px' }}>
        Fill your basket with items up to your budget. Whatever is left over, you collect from your seller after delivery.
      </p>
      {rows.map((r) => (
        <div className="bk-line" key={r.plan_id}>
          <div className="bk-info">
            <b>{r.channel_name}</b>
            <small>
              {r.seller} • {r.items.length ? `${r.items.length} item${r.items.length === 1 ? '' : 's'}` : 'Basket is empty'} • {naira(r.spent)} of {naira(r.budget)} used
            </small>
          </div>
          <div className="bk-end">
            <Link className="db-btn sm" to={`/basket/${r.plan_id}`}><ShoppingBag size={14} /> Open basket</Link>
          </div>
        </div>
      ))}
    </section>
  )
}