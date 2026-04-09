<script setup lang="ts">
const route = useRoute()

const links = [
  { label: 'Home', to: '/' },
  { label: 'Form I', to: '/agent-to-agent-form' },
  { label: 'PDF Extractor', to: '/pdf-image-extractor' },
  { label: 'Image Resize', to: '/image-resize' },
  { label: 'E-Signature', to: '/e-signature' },
  { label: 'Watermark', to: '/watermark' },
  { label: 'Remover', to: '/watermark-remover' }
]

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <nav class="top-nav mb-5 p-3 md:p-4">
    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="nav-chip"
        :class="isActive(link.to) ? 'nav-chip-active' : ''"
      >
        {{ link.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
