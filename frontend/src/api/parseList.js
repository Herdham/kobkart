const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
const DATE_A = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\b`, 'i') // 5 October
const DATE_B = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i') // October 5

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function toDate(day, mon) {
  const m = MONTHS.indexOf(mon.slice(0, 3).toLowerCase())
  const now = new Date()
  let best = null
  for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(y, m, day)
    if (!best || Math.abs(d - now) < Math.abs(best - now)) best = d
  }
  return best
}

// Reads the kind of list organizers post in WhatsApp:
//   "🆑1.ALM ✅✅✅"   (collected, number, name, one tick per round paid)
export function parseList(text) {
  const warnings = []
  const headers = []
  const rows = []

  for (const raw of String(text).split(/\r?\n/)) {
    let s = raw.replace(/[\uFE0F\u200E\u200F]/g, '').replace(/\s+/g, ' ').trim()
    if (!s) continue
    const ticks = (s.match(/[✅✔☑]/g) || []).length
    const crosses = (s.match(/[❌✖✗]/g) || []).length
    let collected = /\u{1F191}/u.test(s)
    s = s.replace(/\u{1F191}/gu, ' ').replace(/[✅✔☑❌✖✗]/g, ' ').replace(/\s+/g, ' ').trim()
    const cl = s.match(/^CL(?=[\s\d.\-:)])\s*/i)
    if (cl) {
      collected = true
      s = s.slice(cl[0].length).trim()
    }

    const isMember = ticks + crosses > 0 || collected || /^\d{1,3}\s*[.)]\s*\S/.test(s)
    if (!isMember) {
      headers.push(s)
      continue
    }

    let pos = null
    const pm = s.match(/^(\d{1,3})\s*[.)\-:]?\s*/)
    if (pm && pm[0].length) {
      pos = Number(pm[1])
      s = s.slice(pm[0].length)
    }
    let date = null
    let m = s.match(DATE_A)
    if (m) {
      date = toDate(Number(m[1]), m[2])
      s = s.replace(m[0], ' ')
    } else {
      m = s.match(DATE_B)
      if (m) {
        date = toDate(Number(m[2]), m[1])
        s = s.replace(m[0], ' ')
      }
    }
    const notes = []
    s = s.replace(/\b\d+(?:\.\d+)?\s*k\b/gi, (t) => {
      notes.push(t.trim())
      return ' '
    })
    const name = s.replace(/[|•–—,:;]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.\-)]+|[\s.\-(]+$/g, '').trim()
    if (!name) {
      warnings.push(`Skipped a line with no name: "${raw.trim().slice(0, 40)}"`)
      continue
    }
    if (notes.length) warnings.push(`${name}: "${notes.join(' ')}" was ignored. If someone pays double, add them as two members.`)
    rows.push({ pos, name, paid: ticks, collected, date })
  }

  // keep the order of the list, unless every line has a unique number
  const nums = rows.map((r) => r.pos)
  const allNumbered = rows.length > 0 && nums.every((n) => n != null)
  if (allNumbered && new Set(nums).size === nums.length) rows.sort((a, b) => a.pos - b.pos)
  else if (allNumbered) warnings.push('Some numbers appear twice. Paste only the latest list.')
  if (allNumbered && rows.some((r, i) => r.pos !== i + 1)) warnings.push('The numbers do not run 1, 2, 3... Check that nobody is missing.')

  // title, amount and days from the first lines (for example "2k every 5days to park shoes")
  const joined = headers.join(' ')
  const title = headers.find((h) => /[A-Za-z]/.test(h) && !/\d{9,}/.test(h)) || ''
  let amount = ''
  const k = joined.match(/(\d+(?:\.\d+)?)\s*k\b/i)
  if (k) amount = String(Math.round(Number(k[1]) * 1000))
  else {
    const n = joined.match(/[₦N]\s?(\d[\d,]{2,})/)
    if (n) amount = n[1].replace(/,/g, '')
  }
  const d = joined.match(/every\s*(\d+)\s*-?\s*days?/i) || joined.match(/(\d+)\s*-?\s*days?/i)
  const days = d ? Number(d[1]) : 5

  // date of round 1: from a date in the list, else "the next unpaid round is due today"
  let start = null
  const idx = rows.findIndex((r) => r.date)
  if (idx >= 0) {
    const sd = new Date(rows[idx].date)
    sd.setDate(sd.getDate() - idx * days)
    start = iso(sd)
  } else {
    let k0 = rows.findIndex((r) => !r.collected)
    if (k0 < 0) k0 = rows.length
    const sd = new Date()
    sd.setDate(sd.getDate() - k0 * days)
    start = iso(sd)
  }

  return {
    header: { name: title.slice(0, 80), amount, days },
    members: rows.map((r) => ({ name: r.name, phone: '', paid: r.paid, collected: r.collected })),
    warnings,
    startDate: start,
  }
}