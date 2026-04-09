<script setup lang="ts">
const currentYear = new Date().getFullYear()
</script>

<template>
  <NuxtRouteAnnouncer />
  <div class="min-h-screen flex flex-col">
    <div class="flex-1">
      <NuxtPage />
    </div>

    <footer class="px-4 pb-4 text-center text-xs text-slate-600">
      © {{ currentYear }} naicatech.com
    </footer>
  </div>
</template>
