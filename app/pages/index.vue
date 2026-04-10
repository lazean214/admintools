<script setup lang="ts">
const auth = useAuth()
const requestUrl = useRequestURL()
const seoImageUrl = `${requestUrl.origin}/admin-toolkit-cover.png`

useSeoMeta({
  title: 'Home',
  description: 'Access real estate admin tools for Form I, PDF editing, image utilities, e-signatures, and watermark workflows from one dashboard.',
  ogTitle: 'Real Estate Web Tools Dashboard',
  ogDescription: 'Open Form I, PDF template filler, PDF image extractor, image resize, e-signature, and watermark tools in one place.',
  ogImage: seoImageUrl,
  ogImageAlt: 'Real Estate Admin Toolkit cover image',
  twitterTitle: 'Real Estate Web Tools Dashboard',
  twitterDescription: 'Document and image utility suite for real estate workflows.',
  twitterImage: seoImageUrl,
  twitterImageAlt: 'Real Estate Admin Toolkit cover image'
})

onMounted(() => {
  auth.hydrate()
})

const baseModules = [
  {
    title: 'Real Estate Guide',
    description: 'Write and manage admin guide articles with markdown content and image uploads.',
    path: '/real-estate-guide',
    action: 'Open Guide',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
  },
  {
    title: 'Form I / Agent To Agent',
    description: 'Fill agent-to-agent form fields and generate a PDF from the provided template.',
    path: '/agent-to-agent-form',
    action: 'Open Form I',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
  },
  {
    title: 'Listing NOC',
    description: 'Easy to use Listing NOC form and generate a PFD from the provided template.',
    path: '/listing-noc-form',
    action: 'Open Listing NOC Form',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
  },
  {
    title: 'PDF Image Extractor',
    description: 'Extract embedded images from PDF files with previews, selection, and bulk ZIP downloads.',
    path: '/pdf-image-extractor',
    action: 'Open Extractor',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
  },
  {
    title: 'Image Resize',
    description: 'Resize one or many images while keeping aspect ratio and previewing files first.',
    path: '/image-resize',
    action: 'Open Resizer',
    icon: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4'
  },
  {
    title: 'E-Signature',
    description: 'Draw or upload signatures and export quickly for forms and documents.',
    path: '/e-signature',
    action: 'Open Signature Tool',
    icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'
  },
  {
    title: 'Watermark',
    description: 'Apply text or image watermarks with custom position, opacity, and scale.',
    path: '/watermark',
    action: 'Open Watermark Tool',
    icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01'
  },
  {
    title: 'Watermark Remover',
    description: 'Select an area and soften it to remove distracting watermark overlays.',
    path: '/watermark-remover',
    action: 'Open Remover',
    icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z'
  },
  {
    title: 'Contact & Requests',
    description: 'Report bugs and send feature requests quickly over WhatsApp.',
    path: '/contact',
    action: 'Open Contact',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
  }
]

const modules = computed(() => {
  if (auth.isAuthenticated.value) {
    return [
      {
        title: 'Profile Settings',
        description: 'Save company profile defaults (logo, stamp, and office details) for Form I in local storage.',
        path: '/profile-settings',
        action: 'Open Profile Settings',
        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'
      },
      ...baseModules
    ]
  }

  return [
    {
      title: 'Account Access',
      description: 'Register or login to enable private profile settings and saved defaults.',
      path: '/register',
      action: 'Create Account',
      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
    },
    ...baseModules
  ]
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8 mb-4">
    <div class="app-container">
      <AppTopNav />

      <header class="module-surface mb-6 text-center">
        <p class="mb-3 inline-block rounded-full bg-teal-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-teal-700">
          Real Estate Admin Tools Suite
        </p>
        <h1 class="mb-3 text-2xl font-bold text-slate-900 sm:text-3xl md:text-5xl">
          Admin Toolkit
        </h1>
        <p class="mx-auto max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Streamline your real estate document management — fill forms, extract images,
          resize photos, create e-signatures, and apply watermarks from one dashboard.
        </p>
      </header>

      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <NuxtLink
          v-for="item in modules"
          :key="item.path"
          :to="item.path"
          class="group glass-panel flex flex-row items-center gap-4 rounded-2xl border border-slate-200/60 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg sm:flex-col sm:items-start sm:p-5"
        >
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-100 sm:h-11 sm:w-11">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-bold text-slate-900 sm:text-base">{{ item.title }}</h2>
            <p class="mt-0.5 line-clamp-2 text-xs text-slate-500 sm:mt-1 sm:text-sm">{{ item.description }}</p>
          </div>
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
