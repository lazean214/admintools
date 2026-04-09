<script setup lang="ts">
definePageMeta({
  middleware: ['auth']
})

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
      <WikiPageModule />
    </div>
  </div>
</template>
