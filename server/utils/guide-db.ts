import { createError } from 'h3'
import { getSupabaseAdminClient } from './supabase-admin'

export type GuideArticleRow = {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string
  hashtags_json: string
  markdown: string
  created_at: string
  updated_at: string
}

function makeSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return normalized || 'untitled-article'
}
function normalizeTag(value: string) {
  return value
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
}

export function sanitizeHashtags(value: unknown): string[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\s]+/)
      : []

  const unique = new Set<string>()
  for (const item of candidates) {
    if (typeof item !== 'string') {
      continue
    }
    const clean = normalizeTag(item)
    if (!clean) {
      continue
    }
    unique.add(clean)
    if (unique.size >= 20) {
      break
    }
  }

  return [...unique]
}

function throwSupabaseError(error: { message: string } | null, fallbackMessage: string): never {
  throw createError({
    statusCode: 500,
    statusMessage: error?.message || fallbackMessage
  })
}

export function toResponseArticle(row: GuideArticleRow) {
  let hashtags: string[]
  try {
    hashtags = sanitizeHashtags(JSON.parse(row.hashtags_json))
  } catch {
    hashtags = []
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImage: row.cover_image,
    hashtags,
    markdown: row.markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function createUniqueSlug(title: string, excludeId?: string) {
  const supabase = getSupabaseAdminClient()
  const base = makeSlug(title)

  const { data, error } = await supabase.from('guide_articles').select('id, slug')
  if (error) {
    throwSupabaseError(error, 'Could not check existing slugs.')
  }

  const used = new Set<string>()
  for (const row of data || []) {
    if (excludeId && row.id === excludeId) {
      continue
    }
    if (typeof row.slug === 'string' && row.slug) {
      used.add(row.slug)
    }
  }

  if (!used.has(base)) {
    return base
  }

  let counter = 2
  while (true) {
    const nextSlug = `${base}-${counter}`
    if (!used.has(nextSlug)) {
      return nextSlug
    }
    counter += 1
  }
}

export async function listGuideArticles() {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('guide_articles')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    throwSupabaseError(error, 'Could not list guide articles.')
  }

  return (data || []).map((row) => toResponseArticle(row as GuideArticleRow))
}

export async function getGuideArticleById(id: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('guide_articles')
    .select('*')
    .eq('id', id)
    .maybeSingle<GuideArticleRow>()

  if (error) {
    throwSupabaseError(error, 'Could not load guide article.')
  }

  return data ? toResponseArticle(data) : null
}

export async function createGuideArticle(input: {
  id: string
  title: string
  excerpt: string
  coverImage: string
  hashtags: string[]
  markdown: string
}) {
  const supabase = getSupabaseAdminClient()
  const now = new Date().toISOString()
  const slug = await createUniqueSlug(input.title)

  const { data, error } = await supabase
    .from('guide_articles')
    .insert({
      id: input.id,
      title: input.title,
      slug,
      excerpt: input.excerpt,
      cover_image: input.coverImage,
      hashtags_json: JSON.stringify(sanitizeHashtags(input.hashtags)),
      markdown: input.markdown,
      created_at: now,
      updated_at: now
    })
    .select('*')
    .single<GuideArticleRow>()

  if (error || !data) {
    throwSupabaseError(error, 'Could not create guide article.')
  }

  return toResponseArticle(data)
}

export async function updateGuideArticle(
  id: string,
  input: {
    title: string
    excerpt: string
    coverImage: string
    hashtags: string[]
    markdown: string
  }
) {
  const supabase = getSupabaseAdminClient()
  const slug = await createUniqueSlug(input.title, id)

  const { data, error } = await supabase
    .from('guide_articles')
    .update({
      title: input.title,
      slug,
      excerpt: input.excerpt,
      cover_image: input.coverImage,
      hashtags_json: JSON.stringify(sanitizeHashtags(input.hashtags)),
      markdown: input.markdown,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single<GuideArticleRow>()

  if (error || !data) {
    throwSupabaseError(error, 'Could not update guide article.')
  }

  return toResponseArticle(data)
}

export async function deleteGuideArticle(id: string) {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('guide_articles')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    throwSupabaseError(error, 'Could not delete guide article.')
  }

  return Boolean(data)
}
