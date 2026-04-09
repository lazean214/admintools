import { randomUUID } from 'node:crypto'
import { createUniqueSlug, getGuideDb, toResponseArticle, type GuideArticleRow } from '../../utils/guide-db'
import { requireRole } from '../../utils/auth-db'

type CreateBody = {
  title?: string
  excerpt?: string
  coverImage?: string
  markdown?: string
}

export default defineEventHandler(async (event) => {
  requireRole(event, ['admin', 'editor'])
  const body = await readBody<CreateBody>(event)
  const title = body.title?.trim() || ''
  const markdown = body.markdown?.trim() || ''

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  }

  if (!markdown) {
    throw createError({ statusCode: 400, statusMessage: 'Markdown content is required.' })
  }

  const db = getGuideDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  const slug = createUniqueSlug(db, title)

  db.prepare(
    `INSERT INTO guide_articles (id, title, slug, excerpt, cover_image, markdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    title,
    slug,
    body.excerpt?.trim() || '',
    body.coverImage?.trim() || '',
    markdown,
    now,
    now
  )

  const row = db.prepare('SELECT * FROM guide_articles WHERE id = ? LIMIT 1').get(id) as GuideArticleRow | undefined
  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create article.' })
  }

  return toResponseArticle(row)
})
