import { createSession, registerUser } from '../../utils/auth-db'
import { enforceAuthRateLimit } from '../../utils/auth-rate-limit'
import { readAuthJson } from '../../utils/auth-body'

export default defineEventHandler(async (event) => {
  enforceAuthRateLimit(event,'register')
  const body = await readAuthJson(event)
  const user = await registerUser(body)

  await createSession(event, user.id)
  return user
})
