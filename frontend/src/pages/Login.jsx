import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import TextField from '../components/TextField'
import SocialButtons from '../components/SocialButtons'
import { login, sendCode } from '../api/auth'

export default function Login() {
  const nav = useNavigate()
  const { state } = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate() {
    const e = {}
    if (!identifier.trim()) e.identifier = 'Enter your email or phone number'
    if (!password) e.password = 'Enter your password'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function onSubmit(ev) {
    ev.preventDefault()
    setApiError('')
    if (!validate()) return
    setLoading(true)
    try {
      await login({ identifier: identifier.trim(), password, remember })
      nav('/dashboard')
    } catch (err) {
      if (err.code === 'email_not_verified') {
        try {
          await sendCode({ email: err.email, purpose: 'verify' })
        } catch {
          /* they can tap "Resend code" on the next screen */
        }
        nav('/verify-email', { state: { email: err.email, purpose: 'verify' } })
        return
      }
      setApiError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      topText="Don't have an account?"
      topLink={{ to: '/register', label: 'Sign Up' }}
      tagline={['Your plans.', 'Your products.', 'Our platform.']}
      image="login"
    >
      <span className="pill"><ShieldCheck size={16} /> Welcome Back</span>
      <h1 className="title">
        Log in to your<br />
        <span className="accent">Kobkart account</span>
      </h1>
      <p className="subtitle">
        Access your contribution plans, track your payments and stay connected with your sellers.
      </p>

      {state?.notice && <div className="alert info">{state.notice}</div>}
      {apiError && <div className="alert">{apiError}</div>}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          icon={Mail}
          placeholder="Email address or phone number"
          aria-label="Email address or phone number"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={errors.identifier}
        />
        <TextField
          icon={Lock}
          type="password"
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <div className="row-between">
          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>
          <Link to="/forgot-password" className="link-strong">Forgot password?</Link>
        </div>

        <button className="btn-primary" disabled={loading}>
          {loading ? 'Logging in...' : <>Log In <ArrowRight size={18} /></>}
        </button>
      </form>

      <SocialButtons />

      <p className="switch">
        New to Kobkart?{' '}
        <Link to="/register" className="link-strong">Create an account <ArrowRight size={15} /></Link>
      </p>
    </AuthLayout>
  )
}
