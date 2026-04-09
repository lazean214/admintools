import { listGuideArticles } from '../../utils/guide-db'

export default defineEventHandler(async () => {
  return await listGuideArticles()
})
