import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, setCookie } from 'h3'
import Database from 'better-sqlite3'

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

type Db = Database.Database

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  password_hash: string
  password_salt: string
  profile_json: string
}

declare global {
  // eslint-disable-next-line no-var
  var __authDb: Db | undefined
}

const AUTH_COOKIE = 'webtools-auth-session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const ROLE_VALUES: UserRole[] = ['admin', 'editor', 'viewer']

function ensureDbFilePath() {
  const filePath = join(process.cwd(), '.data', 'auth.sqlite')
  mkdirSync(dirname(filePath), { recursive: true })
  return filePath
}

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
  let profile: ProfileSettings
  try {
    profile = sanitizeProfile(JSON.parse(row.profile_json))
  } catch {
    profile = emptyProfile()
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: normalizeRole(row.role),
    profile
  }
}

function ensureRoleColumn(db: Db) {
  const columns = db.prepare('PRAGMA table_info(auth_users)').all() as Array<{ name: string }>
  const hasRole = columns.some((column) => column.name === 'role')
  if (!hasRole) {
    db.exec("ALTER TABLE auth_users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'")
  }
}

export function getAuthDb() {
  if (globalThis.__authDb) {
    return globalThis.__authDb
  }

  const db = new Database(ensureDbFilePath())
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      profile_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
  `)

  ensureRoleColumn(db)

  globalThis.__authDb = db
  return db
}

export function registerUser(input: { name: string; email: string; password: string }) {
  const db = getAuthDb()
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  if (!name || !email || !input.password) {
    throw createError({ statusCode: 400, statusMessage: 'Name, email, and password are required.' })
  }

  if (input.password.length < 6) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 6 characters.' })
  }

  const existing = db.prepare('SELECT id FROM auth_users WHERE email = ? LIMIT 1').get(email) as { id: string } | undefined
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'An account with this email already exists.' })
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  const { hash, salt } = hashPassword(input.password)
  const profile = JSON.stringify(emptyProfile())
  const role: UserRole = 'viewer'

  db.prepare(
    `INSERT INTO auth_users (id, name, email, role, password_hash, password_salt, profile_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, role, hash, salt, profile, now, now)

  const row = db.prepare('SELECT * FROM auth_users WHERE id = ? LIMIT 1').get(id) as UserRow | undefined
  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create account.' })
  }

  return toPublicUser(row)
}

export function loginUser(input: { email: string; password: string }) {
  const db = getAuthDb()
  const email = input.email.trim().toLowerCase()

  const row = db.prepare('SELECT * FROM auth_users WHERE email = ? LIMIT 1').get(email) as UserRow | undefined
  if (!row) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  const isValid = verifyPassword(input.password, row.password_hash, row.password_salt)
  if (!isValid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  return toPublicUser(row)
}

export function createSession(event: H3Event, userId: string) {
  const db = getAuthDb()
  const token = randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, expiresAt.toISOString(), now.toISOString())

  setCookie(event, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt
  })
}

export function clearAuthSession(event: H3Event) {
  const db = getAuthDb()
  const token = getCookie(event, AUTH_COOKIE)
  if (token) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
  }

  deleteCookie(event, AUTH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  })
}

export function getSessionUser(event: H3Event): AuthPublicUser | null {
  const db = getAuthDb()
  const token = getCookie(event, AUTH_COOKIE)
  if (!token) {
    return null
  }

  const row = db.prepare(
    `SELECT u.*
     FROM auth_sessions s
     JOIN auth_users u ON u.id = s.user_id
     WHERE s.token = ? AND datetime(s.expires_at) > datetime(?)
     LIMIT 1`
  ).get(token, new Date().toISOString()) as UserRow | undefined

  if (!row) {
    db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
    return null
  }

  return toPublicUser(row)
}

export function requireSessionUser(event: H3Event): AuthPublicUser {
  const user = getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required.' })
  }

  return user
}

export function requireRole(event: H3Event, allowed: UserRole[]) {
  const user = requireSessionUser(event)
  if (!allowed.includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission for this action.' })
  }

  return user
}

export function listUsers(requestedByUserId: string) {
  const db = getAuthDb()
  const requester = db.prepare('SELECT role FROM auth_users WHERE id = ? LIMIT 1').get(requestedByUserId) as { role: string } | undefined
  if (!requester || normalizeRole(requester.role) !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required.' })
  }

  const rows = db
    .prepare('SELECT * FROM auth_users ORDER BY datetime(created_at) ASC')
    .all() as UserRow[]

  return rows.map(toPublicUser)
}

export function updateUserRole(requestedByUserId: string, targetUserId: string, nextRole: UserRole) {
  const db = getAuthDb()
  const requester = db.prepare('SELECT role FROM auth_users WHERE id = ? LIMIT 1').get(requestedByUserId) as { role: string } | undefined
  if (!requester || normalizeRole(requester.role) !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required.' })
  }

  const target = db.prepare('SELECT id, role FROM auth_users WHERE id = ? LIMIT 1').get(targetUserId) as { id: string; role: string } | undefined
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  if (!ROLE_VALUES.includes(nextRole)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role.' })
  }

  if (target.id === requestedByUserId && nextRole !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) as total FROM auth_users WHERE role = 'admin'").get() as { total: number }
    if (admins.total <= 1) {
      throw createError({ statusCode: 400, statusMessage: 'At least one admin is required.' })
    }
  }

  if (normalizeRole(target.role) === 'admin' && nextRole !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) as total FROM auth_users WHERE role = 'admin'").get() as { total: number }
    if (admins.total <= 1) {
      throw createError({ statusCode: 400, statusMessage: 'At least one admin is required.' })
    }
  }

  const now = new Date().toISOString()
  db.prepare('UPDATE auth_users SET role = ?, updated_at = ? WHERE id = ?').run(nextRole, now, targetUserId)

  const row = db.prepare('SELECT * FROM auth_users WHERE id = ? LIMIT 1').get(targetUserId) as UserRow | undefined
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  return toPublicUser(row)
}

export function updateUserProfile(userId: string, profile: ProfileSettings) {
  const db = getAuthDb()
  const now = new Date().toISOString()
  db.prepare('UPDATE auth_users SET profile_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(sanitizeProfile(profile)), now, userId)

  const row = db.prepare('SELECT * FROM auth_users WHERE id = ? LIMIT 1').get(userId) as UserRow | undefined
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  return toPublicUser(row)
}
