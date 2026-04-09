import { createError, deleteCookie, getCookie, getQuery, getRequestURL, sendRedirect } from 'h3'
import { createSession, findOrCreateOAuthUser } from '../../../utils/auth-db'

const GOOGLE_STATE_COOKIE = 'oauth-google-state'
const GOOGLE_REDIRECT_COOKIE = 'oauth-google-redirect'

type TokenResponse = {
  access_token?: string
  token_type?: string
}

type GoogleUserInfo = {
  email?: string
  email_verified?: boolean
  name?: string
}

function normalizeRedirect(value: string | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/profile-settings'
  }

  return value
}

export default defineEventHandler(async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google OAuth env vars are missing.' })
  }

  const query = getQuery(event)
  const stateFromQuery = typeof query.state === 'string' ? query.state : ''
  const code = typeof query.code === 'string' ? query.code : ''
  const oauthError = typeof query.error === 'string' ? query.error : ''

  const expectedState = getCookie(event, GOOGLE_STATE_COOKIE)
  const savedRedirect = normalizeRedirect(getCookie(event, GOOGLE_REDIRECT_COOKIE))

  deleteCookie(event, GOOGLE_STATE_COOKIE, { path: '/' })
  deleteCookie(event, GOOGLE_REDIRECT_COOKIE, { path: '/' })

  if (oauthError) {
    throw createError({ statusCode: 400, statusMessage: `Google OAuth failed: ${oauthError}` })
  }

  if (!expectedState || !stateFromQuery || expectedState !== stateFromQuery) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Google OAuth state.' })
  }

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Missing Google OAuth code.' })
  }

  const requestUrl = getRequestURL(event)
  const redirectUri = `${requestUrl.origin}/api/auth/google/callback`
  const tokenParams = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  })

  const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as TokenResponse
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw createError({ statusCode: 502, statusMessage: 'Could not get Google access token.' })
  }

  const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`
    }
  })

  const userInfo = (await userInfoResponse.json().catch(() => ({}))) as GoogleUserInfo
  if (!userInfoResponse.ok || !userInfo.email || userInfo.email_verified !== true) {
    throw createError({ statusCode: 401, statusMessage: 'Google account email is not verified.' })
  }

  const user = await findOrCreateOAuthUser({
    email: userInfo.email,
    name: userInfo.name || userInfo.email.split('@')[0] || 'Google User'
  })

  await createSession(event, user.id)
  return sendRedirect(event, savedRedirect)
})
