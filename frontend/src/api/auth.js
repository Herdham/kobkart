const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'
export const IS_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
export const DEMO_CODE = '123456'

const SESSION_KEY = 'kobkart_session'
const PENDING_KEY = 'kobkart_pending' // mock mode only
const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms))

async function post(path, body) {
  let res
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Cannot reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong')
    err.code = data.code // e.g. 'email_not_verified'
    err.email = data.email
    throw err
  }
  return data
}

/* ---------- session ---------- */
export function saveSession(session, remember = true) {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  ;(remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session))
}

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

/* ---------- auth ---------- */
export async function login({ identifier, password, remember }) {
  if (IS_MOCK) {
    await wait()
    if (password.length < 8) throw new Error('Incorrect email/phone or password')
    const session = {
      token: 'mock-token',
      user: {
        full_name: 'Demo User',
        email: identifier.includes('@') ? identifier : 'demo@kobkart.com',
        role: 'customer',
      },
    }
    saveSession(session, remember)
    return session
  }
  const session = await post('/auth/login', { identifier, password })
  saveSession(session, remember)
  return session
}

export async function register({ full_name, email, phone, password, role, business_name, referral_code }) {
  if (IS_MOCK) {
    await wait()
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ token: 'mock-token', user: { full_name, email, phone, role, business_name } })
    )
    return { email }
  }
  return post('/auth/register', { full_name, email, phone, password, role, business_name, referral_code })
}

export async function sendCode({ email, purpose }) {
  if (IS_MOCK) return wait(600)
  return post('/auth/send-code', { email, purpose })
}

export async function verifyCode({ email, code, purpose }) {
  if (IS_MOCK) {
    await wait(600)
    if (code !== DEMO_CODE) throw new Error('That code is not correct. Please try again.')
    if (purpose === 'verify') {
      const pending = sessionStorage.getItem(PENDING_KEY)
      if (pending) {
        saveSession(JSON.parse(pending), true)
        sessionStorage.removeItem(PENDING_KEY)
      }
    }
    return
  }
  const data = await post('/auth/verify-code', { email, code, purpose })
  // After email verification the backend logs the user in
  if (purpose === 'verify' && data.token) saveSession({ token: data.token, user: data.user }, true)
}

export async function resetPassword({ email, code, password }) {
  if (IS_MOCK) return wait(700)
  return post('/auth/reset-password', { email, code, password })
}