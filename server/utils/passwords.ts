import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// Keep the legacy scrypt parameters and salt-as-UTF8-string representation so
// existing accounts continue to verify without resetting their passwords.
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve,reject) => {
    scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024},(error,key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = (await derive(password,salt)).toString('hex')
  return {hash,salt}
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  if (!/^[a-f0-9]{128}$/i.test(hash) || !/^[a-f0-9]{32}$/i.test(salt)) return false
  const candidate = await derive(password,salt)
  return timingSafeEqual(candidate,Buffer.from(hash,'hex'))
}
