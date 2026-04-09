import { getSessionUser } from '../../utils/auth-db'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }

  return user
})
