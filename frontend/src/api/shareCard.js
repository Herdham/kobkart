import logo from '../assets/kobkart-logo.png'

const MAROON = '#6b0f1e'

function loadImage(src, cors = false) {
  return new Promise((resolve) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Breaks text into lines that fit, with "…" if it is too long.
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
      if (lines.length === maxLines) break
    } else {
      line = test
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  const used = lines.join(' ').split(/\s+/).filter(Boolean).length
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1]
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last}…`
  }
  return lines
}

const LAYOUT = {
  status: { H: 1920, imgH: 800, bottom: 150, bar: 190, title: [66, 80], head: [54, 70], detail: [38, 52], desc: [34, 48, 3], gap: 56 },
  post: { H: 1350, imgH: 440, bottom: 60, bar: 150, title: [58, 68], head: [48, 62], detail: [32, 44], desc: [30, 42, 2], gap: 40 },
}

export async function makeShareCard({ format = 'status', seller, title, headline, detail, description, imageUrl, link }) {
  const L = LAYOUT[format] || LAYOUT.status
  const W = 1080
  const H = L.H
  const pad = 70
  const innerW = W - pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  try {
    await Promise.all([document.fonts.load('700 40px Poppins'), document.fonts.load('600 30px Poppins'), document.fonts.load('400 30px Poppins')])
  } catch {
    /* the fallback font is fine */
  }
  const font = (w, px) => `${w} ${px}px Poppins, Arial, sans-serif`
  ctx.textBaseline = 'top'

  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fdf4f3')
  bg.addColorStop(1, '#f3dcdc')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // header
  const lg = await loadImage(logo)
  if (lg) {
    const h = 84
    const w = (lg.width / lg.height) * h
    ctx.drawImage(lg, pad, 60, w, h)
    ctx.fillStyle = MAROON
    ctx.font = font(700, 56)
    ctx.fillText('Kobkart', pad + w + 22, 60 + 12)
  }

  // photo
  let y = 170
  roundRect(ctx, pad, y, innerW, L.imgH, 36)
  ctx.save()
  ctx.clip()
  const photo = imageUrl ? await loadImage(imageUrl, true) : null
  if (photo) {
    const s = Math.max(innerW / photo.width, L.imgH / photo.height)
    const dw = photo.width * s
    const dh = photo.height * s
    ctx.drawImage(photo, pad + (innerW - dw) / 2, y + (L.imgH - dh) / 2, dw, dh)
  } else {
    ctx.fillStyle = '#f1d9d9'
    ctx.fillRect(pad, y, innerW, L.imgH)
    if (lg) {
      const h = L.imgH * 0.38
      const w = (lg.width / lg.height) * h
      ctx.drawImage(lg, (W - w) / 2, y + (L.imgH - h) / 2, w, h)
    }
  }
  ctx.restore()

  // text
  y += L.imgH + L.gap
  ctx.fillStyle = '#7a6a6e'
  ctx.font = font(600, 32)
  ctx.fillText(wrap(ctx, String(seller || '').toUpperCase(), innerW, 1)[0] || '', pad, y)
  y += 46 + 8

  ctx.fillStyle = '#2a1a1d'
  ctx.font = font(700, L.title[0])
  for (const ln of wrap(ctx, title, innerW, 2)) {
    ctx.fillText(ln, pad, y)
    y += L.title[1]
  }
  y += 6

  ctx.fillStyle = MAROON
  ctx.font = font(700, L.head[0])
  for (const ln of wrap(ctx, headline, innerW, 2)) {
    ctx.fillText(ln, pad, y)
    y += L.head[1]
  }

  if (detail) {
    ctx.fillStyle = '#4a3d40'
    ctx.font = font(600, L.detail[0])
    for (const ln of wrap(ctx, detail, innerW, 2)) {
      ctx.fillText(ln, pad, y)
      y += L.detail[1]
    }
  }
  if (description) {
    y += 10
    ctx.fillStyle = '#4a3d40'
    ctx.font = font(400, L.desc[0])
    for (const ln of wrap(ctx, description, innerW, L.desc[2])) {
      ctx.fillText(ln, pad, y)
      y += L.desc[1]
    }
  }

  // footer bar
  const barY = H - L.bottom - L.bar
  ctx.fillStyle = MAROON
  roundRect(ctx, pad, barY, innerW, L.bar, 36)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = font(700, 44)
  ctx.fillText('Join on Kobkart', pad + 44, barY + 34)
  ctx.fillStyle = '#f3d6d6'
  ctx.font = font(500, 32)
  const shown = String(link || '').replace(/^https?:\/\//, '')
  ctx.fillText(wrap(ctx, shown, innerW - 88, 1)[0] || '', pad + 44, barY + 34 + 62)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image'))), 'image/png')
  )
}

export function downloadImage(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

// Opens the phone's share sheet with the picture. Falls back to saving it.
export async function shareImage(blob, name, text) {
  const file = new File([blob], `${name}.png`, { type: 'image/png' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled'
    }
  }
  downloadImage(blob, name)
  return 'downloaded'
}