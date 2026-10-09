import { Link } from 'react-router-dom'
import logo from '../assets/kobkart-logo.png'

export default function Logo() {
  return (
    <Link to="/" className="brand">
      <img src={logo} alt="Kobkart logo" className="brand-logo" />
      <span>
        <span className="brand-name">Kobkart</span>
        <span className="brand-tag">Shop Together, Grow Together</span>
      </span>
    </Link>
  )
}
