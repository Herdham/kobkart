import { clearSession, getSession } from './auth'

export const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const toKobo = (naira) => Math.round(Number(naira) * 100)

// One function for every logged-in call to the backend.
export async function api(path, { method = 'GET', body } = {}) {
  const token = getSession()?.token
  let res
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Cannot reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) {
    clearSession()
    const e = new Error('Please log in again')
    e.status = 401
    throw e
  }
  if (!res.ok) {
    const e = new Error(data.error || 'Something went wrong')
    e.status = res.status
    throw e
  }
  return data
}

// Shrinks a photo in the browser so it is small enough to save.
export function compressImage(file, max = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}