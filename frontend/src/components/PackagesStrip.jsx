import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import PublicPackageCard from './PublicPackageCard'
import { api } from '../api/http'
import './packages.css'

// Shows real public packages on the landing page. Shows nothing if there are none yet.
export default function PackagesStrip() {
  const [items, setItems] = useState([])

  useEffect(() => {
    api('/browse?limit=6').then(setItems).catch(() => {})
  }, [])

  if (!items.length) return null

  return (
    <section className="bp-strip">
      <div className="lp-wrap">
        <div className="bp-strip-head">
          <div>
            <span className="lp-tag">Popular packages</span>
            <h2>Find something to <em>pay for, small small</em></h2>
          </div>
          <Link to="/browse" className="lp-btn lp-btn-outline">Browse all <ArrowRight size={16} /></Link>
        </div>
        <div className="bp-grid">
          {items.map((p) => <PublicPackageCard key={p.id} p={p} />)}
        </div>
      </div>
    </section>
  )
}