import { useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { downloadImage, makeShareCard, shareImage } from '../api/shareCard'

export default function ShareCardButtons({ card, caption, fileName }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  async function run(format, mode) {
    setBusy(format + mode)
    setMsg('')
    try {
      const blob = await makeShareCard({ ...card, format })
      const name = `kobkart-${fileName}-${format}`
      if (mode === 'share') {
        const r = await shareImage(blob, name, caption)
        if (r === 'downloaded') setMsg('Picture saved to your phone. Open WhatsApp, tap Status, and choose it.')
      } else {
        downloadImage(blob, name)
        setMsg('Picture saved to your phone.')
      }
    } catch {
      setMsg('Could not make the picture. Please try again.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="shr">
      <b>Share as a picture</b>
      <div className="fm-actions">
        <button className="db-btn sm" disabled={!!busy} onClick={() => run('status', 'share')}><Share2 size={14} /> Status (tall)</button>
        <button className="db-btn sm ghost" disabled={!!busy} onClick={() => run('post', 'share')}><Share2 size={14} /> Post (square)</button>
        <button className="db-btn sm ghost" disabled={!!busy} onClick={() => run('status', 'download')}><Download size={14} /> Save image</button>
      </div>
      {busy && <small className="muted">Making your picture...</small>}
      {msg && <small className="muted">{msg}</small>}
      <small className="muted">The link goes in the caption, because links on a status picture cannot be tapped.</small>
    </div>
  )
}