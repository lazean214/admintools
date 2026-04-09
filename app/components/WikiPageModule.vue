<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'

interface GuideArticle {
  id: string
  title: string
  slug: string
  excerpt: string
  coverImage: string
  hashtags: string[]
  markdown: string
  createdAt?: string
  updatedAt: string
}

interface TocItem {
  text: string
  level: number
  anchor: string
}

type GuideMode = 'view' | 'create' | 'edit'
type ToastKind = 'success' | 'error' | 'info'

interface ToastMessage {
  id: string
  kind: ToastKind
  text: string
}

const auth = useAuth()
const articles = ref<GuideArticle[]>([])
const search = ref('')
const status = ref('Ready')
const selectedArticleId = ref('')
const activeMode = ref<GuideMode>('view')
const isBusy = ref(false)
const isSaving = ref(false)
const inlineImageInput = ref<HTMLInputElement | null>(null)
const toasts = ref<ToastMessage[]>([])

const editor = ref<GuideArticle>({
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  coverImage: '',
  hashtags: [],
  markdown: '',
  updatedAt: ''
})

const hashtagsText = computed({
  get: () => editor.value.hashtags.map((tag) => `#${tag}`).join(' '),
  set: (value: string) => {
    editor.value.hashtags = parseHashtagsFromText(value)
  }
})

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
}).use(markdownItAnchor, {
  slugify: slugifyHeading
})

const filteredArticles = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) {
    return articles.value
  }

  return articles.value.filter((article) => {
    const blob = [article.title, article.slug, article.excerpt, article.markdown, article.hashtags.join(' ')].join(' ').toLowerCase()
    return blob.includes(keyword)
  })
})

const selectedArticle = computed(() => {
  return articles.value.find((article) => article.id === selectedArticleId.value) ?? null
})

const canSave = computed(() => {
  return editor.value.title.trim().length > 0 && editor.value.markdown.trim().length > 0
})

const canManageArticles = computed(() => {
  const role = auth.currentUser.value?.role
  return role === 'admin' || role === 'editor'
})

const isFormVisible = computed(() => {
  return activeMode.value === 'create' || activeMode.value === 'edit'
})

const previewArticle = computed<GuideArticle | null>(() => {
  if (activeMode.value === 'view') {
    return selectedArticle.value
  }
  return editor.value
})

const previewSlug = computed(() => {
  return previewArticle.value?.slug || 'untitled-article'
})

const previewTitle = computed(() => {
  return previewArticle.value?.title || 'Untitled Article'
})

const previewExcerpt = computed(() => {
  return previewArticle.value?.excerpt || 'Add an excerpt for the article list.'
})

const previewHashtags = computed(() => {
  return previewArticle.value?.hashtags || []
})

const previewCoverImage = computed(() => {
  return previewArticle.value?.coverImage || ''
})

const previewMarkdownSource = computed(() => {
  return previewArticle.value?.markdown?.trim() || ''
})

const renderedMarkdown = computed(() => {
  const source = previewMarkdownSource.value
  if (!source) {
    return '<p>Select an article to view it, or click Create to add one.</p>'
  }

  return markdown.render(source)
})

const tableOfContents = computed(() => {
  const tokens = markdown.parse(previewMarkdownSource.value, {})
  const entries: TocItem[] = []
  const seen = new Map<string, number>()

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token || token.type !== 'heading_open') {
      continue
    }

    const inlineToken = tokens[index + 1]
    const text = inlineToken?.type === 'inline' ? inlineToken.content.trim() : ''
    const level = Number(token.tag.replace('h', '')) || 2
    const base = slugifyHeading(text || `section-${index}`)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const anchor = count > 0 ? `${base}-${count}` : base

    entries.push({
      text: text || 'Untitled Heading',
      level,
      anchor
    })
  }

  return entries
})

watch(
  () => editor.value.title,
  (value) => {
    editor.value.slug = makeSlug(value)
  }
)

onMounted(() => {
  void auth.hydrate()
  loadArticles()
})

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'section'
}

function parseHashtagsFromText(value: string) {
  const parts = value.split(/[,\s]+/)
  const unique = new Set<string>()

  for (const item of parts) {
    const clean = item
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')

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

function setStatus(message: string) {
  status.value = message
}

function notify(kind: ToastKind, text: string) {
  const id = createId()
  toasts.value.push({ id, kind, text })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }, 3000)
}

function articleForEditor(article: GuideArticle): GuideArticle {
  return JSON.parse(JSON.stringify(article)) as GuideArticle
}

function defaultArticle(): GuideArticle {
  return {
    id: '',
    title: '',
    slug: '',
    excerpt: '',
    coverImage: '',
    hashtags: [],
    markdown: '# New Article\n\nWrite your guide content here.\n\n## First Section\n\nUse markdown headings and bullet lists to keep it readable.',
    updatedAt: ''
  }
}

function startNewArticle() {
  if (!canManageArticles.value) {
    setStatus('Viewer role can only read articles.')
    return
  }

  activeMode.value = 'create'
  editor.value = defaultArticle()
  setStatus('Create mode enabled.')
}

function startEditArticle() {
  if (!canManageArticles.value) {
    setStatus('Viewer role can only read articles.')
    return
  }

  if (!selectedArticle.value) {
    setStatus('Select an article before editing.')
    return
  }

  activeMode.value = 'edit'
  editor.value = articleForEditor(selectedArticle.value)
  setStatus(`Editing "${selectedArticle.value.title}".`)
  notify('info', `Editing "${selectedArticle.value.title}".`)
}

function cancelEditing() {
  activeMode.value = 'view'
  if (selectedArticle.value) {
    editor.value = articleForEditor(selectedArticle.value)
    setStatus(`Viewing "${selectedArticle.value.title}".`)
    return
  }

  editor.value = defaultArticle()
  setStatus('View mode enabled.')
}

function sanitizeArticle(value: unknown): GuideArticle | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<GuideArticle>
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') {
    return null
  }

  return {
    id: candidate.id,
    title: candidate.title,
    slug: typeof candidate.slug === 'string' ? candidate.slug : makeSlug(candidate.title),
    excerpt: typeof candidate.excerpt === 'string' ? candidate.excerpt : '',
    coverImage: typeof candidate.coverImage === 'string' ? candidate.coverImage : '',
    hashtags: Array.isArray(candidate.hashtags)
      ? parseHashtagsFromText(candidate.hashtags.join(' '))
      : [],
    markdown: typeof candidate.markdown === 'string' ? candidate.markdown : '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString()
  }
}

async function loadArticles() {
  isBusy.value = true
  try {
    const list = await $fetch<GuideArticle[]>('/api/guide-articles')
    articles.value = Array.isArray(list)
      ? list.map(sanitizeArticle).filter((article): article is GuideArticle => article !== null)
      : []

    const firstArticle = articles.value[0]
    if (firstArticle) {
      openArticle(firstArticle.id)
      return
    }

    selectedArticleId.value = ''
    activeMode.value = 'view'
    editor.value = defaultArticle()
    setStatus('No guide articles yet. Click Create to start.')
  } catch (error) {
    console.error(error)
    articles.value = []
    selectedArticleId.value = ''
    activeMode.value = 'view'
    editor.value = defaultArticle()
    setStatus('Could not load saved guide articles.')
  } finally {
    isBusy.value = false
  }
}

function openArticle(articleId: string) {
  const article = articles.value.find((item) => item.id === articleId)
  if (!article) {
    return
  }

  activeMode.value = 'view'
  selectedArticleId.value = article.id
  editor.value = articleForEditor(article)
  setStatus(`Viewing "${article.title}".`)
}

async function saveArticle() {
  if (!canManageArticles.value) {
    setStatus('Viewer role cannot save articles.')
    return
  }

  if (!canSave.value) {
    setStatus('Add article title and markdown content before saving.')
    return
  }

  isBusy.value = true
  isSaving.value = true
  setStatus('Saving article...')
  try {
    const payload = {
      title: editor.value.title.trim(),
      excerpt: editor.value.excerpt.trim(),
      coverImage: editor.value.coverImage.trim(),
      hashtags: editor.value.hashtags,
      markdown: editor.value.markdown.trim()
    }

    const saved = editor.value.id
      ? await $fetch<GuideArticle>(`/api/guide-articles/${editor.value.id}`, {
        method: 'PUT',
        body: payload
      })
      : await $fetch<GuideArticle>('/api/guide-articles', {
        method: 'POST',
        body: payload
      })

    const existingIndex = articles.value.findIndex((article) => article.id === saved.id)
    if (existingIndex >= 0) {
      articles.value.splice(existingIndex, 1, saved)
      setStatus(`Updated "${saved.title}".`)
      notify('success', `Article updated: "${saved.title}"`)
    } else {
      articles.value.unshift(saved)
      setStatus(`Created "${saved.title}".`)
      notify('success', `Article created: "${saved.title}"`)
    }

    articles.value.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    activeMode.value = 'view'
    selectedArticleId.value = saved.id
    editor.value = articleForEditor(saved)
  } catch (error) {
    console.error(error)
    setStatus('Could not save article to database.')
    notify('error', 'Could not save article. Please try again.')
  } finally {
    isSaving.value = false
    isBusy.value = false
  }
}

async function deleteArticle(articleId: string) {
  if (!canManageArticles.value) {
    setStatus('Viewer role cannot delete articles.')
    return
  }

  const article = articles.value.find((item) => item.id === articleId)
  if (!article) {
    return
  }

  const confirmed = window.confirm(`Delete article "${article.title}"?`)
  if (!confirmed) {
    return
  }

  isBusy.value = true
  try {
    await $fetch(`/api/guide-articles/${articleId}`, { method: 'DELETE' })
    articles.value = articles.value.filter((item) => item.id !== articleId)

    if (selectedArticleId.value === articleId) {
      const firstArticle = articles.value[0]
      if (firstArticle) {
        openArticle(firstArticle.id)
      } else {
        selectedArticleId.value = ''
        activeMode.value = 'view'
        editor.value = defaultArticle()
      }
    }

    setStatus(`Deleted "${article.title}".`)
    notify('success', `Article deleted: "${article.title}"`)
  } catch (error) {
    console.error(error)
    setStatus('Could not delete article from database.')
    notify('error', 'Could not delete article. Please try again.')
  } finally {
    isBusy.value = false
  }
}

async function readAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read selected image.'))
    reader.readAsDataURL(file)
  })
}

async function onCoverImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  if (!file) {
    return
  }

  try {
    editor.value.coverImage = await readAsDataUrl(file)
    setStatus('Cover image uploaded.')
    notify('success', 'Cover image uploaded.')
  } catch (error) {
    console.error(error)
    setStatus('Could not upload cover image.')
    notify('error', 'Could not upload cover image.')
  }
}

function openInlineImagePicker() {
  inlineImageInput.value?.click()
}

async function onInlineImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  if (!file) {
    return
  }

  try {
    const imageSource = await readAsDataUrl(file)
    const alt = file.name.replace(/\.[^.]+$/, '') || 'guide-image'
    const snippet = `\n![${alt}](${imageSource})\n`
    editor.value.markdown = `${editor.value.markdown.trimEnd()}${snippet}`
    setStatus('Image added to markdown content.')
    notify('success', 'Image added to markdown content.')
  } catch (error) {
    console.error(error)
    setStatus('Could not add image to markdown.')
    notify('error', 'Could not add image to markdown.')
  } finally {
    target.value = ''
  }
}

function insertHeading() {
  editor.value.markdown = `${editor.value.markdown.trimEnd()}\n\n## New Section\n\n`
}

function prettyDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}
</script>

<template>
  <section class="module-surface">
    <div class="pointer-events-none fixed right-4 top-4 z-50 flex w-[22rem] max-w-[92vw] flex-col gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-lg"
        :class="
          toast.kind === 'success'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : toast.kind === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900'
              : 'border-sky-300 bg-sky-50 text-sky-900'
        "
      >
        {{ toast.text }}
      </div>
    </div>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="module-title text-2xl font-bold">Real Estate Guide</h2>
        <p class="mt-1 text-sm text-slate-600">Manage admin-focused blog articles with markdown writing and image uploads.</p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="isSaving" class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Saving...</span>
        <p class="status-pill">{{ status }}</p>
      </div>
    </div>

    <div class="mt-5 grid gap-4 xl:grid-cols-[20rem,1fr]">
      <aside class="space-y-3 rounded-2xl border border-slate-200 bg-white/70 p-4">
        <div class="flex items-center gap-2">
          <input
            v-model="search"
            type="text"
            class="field-control"
            placeholder="Search guide articles"
          >
          <button
            type="button"
            class="btn-secondary whitespace-nowrap"
            :class="!canManageArticles ? 'opacity-50 cursor-not-allowed' : ''"
            :disabled="!canManageArticles"
            @click="startNewArticle"
          >
            Create
          </button>
        </div>

        <div class="max-h-[30rem] space-y-2 overflow-auto pr-1">
          <button
            v-for="article in filteredArticles"
            :key="article.id"
            type="button"
            class="w-full rounded-xl border p-3 text-left transition"
            :class="selectedArticleId === article.id ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:border-teal-300'"
            @click="openArticle(article.id)"
          >
            <p class="line-clamp-2 font-semibold text-slate-900">{{ article.title }}</p>
            <p class="mt-1 text-xs text-slate-500">/{{ article.slug }}</p>
            <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ article.excerpt || 'No excerpt added yet.' }}</p>
            <div v-if="article.hashtags.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="tag in article.hashtags"
                :key="`${article.id}-${tag}`"
                class="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800"
              >
                #{{ tag }}
              </span>
            </div>
            <p class="mt-2 text-xs text-slate-500">Updated: {{ prettyDate(article.updatedAt) }}</p>
            <button
              v-if="canManageArticles"
              type="button"
              class="mt-3 rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600"
              @click.stop="deleteArticle(article.id)"
            >
              Delete
            </button>
          </button>

          <p v-if="filteredArticles.length === 0" class="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
            No articles found. Click Create to add your first guide.
          </p>
        </div>
      </aside>

      <div class="space-y-4">
        <div v-if="isFormVisible" class="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="module-title text-lg font-bold">{{ activeMode === 'create' ? 'Create Article' : 'Edit Article' }}</h3>
            <button type="button" class="btn-ghost" @click="cancelEditing">Cancel</button>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <label class="text-sm font-semibold md:col-span-2">
              Title
              <input v-model="editor.title" type="text" class="field-control mt-1" placeholder="Example: RERA Checklist for New Agents" >
            </label>

            <label class="text-sm font-semibold">
              Slug
              <input v-model="editor.slug" type="text" class="field-control mt-1 bg-slate-100" readonly >
            </label>

            <label class="text-sm font-semibold">
              Excerpt
              <input v-model="editor.excerpt" type="text" class="field-control mt-1" placeholder="Brief summary shown in article list" >
            </label>

            <label class="text-sm font-semibold md:col-span-2">
              Hashtags (categories)
              <input
                v-model="hashtagsText"
                type="text"
                class="field-control mt-1"
                placeholder="#rera #listing-noc #admin-guide"
              >
              <span class="mt-1 block text-xs text-slate-500">Separate with spaces or commas. Example: #rera, #contracts</span>
            </label>

            <label class="text-sm font-semibold md:col-span-2">
              Cover Image Upload
              <input type="file" accept="image/*" class="field-control mt-1" @change="onCoverImageChange" >
            </label>
          </div>

          <div v-if="editor.coverImage" class="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img :src="editor.coverImage" alt="Cover preview" class="max-h-60 w-full object-cover">
          </div>

          <div class="mt-4">
            <label class="text-sm font-semibold">
              Markdown Content
              <textarea
                v-model="editor.markdown"
                class="field-control mt-1 min-h-72 font-mono text-sm"
                placeholder="# Article title\n\nWrite your guide using markdown..."
              ></textarea>
            </label>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn-ghost" @click="insertHeading">Insert Heading</button>
              <button type="button" class="btn-ghost" @click="openInlineImagePicker">Add Image to Markdown</button>
              <input
                ref="inlineImageInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onInlineImageChange"
              >
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" class="btn-primary" :class="isSaving ? 'opacity-70 cursor-wait' : ''" :disabled="isSaving" @click="saveArticle">
              {{ isSaving ? 'Saving...' : 'Save Article' }}
            </button>
            <p v-if="!canManageArticles" class="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">Viewer role cannot create, edit, or delete articles.</p>
            <p class="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">Markdown supports headings, lists, links, and uploaded images.</p>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="module-title text-lg font-bold">Live Preview</h3>
            <div class="flex flex-wrap items-center gap-2">
              <button
                v-if="activeMode === 'view'"
                type="button"
                class="btn-ghost"
                :class="!selectedArticle || !canManageArticles ? 'opacity-50 cursor-not-allowed' : ''"
                :disabled="!selectedArticle || !canManageArticles"
                @click="startEditArticle"
              >
                Edit
              </button>
              <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">/{{ previewSlug }}</span>
            </div>
          </div>

          <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div v-if="activeMode === 'view' && !selectedArticle" class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p class="module-title text-lg font-bold text-slate-800">No article selected</p>
              <p class="mt-2 text-sm text-slate-600">Select an article from the list to view it, or create a new one.</p>
              <button type="button" class="btn-secondary mt-4" @click="startNewArticle">Create Article</button>
            </div>

            <template v-else>
              <img
                v-if="previewCoverImage"
                :src="previewCoverImage"
                alt="Cover image"
                class="mb-4 max-h-72 w-full rounded-xl object-cover"
              >

              <h4 class="module-title text-2xl font-bold text-slate-900">{{ previewTitle }}</h4>
              <p class="mt-2 text-sm text-slate-600">{{ previewExcerpt }}</p>

              <div v-if="previewHashtags.length > 0" class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="tag in previewHashtags"
                  :key="`preview-${tag}`"
                  class="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-800"
                >
                  #{{ tag }}
                </span>
              </div>

              <div v-if="tableOfContents.length > 0" class="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-600">Contents</p>
                <ul class="mt-2 space-y-1 text-sm text-teal-700">
                  <li
                    v-for="item in tableOfContents"
                    :key="`${item.anchor}-${item.level}`"
                    :class="item.level > 2 ? 'ml-4' : ''"
                  >
                    <a :href="`#${item.anchor}`" class="underline decoration-teal-400 underline-offset-2">{{ item.text }}</a>
                  </li>
                </ul>
              </div>

              <article class="markdown-preview mt-5" v-html="renderedMarkdown"></article>
            </template>
          </div>

          <p v-if="activeMode === 'view' && selectedArticle" class="mt-3 text-xs text-slate-500">Viewing: {{ selectedArticle.title }}</p>
          <p v-else-if="activeMode === 'create'" class="mt-3 text-xs text-slate-500">Create mode enabled. Fill the form and save to publish.</p>
          <p v-else-if="activeMode === 'edit' && selectedArticle" class="mt-3 text-xs text-slate-500">Editing draft for: {{ selectedArticle.title }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.toast-item {
  animation: toast-enter 0.2s ease-out;
}

@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4) {
  font-family: 'Space Grotesk', sans-serif;
  color: #0f172a;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.markdown-preview :deep(h1) {
  font-size: 1.6rem;
}

.markdown-preview :deep(h2) {
  font-size: 1.35rem;
}

.markdown-preview :deep(p),
.markdown-preview :deep(li) {
  color: #334155;
  line-height: 1.65;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  margin: 0.5rem 0 0.75rem;
  padding-left: 1.25rem;
}

.markdown-preview :deep(a) {
  color: #0f766e;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-preview :deep(img) {
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  margin: 0.75rem 0;
  max-height: 26rem;
  width: 100%;
  object-fit: cover;
}

.markdown-preview :deep(pre) {
  background: #0f172a;
  border-radius: 0.75rem;
  color: #e2e8f0;
  overflow-x: auto;
  padding: 0.75rem;
}

.markdown-preview :deep(code) {
  background: #f1f5f9;
  border-radius: 0.35rem;
  color: #0f172a;
  padding: 0.15rem 0.3rem;
}

.markdown-preview :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
}
</style>
