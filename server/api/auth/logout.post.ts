import { clearAuthSession } from '../../utils/auth-db'

export default defineEventHandler((event) => {
  clearAuthSession(event)
  return { ok: true }
})
