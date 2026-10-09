import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bell, ChevronDown, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquare,
  Package, Search, Settings, ShoppingBag, Store, TrendingUp, Users, X,
} from 'lucide-react'
import logo from '../assets/kobkart-logo.png'
import { clearSession } from '../api/auth'

// [key, label, icon, route]. No route = "Soon".
const NAVS = {
  seller: [
    ['dashboard', 'Dashboard', LayoutDashboard, '/dashboard'],
    ['store', 'My Store', Store, '/store'],
    ['packages', 'Packages', Package, '/packages'],
    ['customers', 'Customers', Users, '/customers'],
    ['payments', 'Payments', CreditCard, '/payments'],
    ['orders', 'Orders', ShoppingBag, '/orders'],
    ['messages', 'Messages', MessageSquare],
    ['reports', 'Reports', TrendingUp],
    ['settings', 'Settings', Settings],
  ],
  customer: [
    ['dashboard', 'Dashboard', LayoutDashboard, '/dashboard'],
    ['browse', 'Browse Packages', Search, '/browse'],
    ['join', 'Join with a code', Package, '/join'],
    ['contributions', 'My Contributions', CreditCard, '/contributions'],
    ['orders', 'My Orders', ShoppingBag],
    ['messages', 'Messages', MessageSquare],
    ['settings', 'Settings', Settings],
  ],
  admin: [
    ['dashboard', 'Dashboard', LayoutDashboard, '/dashboard'],
    ['users', 'Users', Users],
    ['reports', 'Reports', TrendingUp],
    ['settings', 'Settings', Settings],
  ],
}

export default function DashboardLayout({
  name = 'Seller', role = 'seller', active = 'dashboard', search = '', onSearch, onSoon, children,
}) {
  const nav = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState('')

  const soon = (label) => {
    if (onSoon) return onSoon(label)
    setToast(`${label} is coming soon`)
    setTimeout(() => setToast(''), 2200)
  }

  function go(to, label) {
    setDrawer(false)
    if (to) nav(to)
    else soon(label)
  }

  function logout() {
    clearSession()
    nav('/login')
  }

  return (
    <div className="db">
      <aside className={`db-side ${drawer ? 'open' : ''}`}>
        <div className="db-side-top">
          <div className="db-brand">
            <img src={logo} alt="Kobkart" />
            <span><b>Kobkart</b><small>Shop Together, Grow Together</small></span>
          </div>
          <button className="db-close" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={22} /></button>
        </div>

        <nav className="db-nav-list">
          {(NAVS[role] || NAVS.seller).map(([key, label, Icon, to]) => (
            <button key={key} className={`db-nav ${key === active ? 'active' : ''}`} onClick={() => go(to, label)}>
              <Icon size={19} /> {label} {!to && <em>Soon</em>}
            </button>
          ))}
        </nav>

        <div className="db-note">Together<br />we make<br />dreams happen ♥</div>
      </aside>
      {drawer && <div className="db-backdrop" onClick={() => setDrawer(false)} />}

      <div className="db-main">
        <header className="db-top">
          <button className="db-burger" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={22} /></button>

          {onSearch ? (
            <>
              {/* desktop: normal search box */}
              <label className="db-search db-search-desk">
                <Search size={18} />
                <input
                  placeholder="Search packages, customers, or products..."
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                />
              </label>
              {/* phone: icon that opens the full-width search bar */}
              <button className="db-icon-btn db-search-btn" onClick={() => setSheet(true)} aria-label="Search">
                <Search size={20} />
                {search && <i className="db-dot" />}
              </button>
            </>
          ) : (
            <div className="db-spacer" />
          )}

          <button className="db-icon-btn" onClick={() => soon('Notifications')} aria-label="Notifications"><Bell size={20} /></button>
          <div className="db-user-wrap">
            <button className="db-user" onClick={() => setMenu(!menu)}>
              <span className="db-avatar">{(name || 'K')[0].toUpperCase()}</span>
              <span className="db-user-text"><b>{name}</b><small>{({ seller: 'Seller', customer: 'Customer', admin: 'Admin' })[role] || 'Seller'}</small></span>
              <ChevronDown size={16} />
            </button>
            {menu && (
              <div className="db-menu">
                <button onClick={logout}><LogOut size={16} /> Log out</button>
              </div>
            )}
          </div>
        </header>

        {/* phone search bar that slides over the top bar */}
        {sheet && onSearch && (
          <div className="db-search-sheet">
            <button className="db-sheet-back" onClick={() => setSheet(false)} aria-label="Close search">
              <ArrowLeft size={22} />
            </button>
            <label className="db-search-full">
              <Search size={18} />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                placeholder="Search packages or customers"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setSheet(false)}
              />
              {search && (
                <button type="button" onClick={() => onSearch('')} aria-label="Clear search"><X size={16} /></button>
              )}
            </label>
          </div>
        )}

        <div className="db-content">{children}</div>
      </div>
      {toast && <div className="db-toast">{toast}</div>}
    </div>
  )
}