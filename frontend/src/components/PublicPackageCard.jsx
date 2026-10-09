import { Link } from 'react-router-dom'
import { Package, ShieldCheck, Users } from 'lucide-react'
import { API } from '../api/http'
import { naira } from '../api/seller'
import { categoryLabel } from '../api/categories'
import './packages.css'

export default function PublicPackageCard({ p }) {
  const group = p.kind === 'rotation'
  return (
    <Link to={`/join/${p.invite_code}`} className="bp-card">
      <div className="bp-img">
        {p.has_image ? <img src={`${API}/channels/${p.id}/image`} alt="" loading="lazy" /> : <Package size={34} />}
        <span className="bp-cat">{categoryLabel(p.category)}</span>
        {group && <span className="bp-kind">Group</span>}
      </div>
      <div className="bp-body">
        <h3>{p.name}</h3>
        <small className="bp-seller">{p.seller_name} <ShieldCheck size={13} /></small>
        <div className="bp-price">
          <b>{naira(p.contribution_amount)}</b>
          <span>every {p.frequency_days} day{p.frequency_days > 1 ? 's' : ''}</span>
        </div>
        <div className="bp-meta">
          {group ? (
            <>
              <span>Group of {p.slots}</span>
              <span>Pot {naira(p.contribution_amount * (p.slots || 0))}</span>
            </>
          ) : (
            <>
              <span>{p.product_count} item{p.product_count === 1 ? '' : 's'}</span>
              {p.min_price != null && <span>from {naira(p.min_price)}</span>}
            </>
          )}
        </div>
        <div className="bp-foot">
          <span><Users size={13} /> {group ? `${p.filled}/${p.slots} joined` : `${p.participants} joined`}</span>
          <em>View</em>
        </div>
      </div>
    </Link>
  )
}