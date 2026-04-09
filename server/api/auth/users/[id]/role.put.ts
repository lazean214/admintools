import { getRouterParam } from 'h3'
import { requireSessionUser, updateUserRole, type UserRole } from '../../../../utils/auth-db'

type RoleBody = {
  role?: UserRole
}

export default defineEventHandler(async (event) => {
  const requester = requireSessionUser(event)
  const targetUserId = getRouterParam(event, 'id')
  if (!targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })
  }

  const body = await readBody<RoleBody>(event)
  const role = body.role
  if (!role) {
    throw createError({ statusCode: 400, statusMessage: 'Role is required.' })
  }

  return updateUserRole(requester.id, targetUserId, role)
})
