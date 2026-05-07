<script setup lang="ts">
useSeoMeta({
  title: 'Contact',
  description: 'Send bug reports and feature requests for the Real Estate Web Tools suite.',
  ogTitle: 'Contact Real Estate Web Tools',
  ogDescription: 'Reach out with support requests, bug reports, and feature ideas.',
  twitterTitle: 'Contact Real Estate Web Tools',
  twitterDescription: 'Support and feature requests for document and image tools.'
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-6">
      <AppTopNav />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="module-title text-3xl font-bold text-slate-900">Contact</h1>
        <NuxtLink to="/" class="btn-secondary">Back Home</NuxtLink>
      </div>
      <ContactModule />
      <div class="module-surface my-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-600">Support this project:</p>
        <a
          href="https://paypal.me/ncsinfo"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#005ea6] bg-[#0070ba] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-200/60 transition hover:-translate-y-0.5 hover:border-[#004f8c] hover:bg-[#005ea6] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070ba]/40 sm:w-auto"
          aria-label="Pay with PayPal Me"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" class="h-4 w-4 fill-current">
            <path d="M7.5 3.75h6.77c2.84 0 4.63 1.52 4.25 4.02-.34 2.21-2.2 3.73-4.7 3.73h-2.76c-.29 0-.54.2-.6.48l-.74 4.77a.62.62 0 0 1-.61.53H6.54l1.29-8.29c.05-.28.3-.49.59-.49h3.2c1.45 0 2.45-.75 2.64-1.92.2-1.33-.64-2.08-2.11-2.08H8.03a.62.62 0 0 0-.61.52L6.11 13.5H3.5l1.47-9.25c.15-.89.9-1.5 2.03-1.5Z" />
          </svg>
          Donate with PayPal
        </a>
      </div>
    </div>
  </div>
</template>
