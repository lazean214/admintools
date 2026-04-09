import { randomUUID } from 'node:crypto'
import { createGuideArticle, sanitizeHashtags } from '../../utils/guide-db'
import { requireRole } from '../../utils/auth-db'

type CreateBody = {
  title?: string
  excerpt?: string
  coverImage?: string
  hashtags?: string[]
  markdown?: string
}

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
  const body = await readBody<CreateBody>(event)
  const title = body.title?.trim() || ''
  const markdown = body.markdown?.trim() || ''

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required.' })
  }

  if (!markdown) {
    throw createError({ statusCode: 400, statusMessage: 'Markdown content is required.' })
  }

  return await createGuideArticle({
    id: randomUUID(),
    title,
    excerpt: body.excerpt?.trim() || '',
    coverImage: body.coverImage?.trim() || '',
    hashtags: sanitizeHashtags(body.hashtags),
    markdown
  })
})
