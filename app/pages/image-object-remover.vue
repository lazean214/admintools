<script setup lang="ts">
useSeoMeta({
  title: 'Image Object Remover',
  description: 'Remove unwanted objects from photos with browser-local AI image editing.',
  ogTitle: 'Image Object Remover Tool',
  ogDescription: 'Reconstruct selected image areas with local AI inpainting.',
  twitterTitle: 'Image Object Remover Tool',
  twitterDescription: 'Remove unwanted objects with AI image editing.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Image Object Remover</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <ImageObjectRemoverModule />
    </div>
  </div>
</template>
