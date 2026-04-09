import { listUsers, requireSessionUser } from '../../utils/auth-db'

export default defineEventHandler(async (event) => {
  const requester = await requireSessionUser(event)
  return await listUsers(requester.id)
})
