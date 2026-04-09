import { getRouterParam } from 'h3'
import { getGuideArticleById } from '../../utils/guide-db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article id is required.' })
  }

  const article = await getGuideArticleById(id)
  if (!article) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found.' })
  }

  return article
})
