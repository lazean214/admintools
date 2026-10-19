import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { H3Event } from 'h3'
import { createError, getRequestHeader, getRequestIP, setHeader } from 'h3'

type Bucket = { count: number; expiresAt: number }
type Decision = { allowed: boolean; retryAfter: number }

// Per-process admission control. Do not evict live entries when full: eviction
// would let clients reset budgets by supplying enough different addresses.
export class AuthRateLimiter {
  private buckets = new Map<string,Bucket>()
  private nextSweep = 0
  private now: () => number
  private maxEntries: number
  constructor(now: () => number = Date.now, maxEntries = 10_000) { this.now=now; this.maxEntries=maxEntries }

  consume(key: string, limit: number, windowMs: number): Decision {
    const now = this.now()
    if (now >= this.nextSweep) {
      for (const [key,bucket] of this.buckets) if (bucket.expiresAt <= now) this.buckets.delete(key)
      this.nextSweep = now + 60_000
    }
    let bucket = this.buckets.get(key)
    if (bucket && bucket.expiresAt <= now) { this.buckets.delete(key); bucket = undefined }
    if (!bucket) {
      if (this.buckets.size >= this.maxEntries) return {allowed:false,retryAfter:Math.max(1,Math.ceil((this.nextSweep-now)/1000))}
      bucket = {count:0,expiresAt:now+windowMs}
      this.buckets.set(key,bucket)
    }
    if (bucket.count >= limit) return {allowed:false,retryAfter:Math.max(1,Math.ceil((bucket.expiresAt-now)/1000))}
    bucket.count++
    return {allowed:true,retryAfter:0}
  }
}

function normalizeIp(value: string) {
  const address = value.trim().toLowerCase()
  if (!isIP(address)) return null
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address
}

// Walk from the nearest proxy toward the client, stopping at the first
// untrusted hop. Never trust a forwarded header from a direct client.
export function resolveAuthClientIp(peer: string | undefined, forwarded: string | undefined, trusted: string[]) {
  let current = peer ? normalizeIp(peer) : null
  if (!current) return 'unknown'
  const proxies = new Set(trusted.map(normalizeIp).filter((ip): ip is string => !!ip))
  if (!proxies.has(current) || !forwarded || forwarded.length > 2048) return current
  const chain = forwarded.split(',')
  if (chain.length > 20) return current
  for (let index=chain.length-1;index>=0;index--) {
    if (!proxies.has(current)) break
    const next = normalizeIp(chain[index]!)
    if (!next) return peer ? normalizeIp(peer) ?? 'unknown' : 'unknown'
    current = next
  }
  return current
}

const limiter = new AuthRateLimiter()
const policies = {
  login: {limit:30,windowMs:15*60_000},
  register: {limit:10,windowMs:60*60_000}
}

export function enforceAuthRateLimit(event: H3Event, scope: keyof typeof policies) {
  const peer = getRequestIP(event,{xForwardedFor:false})
  const trusted = (process.env.AUTH_TRUSTED_PROXY_IPS ?? '').split(',').filter(Boolean)
  const ip = resolveAuthClientIp(peer,getRequestHeader(event,'x-forwarded-for'),trusted)
  const identity = createHash('sha256').update(ip).digest('hex')
  const policy = policies[scope]
  const decision = limiter.consume(`${scope}:${identity}`,policy.limit,policy.windowMs)
  if (!decision.allowed) {
    setHeader(event,'Retry-After',decision.retryAfter)
    setHeader(event,'Cache-Control','no-store')
    throw createError({statusCode:429,statusMessage:'Too many authentication attempts. Please try again later.'})
  }
}
