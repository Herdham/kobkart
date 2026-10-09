import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Logo from './Logo'
import FeatureStrip from './FeatureStrip'
import logo from '../assets/kobkart-logo.png'

// Picks up optional photos from src/assets/illustrations (login.png, seller.png ...)
const images = import.meta.glob('../assets/illustrations/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
})

function findImage(name) {
  const key = Object.keys(images).find((k) => k.split('/').pop().startsWith(`${name}.`))
  return key ? images[key] : null
}

export default function AuthLayout({ topText, topLink, tagline = [], image, children }) {
  const src = image ? findImage(image) : null
  return (
    <div className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <Logo />
          {topLink && (
            <div className="top-link">
              {topText && <span>{topText} </span>}
              <Link to={topLink.to}>
                {topLink.label} <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </header>

        <div className="auth-body">
          <main className="auth-main">{children}</main>
          <aside className="auth-art" aria-hidden="true">
            <div className="tagline">
              {tagline.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div className="blob">
              {src ? <img src={src} alt="" /> : <img src={logo} alt="" className="blob-logo" />}
            </div>
          </aside>
        </div>

        <FeatureStrip />
      </div>
    </div>
  )
}
