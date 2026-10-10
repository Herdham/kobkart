import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Gift, Lock, Mail, Phone, Store, User, Users } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import TextField from '../components/TextField'
import SocialButtons from '../components/SocialButtons'
import { register } from '../api/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const nav = useNavigate()
  const [role, setRole] = useState('customer')
  const [form, setForm] = useState({ full_name: '', business_name: '', email: '', phone: '', password: '', confirm: '', referral: '' })
  const [agreeSeller, setAgreeSeller] = useState(false)
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const isSeller = role === 'seller'

  function validate() {
    const e = {}
    const phoneDigits = form.phone.replace(/\D/g, '')
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name'
    if (isSeller && form.business_name.trim().length < 2) e.business_name = 'Enter your business or store name'
    if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address'
    if (phoneDigits.length < 10 || phoneDigits.length > 13) e.phone = 'Enter a valid phone number'
    if (form.password.length < 8) e.password = 'Use at least 8 characters'
    if (form.confirm !== form.password) e.confirm = 'Passwords do not match'
    if (isSeller && !agreeSeller) e.agreeSeller = 'Please accept the Seller Agreement to continue'
    if (!agree) e.agree = 'Please accept the Terms & Conditions to continue'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function onSubmit(ev) {
    ev.preventDefault()
    setApiError('')
    if (!validate()) return
    setLoading(true)
    try {
      const email = form.email.trim().toLowerCase()
      await register({
        full_name: form.full_name.trim(),
        business_name: isSeller ? form.business_name.trim() : undefined,
        email,
        phone: form.phone.trim(),
        password: form.password,
        role,
        referral_code: form.referral.trim() || undefined,
      })
      nav('/verify-email', { state: { email, purpose: 'verify' } })
    } catch (err) {
      setApiError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      topText="Already have an account?"
      topLink={{ to: '/login', label: 'Log In' }}
      tagline={isSeller ? ['Build your', 'store. Grow', 'your business.'] : ['Shop small.', 'Pay small small.', 'Get it all.']}
      image={isSeller ? 'seller' : 'customer'}
    >
      <span className="pill"><Users size={16} /> Join Kobkart</span>
      <h1 className="title">Create your account</h1>
      <p className="subtitle">
        Start your journey today. Join a community that makes shopping easier, safer and more accessible for everyone.
      </p>

      {apiError && <div className="alert">{apiError}</div>}

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={!isSeller} className={!isSeller ? 'active' : ''} onClick={() => setRole('customer')}>
          <User size={17} /> Customer
        </button>
        <button type="button" role="tab" aria-selected={isSeller} className={isSeller ? 'active' : ''} onClick={() => setRole('seller')}>
          <Store size={17} /> Seller
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <TextField icon={User} placeholder="Full name" aria-label="Full name" autoComplete="name" value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
        {isSeller && (
          <TextField icon={Building2} placeholder="Business or store name" aria-label="Business or store name" autoComplete="organization" value={form.business_name} onChange={set('business_name')} error={errors.business_name} />
        )}
        <TextField icon={Mail} type="email" placeholder="Email address" aria-label="Email address" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <TextField icon={Phone} type="tel" placeholder="Phone number" aria-label="Phone number" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
        <TextField icon={Lock} type="password" placeholder="Password" aria-label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <TextField icon={Lock} type="password" placeholder="Confirm password" aria-label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        <TextField icon={Gift} placeholder="Referral code (optional)" aria-label="Referral code" value={form.referral} onChange={set('referral')} />

        <label className="check terms">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree to the <Link to="/terms" target="_blank" className="link-strong">Terms &amp; Conditions</Link> and <Link to="/privacy" target="_blank" className="link-strong">Privacy Policy</Link></span>
        </label>
        {errors.agree && <p className="field-error">{errors.agree}</p>}
        {isSeller && (
          <label className="check terms">
            <input type="checkbox" checked={agreeSeller} onChange={(e) => setAgreeSeller(e.target.checked)} />
            <span>I have read and accept the <Link to="/seller-agreement" target="_blank" className="link-strong">Seller Agreement</Link></span>
          </label>
        )}
        {errors.agreeSeller && <p className="field-error">{errors.agreeSeller}</p>}

        <button className="btn-primary" disabled={loading}>
          {loading ? 'Creating account...' : <>Create Account <ArrowRight size={18} /></>}
        </button>
      </form>

      <SocialButtons />

      <p className="switch">
        Already have an account?{' '}
        <Link to="/login" className="link-strong">Log In <ArrowRight size={15} /></Link>
      </p>
    </AuthLayout>
  )
}
