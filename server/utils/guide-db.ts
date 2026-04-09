import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'

export type GuideArticleRow = {
  id: string
  title: string
  slug: string
  excerpt: string
  cover_image: string
  markdown: string
  created_at: string
  updated_at: string
}

type DbWithTypedMethods = Database.Database

declare global {
  // eslint-disable-next-line no-var
  var __guideDb: DbWithTypedMethods | undefined
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

function ensureDbFilePath() {
  const filePath = join(process.cwd(), '.data', 'guide.sqlite')
  mkdirSync(dirname(filePath), { recursive: true })
  return filePath
}

export function getGuideDb() {
  if (globalThis.__guideDb) {
    return globalThis.__guideDb
  }

  const db = new Database(ensureDbFilePath())
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS guide_articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      cover_image TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_guide_articles_updated_at ON guide_articles(updated_at DESC);
  `)

  globalThis.__guideDb = db
  return db
}

export function toResponseArticle(row: GuideArticleRow) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImage: row.cover_image,
    markdown: row.markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createUniqueSlug(db: DbWithTypedMethods, title: string, excludeId?: string) {
  const base = makeSlug(title)

  if (excludeId) {
    const stmt = db.prepare('SELECT id FROM guide_articles WHERE slug = ? AND id != ? LIMIT 1')
    const exists = stmt.get(base, excludeId) as { id: string } | undefined
    if (!exists) {
      return base
    }

    let counter = 2
    while (true) {
      const nextSlug = `${base}-${counter}`
      const duplicate = stmt.get(nextSlug, excludeId) as { id: string } | undefined
      if (!duplicate) {
        return nextSlug
      }
      counter += 1
    }
  }

  const stmt = db.prepare('SELECT id FROM guide_articles WHERE slug = ? LIMIT 1')
  const exists = stmt.get(base) as { id: string } | undefined
  if (!exists) {
    return base
  }

  let counter = 2
  while (true) {
    const nextSlug = `${base}-${counter}`
    const duplicate = stmt.get(nextSlug) as { id: string } | undefined
    if (!duplicate) {
      return nextSlug
    }
    counter += 1
  }
}
