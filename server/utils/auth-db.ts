import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, setCookie } from 'h3'
import { getSupabaseAdminClient } from './supabase-admin'

export type ProfileSettings = {
  establishmentName: string
  officeAddress: string
  officePhone: string
  officeEmail: string
  orn: string
  dedLicense: string
  poBox: string
  logoDataUrl: string | null
  stampDataUrl: string | null
}

export type UserRole = 'admin' | 'editor' | 'viewer'

export type AuthPublicUser = {
  id: string
  name: string
  email: string
  role: UserRole
  profile: ProfileSettings
}

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  password_hash: string
  password_salt: string
  profile_json: unknown
  created_at?: string
  updated_at?: string
}

type SessionRow = {
  token: string
  user_id: string
  expires_at: string
}

const AUTH_COOKIE = 'webtools-auth-session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const ROLE_VALUES: UserRole[] = ['admin', 'editor', 'viewer']

export function emptyProfile(): ProfileSettings {
  return {
    establishmentName: '',
    officeAddress: '',
    officePhone: '',
    officeEmail: '',
    orn: '',
    dedLicense: '',
    poBox: '',
    logoDataUrl: null,
    stampDataUrl: null
  }
}

export function sanitizeProfile(value: unknown): ProfileSettings {
  if (!value || typeof value !== 'object') {
    return emptyProfile()
  }

  const source = value as Partial<ProfileSettings>
  return {
    establishmentName: typeof source.establishmentName === 'string' ? source.establishmentName : '',
    officeAddress: typeof source.officeAddress === 'string' ? source.officeAddress : '',
    officePhone: typeof source.officePhone === 'string' ? source.officePhone : '',
    officeEmail: typeof source.officeEmail === 'string' ? source.officeEmail : '',
    orn: typeof source.orn === 'string' ? source.orn : '',
    dedLicense: typeof source.dedLicense === 'string' ? source.dedLicense : '',
    poBox: typeof source.poBox === 'string' ? source.poBox : '',
    logoDataUrl: typeof source.logoDataUrl === 'string' ? source.logoDataUrl : null,
    stampDataUrl: typeof source.stampDataUrl === 'string' ? source.stampDataUrl : null
  }
}

function hashPassword(password: string, salt?: string) {
  const activeSalt = salt || randomBytes(16).toString('hex')
  const hash = scryptSync(password, activeSalt, 64).toString('hex')
  return {
    hash,
    salt: activeSalt
  }
}

function verifyPassword(password: string, hash: string, salt: string) {
  const candidate = scryptSync(password, salt, 64)
  const actual = Buffer.from(hash, 'hex')
  if (candidate.length !== actual.length) {
    return false
  }
  return timingSafeEqual(candidate, actual)
}

function normalizeRole(value: unknown): UserRole {
  if (value === 'admin' || value === 'editor' || value === 'viewer') {
    return value
  }
  return 'viewer'
}

function toPublicUser(row: UserRow): AuthPublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: normalizeRole(row.role),
    profile: sanitizeProfile(row.profile_json)
  }
}

function throwSupabaseError(error: { message: string } | null, fallbackMessage: string): never {
  throw createError({
    statusCode: 500,
    statusMessage: error?.message || fallbackMessage
  })
}

async function getUserById(id: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('auth_users')
    .select('*')
    .eq('id', id)
    .maybeSingle<UserRow>()

  if (error) {
    throwSupabaseError(error, 'Could not load user.')
  }

  return data
}

async function getUserByEmail(email: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('auth_users')
    .select('*')
    .eq('email', email)
    .maybeSingle<UserRow>()

  if (error) {
    throwSupabaseError(error, 'Could not load user by email.')
  }

  return data
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const supabase = getSupabaseAdminClient()
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  if (!name || !email || !input.password) {
    throw createError({ statusCode: 400, statusMessage: 'Name, email, and password are required.' })
  }

  if (input.password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 6 characters.' })
  }

  const existing = await getUserByEmail(email)
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists.' })
  }

  const { hash, salt } = hashPassword(input.password)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('auth_users')
    .insert({
      id: randomUUID(),
      name,
      email,
      role: 'viewer',
      password_hash: hash,
      password_salt: salt,
      profile_json: emptyProfile(),
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single<UserRow>()

  if (error || !data) {
    throwSupabaseError(error, 'Could not create account.')
  }

  return toPublicUser(data)
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase()
  const row = await getUserByEmail(email)

  if (!row) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  const isValid = verifyPassword(input.password, row.password_hash, row.password_salt)
  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  return toPublicUser(row)
}

export async function createSession(event: H3Event, userId: string) {
  const supabase = getSupabaseAdminClient()
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  const { error } = await supabase
    .from('auth_sessions')
    .insert({
      token,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
      created_at: now.toISOString()
    })

  if (error) {
    throwSupabaseError(error, 'Could not create session.')
  }

  setCookie(event, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt
  })
}

export async function clearAuthSession(event: H3Event) {
  const supabase = getSupabaseAdminClient()
  const token = getCookie(event, AUTH_COOKIE)

  if (token) {
    const { error } = await supabase.from('auth_sessions').delete().eq('token', token)
    if (error) {
      throwSupabaseError(error, 'Could not clear session.')
    }
  }

  deleteCookie(event, AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  })
}

export async function getSessionUser(event: H3Event): Promise<AuthPublicUser | null> {
  const supabase = getSupabaseAdminClient()
  const token = getCookie(event, AUTH_COOKIE)
  if (!token) {
    return null
  }

  const { data: session, error: sessionError } = await supabase
    .from('auth_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle<SessionRow>()

  if (sessionError) {
    throwSupabaseError(sessionError, 'Could not load session.')
  }

  if (!session) {
    return null
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await supabase.from('auth_sessions').delete().eq('token', token)
    return null
  }

  const userRow = await getUserById(session.user_id)
  if (!userRow) {
    await supabase.from('auth_sessions').delete().eq('token', token)
    return null
  }

  return toPublicUser(userRow)
}

export async function requireSessionUser(event: H3Event): Promise<AuthPublicUser> {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required.' })
  }

  return user
}

export async function requireRole(event: H3Event, allowed: UserRole[]) {
  const user = await requireSessionUser(event)
  if (!allowed.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission for this action.' })
  }

  return user
}

export async function listUsers(requestedByUserId: string) {
  const requester = await getUserById(requestedByUserId)
  if (!requester || normalizeRole(requester.role) !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required.' })
  }

  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('auth_users')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    throwSupabaseError(error, 'Could not list users.')
  }

  return (data || []).map((row) => toPublicUser(row as UserRow))
}

export async function updateUserRole(requestedByUserId: string, targetUserId: string, nextRole: UserRole) {
  if (!ROLE_VALUES.includes(nextRole)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role.' })
  }

  const requester = await getUserById(requestedByUserId)
  if (!requester || normalizeRole(requester.role) !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required.' })
  }

  const target = await getUserById(targetUserId)
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  const supabase = getSupabaseAdminClient()

  if (target.id === requestedByUserId && nextRole !== 'admin') {
    const { count, error } = await supabase
      .from('auth_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')

    if (error) {
      throwSupabaseError(error, 'Could not verify admin count.')
    }

    if ((count || 0) <= 1) {
      throw createError({ statusCode: 400, statusMessage: 'At least one admin is required.' })
    }
  }

  if (normalizeRole(target.role) === 'admin' && nextRole !== 'admin') {
    const { count, error } = await supabase
      .from('auth_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')

    if (error) {
      throwSupabaseError(error, 'Could not verify admin count.')
    }

    if ((count || 0) <= 1) {
      throw createError({ statusCode: 400, statusMessage: 'At least one admin is required.' })
    }
  }

  const { data, error } = await supabase
    .from('auth_users')
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq('id', targetUserId)
    .select('*')
    .single<UserRow>()

  if (error || !data) {
    throwSupabaseError(error, 'Could not update user role.')
  }

  return toPublicUser(data)
}

export async function updateUserProfile(userId: string, profile: ProfileSettings) {
  const supabase = getSupabaseAdminClient()
  const sanitized = sanitizeProfile(profile)

  const { data, error } = await supabase
    .from('auth_users')
    .update({ profile_json: sanitized, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single<UserRow>()

  if (error || !data) {
    throwSupabaseError(error, 'Could not update profile.')
  }

  return toPublicUser(data)
}
