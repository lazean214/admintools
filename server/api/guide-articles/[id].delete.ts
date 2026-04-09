import { getRouterParam } from 'h3'
import { getGuideDb } from '../../utils/guide-db'
import { requireRole } from '../../utils/auth-db'

export default defineEventHandler((event) => {
  requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article id is required.' })
  }

  const db = getGuideDb()
  const result = db.prepare('DELETE FROM guide_articles WHERE id = ?').run(id)
  if (result.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found.' })
  }

  return { ok: true }
})
