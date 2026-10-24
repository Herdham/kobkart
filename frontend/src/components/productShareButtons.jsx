import { useState } from 'react'
import { Check, Copy, Download, Share2 } from 'lucide-react'
import { productCaption, productCardBlob, productLink } from '../api/productCard'

export default function ProductShareButtons({ data }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState('')
  const caption = productCaption(data)

  const copy = async (k, t) => {
    try {
      await navigator.clipboard.writeText(t)
      setCopied(k)
      setTimeout(() => setCopied(''), 1600)
    } catch {
      /* ignore */
    }
  }

  async function make(format, mode) {
    setBusy(format + mode)
    setMsg('')
    try {
      const { blob, photoOk } = await productCardBlob(data, format)
      if (!photoOk) setMsg('The photo could not be added to the picture. Tell Adam, it is a small fix.')
      const file = new File([blob], `${data.product.name.slice(0, 30)}.png`, { type: 'image/png' })
      if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
        await copy('cap', caption)
        await navigator.share({ files: [file], text: caption })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = file.name
        a.click()
        await copy('cap', caption)
        setMsg((m) => m || 'Saved. The caption is copied: paste it with the picture.')
      }
    } catch {
      /* the person closed the share sheet */
    }
    setBusy('')
  }

  return (
    <div className="bk-ctl" style={{ maxWidth: 'none' }}>
      <b>Share this item</b>
      <small className="muted">
        Post it on your WhatsApp status. People who tap the link in your caption come straight to this item. The caption is copied for you.
      </small>
      <div className="bk-row">
        <button className="db-btn sm" disabled={!!busy} onClick={() => make('tall', 'share')}>
          <Share2 size={14} /> {busy === 'tallshare' ? 'Making...' : 'Status (tall)'}
        </button>
        <button className="db-btn sm ghost" disabled={!!busy} onClick={() => make('post', 'share')}>
          <Share2 size={14} /> {busy === 'postshare' ? 'Making...' : 'Post'}
        </button>
        <button className="db-btn sm ghost" disabled={!!busy} onClick={() => make('tall', 'save')}>
          <Download size={14} /> Save image
        </button>
        <button className="db-btn sm ghost" onClick={() => copy('cap', caption)}>
          {copied === 'cap' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy caption</>}
        </button>
        <button className="db-btn sm ghost" onClick={() => copy('link', productLink(data))}>
          {copied === 'link' ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
        </button>
      </div>
      {msg && <small className="muted">{msg}</small>}
    </div>
  )
}