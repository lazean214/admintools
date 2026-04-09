<script setup lang="ts">
useSeoMeta({
  title: 'Watermark Remover',
  description: 'Select and soften watermark areas in images to reduce visual overlays and distractions.',
  ogTitle: 'Watermark Remover Tool',
  ogDescription: 'Minimize watermark overlays with area-based cleanup controls.',
  twitterTitle: 'Watermark Remover Tool',
  twitterDescription: 'Reduce or soften watermark areas in your images.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Watermark Remover</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <WatermarkRemoverModule />
    </div>
  </div>
</template>
