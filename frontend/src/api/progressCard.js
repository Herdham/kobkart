const fit = (g, text, max) => {
  let t = text || ''
  while (t.length > 1 && g.measureText(t).width > max) t = t.slice(0, -1)
  return t === text ? t : t.trimEnd() + '…'
}

export async function progressBlob(st, link) {
  const W = 1080
  const rowH = 62
  const n = st.members.length
  const H = 400 + n * rowH + 130
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#6b0f1a'
  g.fillRect(0, 0, W, 330)

  g.fillStyle = '#ffffff'
  g.font = '700 54px sans-serif'
  g.fillText(fit(g, st.name, W - 100), 50, 100)
  g.font = '400 32px sans-serif'
  g.fillText(`${(st.contribution / 100).toLocaleString()} naira every ${st.frequency_days} days  •  Pot ${(st.pot / 100).toLocaleString()} naira`, 50, 160)
  g.font = '600 36px sans-serif'
  const round = st.current_round ? `Round ${st.current_round} of ${st.members_count}` : 'All rounds collected'
  g.fillText(round + (st.next_collector ? `  •  Next: ${st.next_collector}` : ''), 50, 225)
  g.font = '400 30px sans-serif'
  g.fillText(`${st.up_to_date} of ${st.members_count} are up to date` + (st.next_date ? `  •  Due ${st.next_date}` : ''), 50, 280)

  st.members.forEach((m, i) => {
    const y = 360 + i * rowH
    if (i % 2 === 0) {
      g.fillStyle = '#fbf5f5'
      g.fillRect(0, y, W, rowH)
    }
    g.fillStyle = m.paid >= st.members_count || !m.behind ? '#1f9d55' : '#c0392b'
    g.beginPath()
    g.arc(60, y + rowH / 2, 12, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#3a2a2e'
    g.font = '400 30px sans-serif'
    g.fillText(`${m.position}`, 92, y + 41)
    g.font = '500 32px sans-serif'
    g.fillText(fit(g, m.name || '', 600), 150, y + 41)
    g.font = '600 32px sans-serif'
    g.textAlign = 'right'
    g.fillText(`${m.paid}/${st.members_count}`, W - 50, y + 41)
    g.textAlign = 'left'
  })

  const fy = 400 + n * rowH
  g.fillStyle = '#6b0f1a'
  g.fillRect(0, fy, W, 130)
  g.fillStyle = '#ffffff'
  g.font = '600 30px sans-serif'
  g.fillText('Check your status or say you have paid:', 50, fy + 52)
  g.font = '400 28px sans-serif'
  g.fillText(`${link}   •   Powered by Kobkart`, 50, fy + 95)

  return await new Promise((res) => c.toBlob(res, 'image/png'))
}