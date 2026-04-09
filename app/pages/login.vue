<script setup lang="ts">
definePageMeta({
  middleware: ['guest']
})

useSeoMeta({
  title: 'Login',
  description: 'Sign in to access your saved profile defaults and private account features.',
  ogTitle: 'Login | Real Estate Web Tools',
  ogDescription: 'Access your account to manage saved settings and faster form workflows.',
  twitterTitle: 'Login | Real Estate Web Tools',
  twitterDescription: 'Sign in to your account and continue your workflow.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Login</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <LoginModule />
    </div>
  </div>
</template>
