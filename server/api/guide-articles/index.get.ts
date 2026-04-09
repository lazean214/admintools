import { getGuideDb, toResponseArticle, type GuideArticleRow } from '../../utils/guide-db'
import { requireSessionUser } from '../../utils/auth-db'

export default defineEventHandler((event) => {
  requireSessionUser(event)
  const db = getGuideDb()
  const rows = db
    .prepare('SELECT * FROM guide_articles ORDER BY datetime(updated_at) DESC')
    .all() as GuideArticleRow[]

  return rows.map(toResponseArticle)
})
