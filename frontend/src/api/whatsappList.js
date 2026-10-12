import { naira } from './seller'

const short = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

// Group rotation: the same kind of list organizers post in WhatsApp today.
export function groupList(data, link) {
  const { channel: ch, members, rounds } = data
  const running = ch.status !== 'open'
  const lines = members.map((m) => {
    const r = rounds.find((x) => x.round_no === m.position)
    const parts = [`${m.position}.`]
    if (r?.collected) parts.push('CL')
    parts.push(m.name)
    if (r) parts.push(short(r.due_date))
    if (running) parts.push(m.late || m.defaulted ? '❌' : '✅')
    return parts.join(' ')
  })
  return [
    `*${ch.name}*`,
    `${naira(ch.contribution_amount)} every ${ch.frequency_days} days${running ? ` • pot ${naira(ch.pot)}` : ''}`,
    '',
    ...lines,
    '',
    running ? '✅ paid up   ❌ behind   CL collected' : 'Order of collection',
    link ? `Pay or check on Kobkart: ${link}` : '',
  ].join('\n').trim()
}

// Save & Collect: one line per customer with what they have paid so far.
export function packageList(ch, plans, link) {
  const lines = plans.map((p, i) => {
    const done = p.status === 'completed' || p.status === 'delivered'
    const mark = done ? '✅ fully paid' : p.late ? '❌ behind' : '✅'
    return `${i + 1}. ${p.customer_name} - ${p.product_name} - ${naira(p.amount_paid)}/${naira(p.locked_price)} ${mark}`
  })
  return [
    `*${ch.name}*`,
    `${naira(ch.contribution_amount)} every ${ch.frequency_days} days`,
    '',
    ...lines,
    '',
    '✅ on track   ❌ behind',
    link ? `Pay or check on Kobkart: ${link}` : '',
  ].join('\n').trim()
}