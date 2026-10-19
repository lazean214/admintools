import test from 'node:test'
import assert from 'node:assert/strict'
import { scryptSync } from 'node:crypto'
import { hashPassword, verifyPassword } from '../server/utils/passwords.ts'
import { parseLoginInput, parseRegisterInput } from '../server/utils/auth-input.ts'
import { loginUser, registerUser } from '../server/utils/auth-db.ts'
import { AuthRateLimiter, resolveAuthClientIp } from '../server/utils/auth-rate-limit.ts'

test('async password verification accepts legacy hashes and rejects incorrect passwords', async () => {
  const salt = '0123456789abcdef0123456789abcdef'
  const password = '  Existing café password 🔒  '
  const legacyHash = scryptSync(password,salt,64).toString('hex')
  assert.equal(await verifyPassword(password,legacyHash,salt),true)
  assert.equal(await verifyPassword(password.trim(),legacyHash,salt),false)
  assert.equal(await verifyPassword('wrong',legacyHash,salt),false)
})

test('registration creates salted hashes compatible with the legacy format', async () => {
  const password = 'new password'
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.match(first.hash,/^[a-f0-9]{128}$/)
  assert.match(first.salt,/^[a-f0-9]{32}$/)
  assert.notEqual(first.salt,second.salt)
  assert.notEqual(first.hash,second.hash)
  assert.equal(first.hash,scryptSync(password,first.salt,64).toString('hex'))
  assert.equal(await verifyPassword(password,first.hash,first.salt),true)
})

test('malformed stored credentials fail verification without Buffer decoding errors', async () => {
  for (const [hash,salt] of [['',''],['ab','00'.repeat(16)],['g'.repeat(128),'00'.repeat(16)],['00'.repeat(64),'invalid']]) {
    assert.equal(await verifyPassword('password',hash,salt),false)
  }
})

test('authentication normalizes identity fields while preserving password bytes', () => {
  assert.deepEqual(parseLoginInput({email:' TEST@Example.COM ',password:'  password  '}),{email:'test@example.com',password:'  password  '})
  assert.deepEqual(parseRegisterInput({name:'  Test User  ',email:' TEST@Example.COM ',password:'123456',role:'admin'}),{name:'Test User',email:'test@example.com',password:'123456'})
  assert.equal(parseLoginInput({email:'a@b.co',password:'a'.repeat(4096)}).password.length,4096)
})

test('malformed payloads, invalid field types and oversized values produce HTTP 400 errors', () => {
  const invalid = [null,undefined,[],true,'text',{}, {email:42,password:'password'}, {email:'test@example.com',password:{}}, {email:'bad',password:'password'}, {email:'x'.repeat(321)+'@a.co',password:'password'}, {email:'test@example.com',password:''}, {email:'test@example.com',password:'a'.repeat(4097)}, {email:'test@example.com',password:'é'.repeat(2049)}]
  for (const payload of invalid) assert.throws(()=>parseLoginInput(payload),error=>error.statusCode===400)
  for (const extra of [{name:{}},{name:' '},{name:'a'.repeat(201)},{name:'Test',password:'12345'}]) {
    assert.throws(()=>parseRegisterInput({email:'test@example.com',password:'123456',...extra}),error=>error.statusCode===400)
  }
})

test('auth service entry points reject invalid payloads before requesting a database client', async () => {
  for (const input of [null,[],{email:42,password:'password'},{email:'test@example.com',password:{}}]) {
    await assert.rejects(loginUser(input),error=>error.statusCode===400)
    await assert.rejects(registerUser(input),error=>error.statusCode===400)
  }
})

test('authentication rate limits admit exact budgets, isolate callers and recover after expiry', () => {
  let now=0
  const limiter = new AuthRateLimiter(()=>now)
  for (let i=0;i<3;i++) assert.equal(limiter.consume('login:client1',3,15_000).allowed,true)
  assert.deepEqual(limiter.consume('login:client1',3,15_000),{allowed:false,retryAfter:15})
  assert.equal(limiter.consume('login:client2',3,15_000).allowed,true)
  assert.equal(limiter.consume('register:client1',1,60_000).allowed,true)
  now=14_001
  assert.deepEqual(limiter.consume('login:client1',3,15_000),{allowed:false,retryAfter:1})
  now=15_000
  assert.equal(limiter.consume('login:client1',3,15_000).allowed,true)
  assert.equal(limiter.consume('register:client1',1,60_000).allowed,false)
})

test('full limiter fails closed without evicting live budgets, then reclaims expired entries', () => {
  let now=0
  const limiter = new AuthRateLimiter(()=>now,2)
  assert.equal(limiter.consume('first',1,60_000).allowed,true)
  assert.equal(limiter.consume('second',1,60_000).allowed,true)
  for (let i=0;i<100;i++) assert.equal(limiter.consume(`new-${i}`,1,60_000).allowed,false)
  assert.equal(limiter.consume('first',1,60_000).allowed,false)
  now=60_000
  assert.equal(limiter.consume('new-client',1,60_000).allowed,true)
})

test('client identity ignores spoofed forwarded headers and walks only explicitly trusted proxies', () => {
  assert.equal(resolveAuthClientIp('192.0.2.1','198.51.100.2',[]),'192.0.2.1')
  assert.equal(resolveAuthClientIp('::ffff:192.0.2.1',undefined,[]),'192.0.2.1')
  assert.equal(resolveAuthClientIp('127.0.0.1','198.51.100.2',['127.0.0.1']),'198.51.100.2')
  assert.equal(resolveAuthClientIp('127.0.0.1','203.0.113.9, 198.51.100.2',['127.0.0.1']),'198.51.100.2')
  assert.equal(resolveAuthClientIp('127.0.0.1','203.0.113.9, 10.0.0.2',['127.0.0.1','10.0.0.2']),'203.0.113.9')
  assert.equal(resolveAuthClientIp('127.0.0.1','invalid',['127.0.0.1']),'127.0.0.1')
  assert.equal(resolveAuthClientIp(undefined,'198.51.100.2',[]),'unknown')
  assert.equal(resolveAuthClientIp('127.0.0.1','1.1.1.1,'.repeat(30),['127.0.0.1']),'127.0.0.1')
})
