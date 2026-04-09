import { getRouterParam } from 'h3'
import { createUniqueSlug, getGuideDb, toResponseArticle, type GuideArticleRow } from '../../utils/guide-db'
import { requireRole } from '../../utils/auth-db'

type UpdateBody = {
  title?: string
  excerpt?: string
  coverImage?: string
  markdown?: string
}

export default defineEventHandler(async (event) => {
  requireRole(event, ['admin', 'editor'])
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article id is required.' })
  }

  const body = await readBody<UpdateBody>(event)
  const title = body.title?.trim() || ''
  const markdown = body.markdown?.trim() || ''

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  }

  if (!markdown) {
    throw createError({ statusCode: 400, statusMessage: 'Markdown content is required.' })
  }

  const db = getGuideDb()
  const existing = db.prepare('SELECT id FROM guide_articles WHERE id = ? LIMIT 1').get(id) as { id: string } | undefined
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found.' })
  }

  const now = new Date().toISOString()
  const slug = createUniqueSlug(db, title, id)

  db.prepare(
    `UPDATE guide_articles
     SET title = ?, slug = ?, excerpt = ?, cover_image = ?, markdown = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    title,
    slug,
    body.excerpt?.trim() || '',
    body.coverImage?.trim() || '',
    markdown,
    now,
    id
  )

  const row = db.prepare('SELECT * FROM guide_articles WHERE id = ? LIMIT 1').get(id) as GuideArticleRow | undefined
  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load updated article.' })
  }

  return toResponseArticle(row)
})
