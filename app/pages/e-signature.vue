<script setup lang="ts">
useSeoMeta({
  title: 'E-Signature',
  description: 'Draw or upload a signature and export it for forms, approvals, and document workflows.',
  ogTitle: 'E-Signature Tool',
  ogDescription: 'Create digital signatures for quick form completion.',
  twitterTitle: 'E-Signature Tool',
  twitterDescription: 'Generate and export signatures for document use.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">E-Signature</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <ESignatureModule />
    </div>
  </div>
</template>
