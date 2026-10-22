<script setup lang="ts">
useSeoMeta({ title: 'Document Field Extractor', description: 'Read passports, Emirates IDs, NOCs and property documents locally. Review identity and property details before downloading or filling matching EJARI fields.' })
</script>
<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">Document Field Extractor</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <DocumentFieldExtractorModule />
    </div>
  </div>
</template>
