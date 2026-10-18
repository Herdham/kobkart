import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CheckCircle2, Copy, MessageCircle, X } from 'lucide-react'
import { api } from '../api/http'
import { naira, whatsappLink } from '../api/seller'
import { getSession } from '../api/auth'

function TransferModal({ info, onClose }) {
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const me = getSession()?.user?.full_name || ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.account_number)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  async function paid() {
    setBusy(true)
    setError('')
    try {
      await api(`/plans/${info.plan_id}/claim`, { method: 'POST', body: {} })
      setSent(true)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  const receipt = `Hello, I have paid ${naira(info.amount)} to you by bank transfer. Name: ${me}.`
  const ask = `Hello, please send me your account details so I can pay ${naira(info.amount)}. Name: ${me}.`

  return (
    <div className="tm-back" onClick={onClose}>
      <div className="tm-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="tm-x" onClick={onClose} aria-label="Close"><X size={18} /></button>

        {sent ? (
          <>
            <div className="tm-done"><CheckCircle2 size={40} /></div>
            <h2 style={{ textAlign: 'center' }}>Your seller has been told</h2>
            <p className="muted small" style={{ textAlign: 'center', margin: '0 0 16px' }}>
              {info.seller} will confirm once they see {naira(info.amount)} in their account. Your balance updates then.
            </p>
            <a className="db-btn ghost" target="_blank" rel="noreferrer" href={whatsappLink(info.whatsapp, receipt)}>
              <MessageCircle size={16} /> Also send the receipt on WhatsApp
            </a>
            <button className="db-btn" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <h2>Online payment is coming soon</h2>
            <p className="muted small" style={{ margin: '0 0 14px' }}>
              For now, pay <b>{info.seller}</b> directly by bank transfer. Your seller confirms it, and your balance updates.
            </p>

            <div className="tm-amount">Amount to send <b>{naira(info.amount)}</b></div>

            {info.account_number ? (
              <>
                <div className="payout-box">
                  <div>
                    <b>{info.account_number}</b>
                    <small>{info.bank} • {info.account_name}</small>
                  </div>
                  <button className="db-btn ghost" onClick={copy}><Copy size={15} /> {copied ? 'Copied' : 'Copy'}</button>
                </div>
                <ol className="tr-steps">
                  <li>Transfer {naira(info.amount)} to the account above.</li>
                  <li>Come back here and tap <b>I have paid</b>.</li>
                </ol>
                {error && <div className="alert" style={{ marginBottom: 10 }}>{error}</div>}
                <button className="db-btn" disabled={busy} onClick={paid}>{busy ? 'Sending...' : 'I have paid by transfer'}</button>
                <a className="db-btn ghost" style={{ marginTop: 8 }} target="_blank" rel="noreferrer" href={whatsappLink(info.whatsapp, receipt)}>
                  <MessageCircle size={16} /> Send receipt on WhatsApp
                </a>
              </>
            ) : (
              <>
                <p className="small" style={{ margin: '0 0 14px' }}>
                  {info.seller} has not added bank details yet. Message them and they will send you their account.
                </p>
                <a className="db-btn" target="_blank" rel="noreferrer" href={whatsappLink(info.whatsapp, ask)}>
                  <MessageCircle size={16} /> Ask the seller on WhatsApp
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Opens the popup from anywhere (no page needs to be changed).
export function showTransfer(info) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => {
    root.unmount()
    host.remove()
  }
  root.render(<TransferModal info={info} onClose={close} />)
}