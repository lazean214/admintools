<script setup lang="ts">
definePageMeta({
  middleware: ['auth']
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface flex flex-wrap items-center justify-between gap-3 my-4">
        <h1 class="module-title text-3xl font-bold text-slate-900">Profile Settings</h1>
        <NuxtLink to="/agent-to-agent-form" class="btn-secondary">Back To Form I</NuxtLink>
      </div>
      <ProfileSettingsModule />

      <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p>
          Profile information is stored locally in your browser on this device only.
          It is not uploaded to a server. If you clear browser storage, reset site data,
          or use a different browser/device, these saved settings will not be available.
        </p>
      </div>
    </div>
  </div>
</template>
