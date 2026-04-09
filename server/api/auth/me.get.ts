import { getSessionUser } from '../../utils/auth-db'

export default defineEventHandler((event) => {
  const user = getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  return user
})
