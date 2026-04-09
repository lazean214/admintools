<script setup lang="ts">
useSeoMeta({
  title: 'Image Resize',
  description: 'Resize one or many images while preserving aspect ratio and previewing output before export.',
  ogTitle: 'Image Resize Tool',
  ogDescription: 'Batch resize images with controlled dimensions and quality.',
  twitterTitle: 'Image Resize Tool',
  twitterDescription: 'Resize single or multiple images for your listing workflow.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Image Resize</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <ImageResizeModule />
    </div>
  </div>
</template>
