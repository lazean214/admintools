import { getRouterParam } from 'h3'
import { deleteGuideArticle } from '../../utils/guide-db'
import { requireRole } from '../../utils/auth-db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article id is required.' })
  }

  const deleted = await deleteGuideArticle(id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found.' })
  }

  return { ok: true }
})
