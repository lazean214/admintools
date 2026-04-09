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
      © {{ currentYear }} <a href="https://naicatech.com" class="underline">naicatech.com</a> | Developed by <a href="https://neilsalazar.info" class="underline">Neil Salazar</a>
    </footer>
  </div>
</template>
