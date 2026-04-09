import { randomBytes } from 'node:crypto'
import { createError, getQuery, getRequestURL, sendRedirect, setCookie } from 'h3'

const GOOGLE_STATE_COOKIE = 'oauth-google-state'
const GOOGLE_REDIRECT_COOKIE = 'oauth-google-redirect'

function normalizeRedirect(value: unknown) {
  if (typeof value !== 'string') {
    return '/profile-settings'
  }

  if (!value.startsWith('/')) {
    return '/profile-settings'
  }

  if (value.startsWith('//')) {
    return '/profile-settings'
  }

  return value
}

export default defineEventHandler((event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    throw createError({ statusCode: 500, statusMessage: 'GOOGLE_CLIENT_ID is not configured.' })
  }

  const query = getQuery(event)
  const redirectPath = normalizeRedirect(query.redirect)
  const state = randomBytes(24).toString('hex')
  const requestUrl = getRequestURL(event)
  const redirectUri = `${requestUrl.origin}/api/auth/google/callback`

  setCookie(event, GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  setCookie(event, GOOGLE_REDIRECT_COOKIE, redirectPath, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  })

  return sendRedirect(event, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})
