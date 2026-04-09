import { listGuideArticles } from '../../utils/guide-db'
import { requireSessionUser } from '../../utils/auth-db'

export default defineEventHandler(async (event) => {
  await requireSessionUser(event)
  return await listGuideArticles()
})
