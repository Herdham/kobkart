import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, MailCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import OtpInput from '../components/OtpInput'
import { DEMO_CODE, IS_MOCK, sendCode, verifyCode } from '../api/auth'

function maskEmail(email) {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 2)}***@${domain}`
}

// purpose: 'verify' (after sign up) or 'reset' (forgot password)
export default function VerifyCode() {
  const { state } = useLocation()
  if (!state?.email) return <Navigate to="/login" replace />
  return <VerifyInner email={state.email} purpose={state.purpose || 'verify'} />
}

function VerifyInner({ email, purpose }) {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [seconds, setSeconds] = useState(30)

  useEffect(() => {
    if (seconds <= 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  async function onSubmit(ev) {
    ev.preventDefault()
    if (code.length < 6) {
      setError('Enter all 6 digits')
      return
    }
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await verifyCode({ email, code, purpose })
      if (purpose === 'verify') nav('/dashboard', { replace: true })
      else nav('/reset-password', { state: { email, code }, replace: true })
    } catch (err) {
      setError(err.message)
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  async function onResend() {
    if (seconds > 0) return
    try {
      await sendCode({ email, purpose })
      setSeconds(30)
      setCode('')
      setError('')
      setInfo('A new code has been sent.')
    } catch (err) {
      setError(err.message)
    }
  }

  const isVerify = purpose === 'verify'
  return (
    <AuthLayout
      topLink={{ to: isVerify ? '/register' : '/forgot-password', label: 'Change email' }}
      tagline={['Almost there!']}
      image="forgot"
    >
      <span className="pill"><MailCheck size={16} /> Check your email</span>
      <h1 className="title">
        {isVerify ? 'Verify your' : 'Enter your'}<br />
        <span className="accent">{isVerify ? 'email address' : 'reset code'}</span>
      </h1>
      <p className="subtitle">
        We sent a 6-digit code to <b>{maskEmail(email)}</b>. Enter it below to continue.
      </p>

      {info && <div className="alert info">{info}</div>}

      <form onSubmit={onSubmit} noValidate>
        <OtpInput value={code} onChange={setCode} error={!!error} />
        {error && <p className="field-error otp-error">{error}</p>}

        <button className="btn-primary" disabled={loading || code.length < 6}>
          {loading ? 'Checking...' : <>Verify <ArrowRight size={18} /></>}
        </button>
      </form>

      <p className="switch center">
        Didn't get the code?{' '}
        {seconds > 0 ? (
          <span className="muted">Resend in 0:{String(seconds).padStart(2, '0')}</span>
        ) : (
          <button type="button" className="link-btn" onClick={onResend}>Resend code</button>
        )}
      </p>
      {IS_MOCK && <p className="demo-hint">Demo mode: use code {DEMO_CODE}</p>}
    </AuthLayout>
  )
}
