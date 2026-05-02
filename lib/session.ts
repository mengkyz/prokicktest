import { cookies } from 'next/headers'

const SESSION_COOKIE = 'prokick_session'

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET environment variable is not set')
  return secret
}

async function sign(value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Buffer.from(sig).toString('base64url')
}

async function verifySignature(value: string, sig: string): Promise<boolean> {
  const expected = await sign(value)
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  }
  return diff === 0
}

export async function setSession(userId: string): Promise<void> {
  const sig = await sign(userId)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, `${userId}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE)
  if (!cookie?.value) return null

  const lastDot = cookie.value.lastIndexOf('.')
  if (lastDot === -1) return null

  const userId = cookie.value.slice(0, lastDot)
  const sig = cookie.value.slice(lastDot + 1)
  if (!userId || !sig) return null

  const valid = await verifySignature(userId, sig)
  if (!valid) return null

  return { userId }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
