<script setup lang="ts">
definePageMeta({
  middleware: ['guest']
})

useSeoMeta({
  title: 'Create Account',
  description: 'Register to unlock profile settings and save default information for Form I workflows.',
  ogTitle: 'Create Account | Real Estate Web Tools',
  ogDescription: 'Create an account for private settings and faster real estate form preparation.',
  twitterTitle: 'Create Account | Real Estate Web Tools',
  twitterDescription: 'Register and save your profile defaults for repeated workflows.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Create Account</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <RegisterModule />
    </div>
  </div>
</template>
