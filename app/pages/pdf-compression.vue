<script setup lang="ts">
useSeoMeta({
  title: 'PDF Compression',
  description: 'Compress PDFs locally while preserving selectable text. Compare file sizes and choose lossless or JPEG image compression.',
  ogTitle: 'PDF Compression Tool',
  ogDescription: 'Reduce PDF file size in your browser with selectable text preserved.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">PDF Compression</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <PdfCompressionModule />
    </div>
  </div>
</template>
