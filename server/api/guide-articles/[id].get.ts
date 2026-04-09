import { getRouterParam } from 'h3'
import { getGuideDb, toResponseArticle, type GuideArticleRow } from '../../utils/guide-db'
import { requireSessionUser } from '../../utils/auth-db'

export default defineEventHandler((event) => {
  requireSessionUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article id is required.' })
  }

  const db = getGuideDb()
  const row = db.prepare('SELECT * FROM guide_articles WHERE id = ? LIMIT 1').get(id) as GuideArticleRow | undefined
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found.' })
  }

  return toResponseArticle(row)
})
