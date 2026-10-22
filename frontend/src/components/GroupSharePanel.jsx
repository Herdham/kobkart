import { useEffect, useState } from 'react'
import { Check, Copy, Image as ImageIcon, MessageCircle } from 'lucide-react'
import { api } from '../api/http'
import { naira } from '../api/seller'
import { progressBlob } from '../api/progressCard'

export default function GroupSharePanel({ channel, kind }) {
  const [st, setSt] = useState(null)
  const [copied, setCopied] = useState('')
  const [busy, setBusy] = useState(false)
  const isGroup = (kind || channel.kind) === 'rotation'

  useEffect(() => {
    if (isGroup) api(`/seller/groups/${channel.id}/status`).then(setSt).catch(() => {})
  }, [channel.id, isGroup])
  if (!isGroup || !st) return null

  const link = `${window.location.origin}/g/${st.invite_code}`
  const text = [
    `📦 *${st.name}*`,
    st.current_round ? `Round ${st.current_round} of ${st.members_count}${st.next_collector ? ` • Next to collect: ${st.next_collector}` : ''}${st.next_date ? ` (${st.next_date})` : ''}` : 'All rounds collected',
    `✅ Up to date: ${st.up_to_date}/${st.members_count}`,
    `⏳ Behind: ${st.members_count - st.up_to_date}`,
    `💰 ${naira(st.contribution)} every ${st.frequency_days} days`,
    '',
    'See your status and tap "I have paid" here:',
    link,
  ].join('\n')

  const flash = (k) => {
    setCopied(k)
    setTimeout(() => setCopied(''), 1600)
  }
  const copy = async (k, t) => {
    try {
      await navigator.clipboard.writeText(t)
      flash(k)
    } catch {
      /* ignore */
    }
  }
  async function picture() {
    setBusy(true)
    try {
      const blob = await progressBlob(st, link.replace(/^https?:\/\//, ''))
      const file = new File([blob], 'group-progress.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'group-progress.png'
        a.click()
      }
    } catch {
      /* the person closed the share sheet */
    }
    setBusy(false)
  }

  return (
    <div className="bk-ctl">
      <b>Share progress with your group</b>
      <small className="muted">
        Members open the link, see who has paid and tap "I have paid". No account needed. You confirm each one on your dashboard.
      </small>
      <div className="bk-row">
        <button className="db-btn sm" onClick={() => copy('link', link)}>
          {copied === 'link' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy status link</>}
        </button>
        <a className="db-btn sm ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>
          <MessageCircle size={14} /> Post update on WhatsApp
        </a>
        <button className="db-btn sm ghost" disabled={busy} onClick={picture}>
          <ImageIcon size={14} /> {busy ? 'Making...' : 'Progress picture'}
        </button>
      </div>
    </div>
  )
}