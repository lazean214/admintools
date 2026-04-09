<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">Contact</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <ContactModule />
    </div>
  </div>
</template>
