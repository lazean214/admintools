<script setup lang="ts">
useSeoMeta({
  title: 'Image Converter',
  description: 'Convert HEIC, RAW, TIFF and other photos to JPG, PNG, WebP, TIFF, BMP or ICO locally in your browser.',
  ogTitle: 'Image Converter',
  ogDescription: 'Batch photo format conversion with previews and ZIP downloads.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">Image Converter</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <ImageConverterModule />
    </div>
  </div>
</template>
