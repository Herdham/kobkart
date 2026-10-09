import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import { naira } from '../api/seller'
import './dashboard.css'

export default function PaymentCallback() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const user = getSession()?.user
  const ref = params.get('reference') || params.get('trxref')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(ref ? '' : 'No payment reference found.')
  const [again, setAgain] = useState(0)

  useEffect(() => {
    if (!ref) return
    let cancelled = false
    setResult(null)
    ;(async () => {
      for (let i = 0; i < 4 && !cancelled; i++) {
        try {
          const r = await api(`/payments/verify/${ref}`)
          if (cancelled) return
          setResult(r)
          if (r.status === 'success' || ['failed', 'abandoned', 'reversed'].includes(r.paystack_status)) return
        } catch (e) {
          if (cancelled) return
          if (e.status === 401) nav('/login', { replace: true })
          else setError(e.message)
          return
        }
        await new Promise((res) => setTimeout(res, 2500))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ref, again, nav])

  let card = null
  if (error) {
    card = <div className="alert">{error}</div>
  } else if (!result) {
    card = (
      <div className="db-card cb-card">
        <span className="cb-icon wait"><Clock size={34} /></span>
        <h1>Confirming your payment...</h1>
        <p>Please wait a moment. Do not close this page.</p>
      </div>
    )
  } else if (result.status === 'success') {
    card = (
      <div className="db-card cb-card">
        <span className="cb-icon"><CheckCircle2 size={36} /></span>
        <h1>Payment successful</h1>
        <div className="cb-amount">{naira(result.amount)}</div>
        <p>for {result.product_name}</p>
        <div className="fm-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="db-btn" onClick={() => nav(`/plans/${result.plan_id}`)}>View receipt</button>
          <button className="db-btn ghost" onClick={() => nav('/dashboard')}>Go to dashboard</button>
        </div>
      </div>
    )
  } else if (['failed', 'abandoned', 'reversed'].includes(result.paystack_status)) {
    card = (
      <div className="db-card cb-card">
        <span className="cb-icon bad"><XCircle size={36} /></span>
        <h1>Payment not completed</h1>
        <p>This payment did not go through. You can try again whenever you are ready. If your bank says money left your account, tap "Check again" in a few minutes.</p>
        <div className="fm-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="db-btn" onClick={() => nav(`/plans/${result.plan_id}`)}>Try again</button>
          <button className="db-btn ghost" onClick={() => setAgain((n) => n + 1)}>Check again</button>
        </div>
      </div>
    )
  } else {
    card = (
      <div className="db-card cb-card">
        <span className="cb-icon wait"><Clock size={34} /></span>
        <h1>Still confirming</h1>
        <p>Your bank is still processing this payment. It usually takes a minute.</p>
        <div className="fm-actions" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="db-btn" onClick={() => setAgain((n) => n + 1)}>Check again</button>
          <button className="db-btn ghost" onClick={() => nav('/dashboard')}>Go to dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout name={user?.full_name} role="customer" active="dashboard">
      {card}
    </DashboardLayout>
  )
}