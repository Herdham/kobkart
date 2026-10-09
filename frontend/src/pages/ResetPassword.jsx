import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Lock, ShieldCheck } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import TextField from '../components/TextField'
import { resetPassword } from '../api/auth'

export default function ResetPassword() {
  const { state } = useLocation()
  if (!state?.email || !state?.code) return <Navigate to="/forgot-password" replace />
  return <ResetInner email={state.email} code={state.code} />
}

function ResetInner({ email, code }) {
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(ev) {
    ev.preventDefault()
    setApiError('')
    const e = {}
    if (password.length < 8) e.password = 'Use at least 8 characters'
    if (confirm !== password) e.confirm = 'Passwords do not match'
    setErrors(e)
    if (Object.keys(e).length) return
    setLoading(true)
    try {
      await resetPassword({ email, code, password })
      setDone(true)
    } catch (err) {
      setApiError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthLayout tagline={['All set!']} image="forgot">
        <div className="success">
          <span className="success-icon"><CheckCircle2 size={34} /></span>
          <h1 className="title">Password <span className="accent">updated</span></h1>
          <p className="subtitle">Your password has been changed. You can now log in with your new password.</p>
          <button
            className="btn-primary"
            onClick={() => nav('/login', { state: { notice: 'Password updated. Log in with your new password.' }, replace: true })}
          >
            Log In <ArrowRight size={18} />
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout tagline={['Fresh start,', 'stronger lock.']} image="forgot">
      <span className="pill"><ShieldCheck size={16} /> Almost done</span>
      <h1 className="title">
        Create a new<br />
        <span className="accent">password</span>
      </h1>
      <p className="subtitle">Choose a strong password you haven't used before. At least 8 characters.</p>

      {apiError && <div className="alert">{apiError}</div>}

      <form onSubmit={onSubmit} noValidate>
        <TextField icon={Lock} type="password" placeholder="New password" aria-label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <TextField icon={Lock} type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <button className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : <>Reset Password <ArrowRight size={18} /></>}
        </button>
      </form>
    </AuthLayout>
  )
}
