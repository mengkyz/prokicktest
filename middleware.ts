import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'prokick_session'

// Edge runtime: no Buffer — use Web Crypto API only
function bytesToBase64url(bytes: ArrayBuffer): string {
  const uint8 = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function verifySession(cookieValue: string): Promise<string | null> {
  const lastDot = cookieValue.lastIndexOf('.')
  if (lastDot === -1) return null

  const userId = cookieValue.slice(0, lastDot)
  const sig = cookieValue.slice(lastDot + 1)
  if (!userId || !sig) return null

  const secret = process.env.SESSION_SECRET
  if (!secret) return null

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(userId))
  const expected = bytesToBase64url(sigBuffer)

  // Constant-time comparison
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  }
  return diff === 0 ? userId : null
}

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)

  if (!cookie?.value) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const userId = await verifySession(cookie.value)
  if (!userId) {
    const response = NextResponse.redirect(new URL('/', request.url))
    response.cookies.delete(SESSION_COOKIE)
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/packages/:path*',
    '/book/:path*',
    '/profile/:path*',
    '/payment/:path*',
  ],
}
