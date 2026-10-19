<script setup lang="ts">
useSeoMeta({
  title:'PDF Editor',
  description:'Edit supported PDF text, add images and signatures, annotate and organize pages locally in your browser.'
})
</script>
<template>
  <div class="app-shell md:px-8 md:py-8">
    <div class="app-container space-y-5">
      <AppTopNav/>
      <PdfEditorModule/>
    </div>
  </div>
</template>
