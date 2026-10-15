import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock } from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { api } from '../api/http'
import { getSession } from '../api/auth'
import './dashboard.css'

export default function BillingCallback() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const user = getSession()?.user
  const ref = params.get('reference') || params.get('trxref')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(ref ? '' : 'No payment reference found.')

  useEffect(() => {
    if (!ref) return
    let off = false
    ;(async () => {
      for (let i = 0; i < 4 && !off; i++) {
        try {
          const r = await api(`/billing/verify/${ref}`)
          if (off) return
          setResult(r)
          if (r.status === 'success' || ['failed', 'abandoned', 'reversed'].includes(r.paystack_status)) return
        } catch (e) {
          if (off) return
          if (e.status === 401) nav('/login', { replace: true })
          else setError(e.message)
          return
        }
        await new Promise((res) => setTimeout(res, 2500))
      }
    })()
    return () => {
      off = true
    }
  }, [ref, nav])

  let card
  if (error) card = <div className="alert">{error}</div>
  else if (!result) {
    card = <div className="db-card cb-card"><span className="cb-icon wait"><Clock size={34} /></span><h1>Confirming your payment...</h1><p>Please wait a moment.</p></div>
  } else if (result.status === 'success') {
    card = (
      <div className="db-card cb-card">
        <span className="cb-icon"><CheckCircle2 size={36} /></span>
        <h1>Plan activated</h1>
        <p>Your {result.plan} plan is now active. Thank you!</p>
        <Link className="db-btn" to="/billing">See my plan</Link>
      </div>
    )
  } else {
    card = (
      <div className="db-card cb-card">
        <span className="cb-icon wait"><Clock size={34} /></span>
        <h1>Not confirmed yet</h1>
        <p>If your bank says the money left your account, your plan activates within a few minutes. Otherwise you can try again.</p>
        <Link className="db-btn" to="/billing">Back to my plan</Link>
      </div>
    )
  }

  return <DashboardLayout name={user?.full_name} role="seller" active="billing">{card}</DashboardLayout>
}