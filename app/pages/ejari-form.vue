<script setup lang="ts">
useSeoMeta({
  title: 'EJARI Form',
  description: 'Fill EJARI details and export a completed PDF using the EJARI template.',
  ogTitle: 'EJARI Template Export Tool',
  ogDescription: 'Complete EJARI fields quickly and generate a template-based PDF export.',
  twitterTitle: 'EJARI Template Export Tool',
  twitterDescription: 'Complete EJARI fields and export the final PDF with preview and download.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">EJARI Form</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <EjariFormModule />
    </div>
  </div>
</template>
