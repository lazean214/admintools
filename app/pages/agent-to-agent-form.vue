<script setup lang="ts">
useSeoMeta({
  title: 'Form I / Agent To Agent',
  description: 'Fill Form I agent-to-agent fields and generate a completed PDF quickly and accurately.',
  ogTitle: 'Form I Agent To Agent Tool',
  ogDescription: 'Streamline Form I preparation with guided fields and PDF generation.',
  twitterTitle: 'Form I Agent To Agent Tool',
  twitterDescription: 'Fill and export Form I agent-to-agent documents as PDF.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Form I / Agent To Agent</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <AgentToAgentFormModule />
    </div>
  </div>
</template>
