import { createSession, loginUser } from '../../utils/auth-db'
import { enforceAuthRateLimit } from '../../utils/auth-rate-limit'
import { readAuthJson } from '../../utils/auth-body'

export default defineEventHandler(async (event) => {
  await enforceAuthRateLimit(event,'login')
  const body = await readAuthJson(event)
  const user = await loginUser(body)

  await createSession(event, user.id)
  return user
})
