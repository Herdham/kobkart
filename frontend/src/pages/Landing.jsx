import { useState } from 'react'
import PackagesStrip from '../components/PackagesStrip'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ClipboardList, CreditCard, Heart, Menu, Package, Play,
  ShieldCheck, Sparkles, Star, Store, User, UserPlus, Users, Wallet, X, Zap,
} from 'lucide-react'
import Logo from '../components/Logo'
import logo from '../assets/kobkart-logo.png'
import './landing.css'

// Optional photos in src/assets/illustrations: hero.png, avatar1.png, avatar2.png, avatar3.png
const photos = import.meta.glob('../assets/illustrations/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})
const photo = (name) => {
  const key = Object.keys(photos).find((p) => p.split('/').pop().startsWith(`${name}.`))
  return key ? photos[key] : null
}

const NAV = [
  ['Home', '#top'],
  ['How It Works', '#how'],
  ['Features', '#features'],
  ['About', '#about'],
  ['Browse', '/browse'],
]

const BENEFITS = [
  { icon: Users, title: 'Join Contribution Groups', text: 'Be part of trusted groups and choose from available packages.' },
  { icon: CreditCard, title: 'Make Secure Payments', text: 'Pay easily and track your contributions in real-time.' },
  { icon: Package, title: 'Get Your Products', text: "Once you've completed your plan, receive your items as agreed." },
  { icon: ShieldCheck, title: 'Trusted & Safe', text: 'Verified sellers, secure payments and transparent processes.' },
]

const STEPS = [
  { icon: UserPlus, title: 'Create Account', text: 'Sign up as a buyer or seller in minutes.' },
  { icon: Users, title: 'Join a Package', text: 'Browse available products and join a contribution group.' },
  { icon: CreditCard, title: 'Make Payments', text: 'Pay as scheduled and track your progress.' },
  { icon: Package, title: 'Receive Your Item', text: 'Get your product once your plan is completed.' },
]

const WHY = [
  { icon: Users, title: 'For Everyone', text: "Whether you're a buyer or a seller, Kobkart is designed for you." },
  { icon: ShieldCheck, title: 'Secure & Transparent', text: 'Your payments and data are protected.' },
  { icon: Zap, title: 'Easy to Use', text: 'A clean and simple experience on any device.' },
  { icon: Heart, title: 'Built for the Community', text: 'We support small businesses and everyday dreamers.' },
]

// SAMPLE TEXT: replace with real feedback from your first users before launch.
const REVIEWS = [
  { name: 'Aisha S.', role: 'Customer', photo: 'avatar1', text: 'Kobkart makes it so easy to plan and pay for the things I want. I love how simple and organized it is.' },
  { name: 'Abdullahi K.', role: 'Seller', photo: 'avatar2', text: 'As a small business owner, this platform has helped me reach more customers and manage payments without stress.' },
  { name: 'Zainab M.', role: 'Customer', photo: 'avatar3', text: 'I joined a package for my dress and everything was so clear, from the payment dates to delivery.' },
]

export default function Landing() {
  const [open, setOpen] = useState(false)
  const hero = photo('hero')

  return (
    <div className="lp">
      {/* ---------- navbar ---------- */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Logo />
          <nav className={open ? 'open' : ''}>
            <div className="lp-links">
              {NAV.map(([label, href], i) => (
                <a key={label} href={href} className={i === 0 ? 'active' : ''} onClick={() => setOpen(false)}>
                  {label}
                </a>
              ))}
            </div>
            <div className="lp-cta-btns">
              <Link to="/login" className="lp-btn lp-btn-outline">Log In</Link>
              <Link to="/register" className="lp-btn lp-btn-solid">Sign Up</Link>
            </div>
          </nav>
          <button className="lp-burger" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero" id="top">
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <span className="lp-chip">
              <Users size={16} /> Group Buying <i>•</i> Installment Plans <i>•</i> Trusted Sellers
            </span>
            <h1>
              Your Plans.<br />Your Products.<br /><em>Our Platform.</em>
            </h1>
            <p>Join contribution groups, make easy payments, and get the products you want — step by step.</p>
            <div className="lp-hero-btns">
              <Link to="/register" className="lp-btn lp-btn-solid lp-btn-lg">
                Get Started <ArrowRight size={18} />
              </Link>
              <a href="#how" className="lp-btn lp-btn-outline lp-btn-lg">
                <Play size={15} /> Watch How It Works
              </a>
            </div>
          </div>

          <div className="lp-hero-art">
            <div className="lp-art-blob" />
            <div className="lp-phone">
              <div className="lp-phone-screen">
                <div className="lp-ph-top"><img src={logo} alt="" /><b>Kobkart</b></div>
                <p className="lp-ph-hi">Good morning,<br /><b>Let's shop together!</b></p>
                <div className="lp-ph-search">Search for stores, products...</div>
                <div className="lp-ph-grid">
                  <span><Store size={18} />Sellers</span>
                  <span><ClipboardList size={18} />My Plans</span>
                  <span><Wallet size={18} />Payments</span>
                  <span><User size={18} />Profile</span>
                </div>
                <div className="lp-ph-card">
                  <b>Start your journey</b>
                  <small>Join a seller's package and pay in installments.</small>
                  <em>Browse Sellers</em>
                </div>
              </div>
            </div>
            {hero && <img className="lp-hero-photo" src={hero} alt="" />}
            <div className="lp-hand">Small<br />contributions<br />Big dreams</div>
          </div>
        </div>
      </section>

      {/* ---------- benefits ---------- */}
      <section className="lp-benefits" id="features">
        <div className="lp-wrap lp-benefits-in">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <span className="lp-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <PackagesStrip />
      <section className="lp-how" id="how">
        <div className="lp-wrap lp-how-in">
          <div>
            <span className="lp-tag">How It Works</span>
            <h2>It's Simple. <em>4 Easy Steps.</em></h2>
            <p>From choosing a product to receiving it, we make the process smooth, transparent and stress-free.</p>
            <Link to="/register" className="lp-btn lp-btn-solid lp-btn-lg">Get Started <ArrowRight size={18} /></Link>
          </div>
          <div className="lp-steps">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div className="lp-step" key={title}>
                <span className="lp-num">{i + 1}</span>
                <span className="lp-icon"><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- why kobkart ---------- */}
      <section className="lp-why" id="about">
        <div className="lp-wrap lp-why-in">
          <div>
            <span className="lp-tag">Why Choose Kobkart</span>
            <h2>More Than Just Shopping.<br /><em>It's a Community.</em></h2>
            <p>We're building a platform that makes group buying and installment shopping easier, safer and more accessible for everyone.</p>
            <a href="#how" className="lp-btn lp-btn-solid">Learn More <ArrowRight size={16} /></a>
          </div>
          <div className="lp-why-grid">
            {WHY.map(({ icon: Icon, title, text }) => (
              <div className="lp-why-item" key={title}>
                <span className="lp-icon"><Icon size={22} /></span>
                <div><h3>{title}</h3><p>{text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- reviews ---------- */}
      <section className="lp-reviews">
        <div className="lp-wrap">
          <div className="lp-center">
            <span className="lp-tag">What People Say</span>
            <h2>Real People. <em>Real Experiences.</em></h2>
            <p>Here's what our early users have to say about Kobkart.</p>
          </div>
          <div className="lp-review-grid">
            {REVIEWS.map((r) => (
              <article className="lp-review" key={r.name}>
                <div className="lp-review-top">
                  {photo(r.photo) ? <img src={photo(r.photo)} alt={r.name} /> : <span className="lp-avatar">{r.name[0]}</span>}
                  <p>“{r.text}”</p>
                </div>
                <div className="lp-review-bottom">
                  <div><b>{r.name}</b><small>{r.role}</small></div>
                  <span className="lp-stars">
                    {[0, 1, 2, 3, 4].map((n) => <Star key={n} size={13} fill="currentColor" />)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- call to action ---------- */}
      <section className="lp-wrap lp-cta-wrap">
        <div className="lp-cta">
          <div className="lp-cta-text">
            <span className="lp-cta-icon"><Sparkles size={24} /></span>
            <div>
              <h3>Ready to Start?</h3>
              <p>Join Kobkart today and take the first step toward your next purchase.</p>
            </div>
          </div>
          <Link to="/register" className="lp-btn lp-btn-white">Get Started <ArrowRight size={16} /></Link>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-foot-top">
            <Logo />
            <div className="lp-foot-links">
              {NAV.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
              <a href="#top">Contact</a>
            </div>
            <div className="lp-foot-links">
              <a href="#top">Instagram</a>
              <a href="#top">X</a>
              <a href="#top">Facebook</a>
            </div>
          </div>
          <div className="lp-foot-bottom">
            <span>© {new Date().getFullYear()} Kobkart. All rights reserved.</span>
            <span>Privacy Policy &nbsp;·&nbsp; Terms &amp; Conditions</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
