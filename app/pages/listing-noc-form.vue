<script setup lang="ts">
useSeoMeta({
  title: 'Listing NOC Form',
  description: 'Load a fillable PDF template, map fields, and generate a completed export for listing NOC workflows.',
  ogTitle: 'Listing NOC Form Tool',
  ogDescription: 'Populate fillable PDF templates and produce clean final listing NOC documents.',
  twitterTitle: 'Listing NOC Form Tool',
  twitterDescription: 'Fill and export listing NOC PDF templates for real estate operations.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Listing NOC</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <PdfTemplateFillerModule />
    </div>
  </div>
</template>
