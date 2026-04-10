<script setup lang="ts">
type GuideArticle = {
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

const sharedPrefetchedArticles = useState<GuideArticle[]>('guide-prefetched-articles', () => [])
const hasPrefetchedArticles = useState<boolean>('guide-prefetched-once', () => false)

if (!hasPrefetchedArticles.value) {
  const guideArticlesEndpoint = ['/api', 'guide-articles'].join('/')
  const { data } = await useAsyncData<GuideArticle[]>(
    'guide-articles-prefetch',
    () => $fetch<GuideArticle[]>(guideArticlesEndpoint),
    {
      server: true,
      lazy: true,
      default: () => []
    }
  )

  sharedPrefetchedArticles.value = data.value || []
  hasPrefetchedArticles.value = true
}

useSeoMeta({
  title: 'Real Estate Guide',
  description: 'Create and manage real estate admin guide articles with markdown and uploaded images.',
  ogTitle: 'Real Estate Guide',
  ogDescription: 'Blog-style guide manager for real estate admin teams.',
  twitterTitle: 'Real Estate Guide',
  twitterDescription: 'Write markdown guide articles with image upload support.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">Real Estate Guide</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <WikiPageModule :initial-articles="sharedPrefetchedArticles || []" />
    </div>
  </div>
</template>
