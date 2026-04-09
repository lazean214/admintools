import { getRouterParam } from 'h3'
import { getGuideArticleById, sanitizeHashtags, updateGuideArticle } from '../../utils/guide-db'
import { requireRole } from '../../utils/auth-db'

type UpdateBody = {
  title?: string
  excerpt?: string
  coverImage?: string
  hashtags?: string[]
  markdown?: string
}

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'editor'])
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

  const existing = await getGuideArticleById(id)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found.' })
  }

  return await updateGuideArticle(id, {
    title,
    excerpt: body.excerpt?.trim() || '',
    coverImage: body.coverImage?.trim() || '',
    hashtags: sanitizeHashtags(body.hashtags),
    markdown
  })
})
