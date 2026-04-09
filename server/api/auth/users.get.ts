import { listUsers, requireSessionUser } from '../../utils/auth-db'

export default defineEventHandler((event) => {
  const requester = requireSessionUser(event)
  return listUsers(requester.id)
})
