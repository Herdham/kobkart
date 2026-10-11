const BASES = { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', x_handle: 'https://x.com/' }

// Turns a handle or link into a safe https address.
export function socialUrl(kind, value) {
  const v = String(value || '').trim()
  if (/^https?:\/\//i.test(v)) return v
  if (kind === 'website') return `https://${v.replace(/^\/+/, '')}`
  return (BASES[kind] || 'https://') + v.replace(/^@/, '')
}