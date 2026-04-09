import { clearAuthSession } from '../../utils/auth-db'

export default defineEventHandler(async (event) => {
  await clearAuthSession(event)
  return { ok: true }
})
