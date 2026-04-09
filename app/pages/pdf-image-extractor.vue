<script setup lang="ts">
useSeoMeta({
  title: 'PDF Image Extractor',
  description: 'Extract embedded images from PDF files with preview and bulk download support.',
  ogTitle: 'PDF Image Extractor Tool',
  ogDescription: 'Pull images from PDFs and download selected files quickly.',
  twitterTitle: 'PDF Image Extractor Tool',
  twitterDescription: 'Extract and download images from PDF documents.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">PDF Image Extractor</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <PdfImageExtractorModule />
    </div>
  </div>
</template>
