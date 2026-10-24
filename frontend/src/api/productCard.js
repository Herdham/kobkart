import { API } from './http'
import { naira } from './seller'

const MAROON = '#6b0f1a'

function loadImg(src) {
  return new Promise((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = src
  })
}

function rr(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function cover(g, im, x, y, w, h, r) {
  g.save()
  rr(g, x, y, w, h, r)
  g.clip()
  if (im) {
    const s = Math.max(w / im.width, h / im.height)
    const dw = im.width * s
    const dh = im.height * s
    g.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  } else {
    g.fillStyle = '#f3e6e6'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#b9a3a6'
    g.font = '500 36px sans-serif'
    g.textAlign = 'center'
    g.fillText('No photo', x + w / 2, y + h / 2)
    g.textAlign = 'left'
  }
  g.restore()
}

function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = (text || '').split(/\s+/).filter(Boolean)
  let line = ''
  let lines = []
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (g.measureText(t).width > maxW && line) {
      lines.push(line)
      line = w
    } else line = t
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    let last = lines[maxLines - 1]
    while (last.length > 1 && g.measureText(`${last}…`).width > maxW) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last.trimEnd()}…`
  }
  lines.forEach((l, i) => g.fillText(l, x, y + i * lh))
  return y + lines.length * lh
}

function paymentLine(d) {
  const { product: p, package: ch } = d
  if (ch.kind === 'rotation') return 'Join the group, then add this to your basket'
  if (ch.budget) return `Budget basket: pick items up to ${naira(ch.budget)}`
  const each = Math.min(ch.contribution_amount, p.price)
  const count = Math.ceil(p.price / Math.max(ch.contribution_amount, 1))
  return `Pay ${naira(each)} every ${ch.frequency_days} day${ch.frequency_days > 1 ? 's' : ''} • ${count} payment${count === 1 ? '' : 's'}`
}

const labels = (list) => (list || []).filter((x) => !x.sold_out).map((x) => x.label)

export function productLink(d) {
  return `${window.location.origin}/product/${d.product.id}`
}

export function productCaption(d) {
  const { product: p, package: ch } = d
  const colors = labels(d.colors)
  const sizes = labels(d.sizes)
  return [
    `🛍️ *${p.name}* - ${naira(p.price)}`,
    paymentLine(d),
    colors.length ? `Colours: ${colors.join(', ')}` : '',
    sizes.length ? `Sizes: ${sizes.join(', ')}` : '',
    `Sold by ${ch.seller}`,
    '',
    'Tap to see it and join:',
    productLink(d),
  ]
    .filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i < a.length - 1))
    .join('\n')
}

/** Draws the picture. Returns { blob, photoOk }. */
export async function productCardBlob(d, format) {
  const { product: p, package: ch } = d
  const tall = format === 'tall'
  const W = 1080
  const H = tall ? 1920 : 1350
  const imgs = d.images || []
  const photos = await Promise.all(imgs.slice(0, 5).map((im) => loadImg(`${API}/product-images/${im.id}?c=1`)))
  const main = photos[0] || null
  const photoOk = imgs.length === 0 || !!main
  const thumbs = tall ? photos.slice(1, 5).filter(Boolean) : []

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)

  // header
  const hh = tall ? 150 : 130
  g.fillStyle = MAROON
  g.fillRect(0, 0, W, hh)
  g.fillStyle = '#ffffff'
  g.font = '800 56px sans-serif'
  g.fillText('Kobkart', 60, hh / 2 + 20)
  g.font = '500 30px sans-serif'
  g.textAlign = 'right'
  let who = ch.seller || ''
  while (who.length > 1 && g.measureText(who).width > 520) who = who.slice(0, -1)
  g.fillText(ch.seller_official ? `★ ${who}` : who, W - 60, hh / 2 + 10)
  g.textAlign = 'left'

  // photo
  const photoY = hh + 30
  const photoH = tall ? 860 : 520
  cover(g, main, 60, photoY, 960, photoH, 28)
  let y = photoY + photoH

  if (thumbs.length) {
    const size = 225
    const gap = 20
    thumbs.forEach((im, i) => cover(g, im, 60 + i * (size + gap), y + 20, size, 170, 18))
    y += 190
  }

  y += 70
  g.fillStyle = '#2b1d20'
  g.font = '700 60px sans-serif'
  y = wrap(g, p.name, 60, y, 960, 72, 2)

  y += 18
  g.fillStyle = MAROON
  g.font = '800 72px sans-serif'
  g.fillText(naira(p.price), 60, y + 52)
  y += 96

  g.fillStyle = '#4a3a3e'
  g.font = '500 34px sans-serif'
  y = wrap(g, paymentLine(d), 60, y + 10, 960, 46, 2)

  const colors = labels(d.colors)
  const sizes = labels(d.sizes)
  g.font = '400 32px sans-serif'
  g.fillStyle = '#6b5a5e'
  if (colors.length) y = wrap(g, `Colours: ${colors.join(', ')}`, 60, y + 14, 960, 42, 1)
  if (sizes.length) y = wrap(g, `Sizes: ${sizes.join(', ')}`, 60, y + 14, 960, 42, 1)
  g.fillText(`Sold by ${ch.seller}${ch.seller_verified ? '  ✓ Verified' : ''}`, 60, y + 56)

  // footer
  const fh = tall ? 160 : 140
  g.fillStyle = MAROON
  g.fillRect(0, H - fh, W, fh)
  g.fillStyle = '#ffffff'
  g.font = '700 36px sans-serif'
  g.fillText('Tap the link in my caption to join', 60, H - fh + 60)
  g.font = '400 28px sans-serif'
  g.fillText('Powered by Kobkart  •  Run a group? Start free', 60, H - fh + 106)

  const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
  return { blob, photoOk }
}