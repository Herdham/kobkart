import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, KeyRound, Mail } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import TextField from '../components/TextField'
import { sendCode } from '../api/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(ev) {
    ev.preventDefault()
    setApiError('')
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) {
      setError('Enter the email linked to your account')
      return
    }
    setError('')
    setLoading(true)
    try {
      await sendCode({ email: value, purpose: 'reset' })
      nav('/verify-email', { state: { email: value, purpose: 'reset' } })
    } catch (err) {
      setApiError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      topText="Remembered it?"
      topLink={{ to: '/login', label: 'Log In' }}
      tagline={['No stress.', "We've got you."]}
      image="forgot"
    >
      <span className="pill"><KeyRound size={16} /> Password help</span>
      <h1 className="title">
        Forgot your<br />
        <span className="accent">password?</span>
      </h1>
      <p className="subtitle">
        Enter the email linked to your account and we'll send you a 6-digit code to reset it.
      </p>

      {apiError && <div className="alert">{apiError}</div>}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          icon={Mail}
          type="email"
          placeholder="Email address"
          aria-label="Email address"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <button className="btn-primary" disabled={loading}>
          {loading ? 'Sending code...' : <>Send Code <ArrowRight size={18} /></>}
        </button>
      </form>

      <p className="switch">
        <Link to="/login" className="link-strong"><ArrowLeft size={15} /> Back to log in</Link>
      </p>
    </AuthLayout>
  )
}
