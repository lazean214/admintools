<script setup lang="ts">
const auth = useAuth()

useSeoMeta({
  title: 'Home',
  description: 'Access real estate admin tools for Form I, PDF editing, image utilities, e-signatures, and watermark workflows from one dashboard.',
  ogTitle: 'Real Estate Web Tools Dashboard',
  ogDescription: 'Open Form I, PDF template filler, PDF image extractor, image resize, e-signature, and watermark tools in one place.',
  twitterTitle: 'Real Estate Web Tools Dashboard',
  twitterDescription: 'Document and image utility suite for real estate workflows.'
})

onMounted(() => {
  auth.hydrate()
})

const baseModules = [
  {
    title: 'Real Estate Guide',
    description: 'Write and manage admin guide articles with markdown content and image uploads.',
    path: '/real-estate-guide',
    action: 'Open Guide'
  },
  {
    title: 'Form I / Agent To Agent',
    description: 'Fill agent-to-agent form fields and generate a PDF from the provided template.',
    path: '/agent-to-agent-form',
    action: 'Open Form I'
  },
  {
    title: 'Listing NOC',
    description: 'Easy to use Listing NOC form and generate a PFD from the provided template.',
    path: '/listing-noc-form',
    action: 'Open Listing NOC Form'
  },
  {
    title: 'PDF Image Extractor',
    description: 'Extract embedded images from PDF files with previews, selection, and bulk ZIP downloads.',
    path: '/pdf-image-extractor',
    action: 'Open Extractor'
  },
  {
    title: 'Image Resize',
    description: 'Resize one or many images while keeping aspect ratio and previewing files first.',
    path: '/image-resize',
    action: 'Open Resizer'
  },
  {
    title: 'E-Signature',
    description: 'Draw or upload signatures and export quickly for forms and documents.',
    path: '/e-signature',
    action: 'Open Signature Tool'
  },
  {
    title: 'Watermark',
    description: 'Apply text or image watermarks with custom position, opacity, and scale.',
    path: '/watermark',
    action: 'Open Watermark Tool'
  },
  {
    title: 'Watermark Remover',
    description: 'Select an area and soften it to remove distracting watermark overlays.',
    path: '/watermark-remover',
    action: 'Open Remover'
  },
  {
    title: 'Contact & Requests',
    description: 'Report bugs and send feature requests quickly over WhatsApp.',
    path: '/contact',
    action: 'Open Contact'
  }
]

const modules = computed(() => {
  if (auth.isAuthenticated.value) {
    return [
      {
        title: 'Profile Settings',
        description: 'Save company profile defaults (logo, stamp, and office details) for Form I in local storage.',
        path: '/profile-settings',
        action: 'Open Profile Settings'
      },
      ...baseModules
    ]
  }

  return [
    {
      title: 'Account Access',
      description: 'Register or login to enable private profile settings and saved defaults.',
      path: '/register',
      action: 'Create Account'
    },
    ...baseModules
  ]
})
</script>

<template>
  <div class="app-shell md:px-8 md:py-8 mb-4">
    <div class="app-container">
      <AppTopNav />

      <header class="module-surface mb-8">
        <p class="module-title mb-2 text-sm uppercase tracking-[0.25em] text-teal-700">Real Estate Admin Tools Suite</p>
        <h1 class="mb-3 text-3xl font-bold text-slate-900 md:text-5xl">Welcome to Your Real Estate Utility Workspace</h1>
        <p class="max-w-3xl text-slate-700">
          This toolkit is designed to streamline your real estate document management and image processing tasks. Whether you need to fill out forms, extract images from PDFs, resize photos, create e-signatures, or apply watermarks, everything is organized here for easy access. Create an account to save your profile settings and defaults for a more personalized experience across the suite.
        </p>
      </header>

      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
        <article
          v-for="item in modules"
          :key="item.path"
          class="glass-panel p-3 rounded-2xl border border-slate-200/80 p-5 shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-xl"
        >
          <h2 class="module-title text-xl font-bold text-slate-900">{{ item.title }}</h2>
          <p class="mt-2 text-sm text-slate-700">{{ item.description }}</p>
          <NuxtLink
            :to="item.path"
            class="btn-primary mt-5 inline-flex"
          >
            {{ item.action }}
          </NuxtLink>
        </article>
      </section>
    </div>
  </div>
</template>
