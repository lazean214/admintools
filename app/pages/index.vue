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
    description: 'Easy to use Listing NOC form and generate a PDF from the provided template.',
    path: '/listing-noc-form',
    action: 'Open Listing NOC Form',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
  },
  {
    title: 'EJARI Form',
    description: 'Complete EJARI details and export using the EJARI template PDF.',
    path: '/ejari-form',
    action: 'Open EJARI Form',
    icon: 'M7 3h8a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm2 4h6M9 11h6m-6 4h4'
  },
  {
    title: 'PDF Image Extractor',
    description: 'Extract embedded images from PDF files with previews, selection, and bulk ZIP downloads.',
    path: '/pdf-image-extractor',
    action: 'Open Extractor',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
  },
  {
    title: 'PDF Editor',
    description: 'Edit text, add images and signatures, annotate and organize PDF pages.',
    path: '/pdf-editor',
    action: 'Open PDF Editor',
    icon: 'M12 20h9M16.5 3.5a2.12 2.12 0 013 3L9 17l-4 1 1-4L16.5 3.5z'
  },
  {
    title: 'Document Field Extractor',
    description: 'Read passports, Emirates IDs, NOCs and property documents locally, then review the suggested details.',
    path: '/document-field-extractor',
    action: 'Read Document',
    icon: 'M9 12h6m-6 4h6M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V9l-6-6H9zm4 0v6h6'
  },
  {
    title: 'PDF Compression',
    description: 'Reduce PDF file size locally, preserve selectable text, and compare before and after sizes.',
    path: '/pdf-compression',
    action: 'Open PDF Compressor',
    icon: 'M9 12h6m-6 4h6M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V9l-6-6H9zm4 0v6h6'
  },
  {
    title: 'Image Converter',
    description: 'Convert HEIC, RAW and other photos to JPG, PNG, WebP, TIFF, BMP or ICO locally.',
    path: '/image-converter',
    action: 'Open Converter',
    icon: 'M4 7h16m0 0-4-4m4 4-4 4M20 17H4m0 0 4-4m-4 4 4 4'
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
    title: 'Image Object Remover',
    description: 'Remove unwanted objects and distractions with local AI image editing.',
    path: '/image-object-remover',
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

const query = ref('')
const activeCategory = ref('All tools')
const categories = ['All tools', 'Real estate forms', 'PDF tools', 'Image & signature']
const groups = [
  { title: 'Real estate forms', description: 'Prepare the paperwork for your next transaction.', paths: ['/agent-to-agent-form', '/listing-noc-form', '/ejari-form'] },
  { title: 'PDF tools', description: 'Edit, compress, and get more from your documents.', paths: ['/pdf-editor', '/pdf-compression', '/pdf-image-extractor', '/document-field-extractor'] },
  { title: 'Image & signature', description: 'Get your photos and signatures ready to use.', paths: ['/image-converter', '/image-resize', '/e-signature', '/watermark', '/image-object-remover'] }
]
const visibleGroups = computed(() => groups
  .filter(group => activeCategory.value === 'All tools' || activeCategory.value === group.title)
  .map(group => ({ ...group, items: group.paths.map(path => baseModules.find(item => item.path === path)!).filter(item => `${item.title} ${item.description}`.toLowerCase().includes(query.value.trim().toLowerCase())) }))
  .filter(group => group.items.length))
const resultCount = computed(() => visibleGroups.value.reduce((count, group) => count + group.items.length, 0))
function resetFilters() {
  query.value = ''
  activeCategory.value = 'All tools'
}
</script>

<template>
  <div class="home-page">
    <div class="home-container">
      <a href="#tools" class="skip-link">Skip to tools</a>
      <AppTopNav />
      <main>
        <header class="home-intro">
          <div>
            <h1>Your everyday<br><span>admin toolkit.</span></h1>
            <p>Real estate forms, PDF editing, and image tools.<br class="hidden sm:block"> Find what you need and get straight to work.</p>
          </div>
          <NuxtLink to="/real-estate-guide" class="guide-link">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" :d="baseModules[0]!.icon" /></svg>
            <span><strong>Real Estate Guide</strong><span>Browse articles and guidance</span></span>
            <span aria-hidden="true">↗</span>
          </NuxtLink>
        </header>

        <section id="tools" class="tool-directory" aria-labelledby="tools-heading" tabindex="-1">
          <div class="directory-heading">
            <h2 id="tools-heading">Find your tool</h2>
            <label class="tool-search">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path stroke-linecap="round" d="m16 16 4 4"/></svg>
              <span class="sr-only">Search tools</span>
              <input v-model="query" type="search" placeholder="Search tools…">
            </label>
          </div>
          <div class="category-filters" role="group" aria-label="Filter tools by category">
            <button v-for="category in categories" :key="category" type="button" :aria-pressed="activeCategory === category" @click="activeCategory = category">{{ category }}</button>
          </div>
          <p class="sr-only" role="status">{{ resultCount }} tools found</p>
          <div v-for="group in visibleGroups" :key="group.title" class="tool-group">
            <div class="group-heading"><h3>{{ group.title }}</h3><p>{{ group.description }}</p></div>
            <div class="tool-list">
              <NuxtLink v-for="item in group.items" :key="item.path" :to="item.path" class="tool-row">
                <svg class="tool-icon" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" /></svg>
                <span class="tool-copy"><strong>{{ item.title }}</strong><span>{{ item.description }}</span></span>
                <svg class="tool-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-5-5 5 5-5 5"/></svg>
              </NuxtLink>
            </div>
          </div>
          <div v-if="!visibleGroups.length" class="empty-results">
            <h3>No tools found</h3><p>Try a different search or browse all tools.</p>
            <button type="button" @click="resetFilters">Clear search and filters</button>
          </div>
        </section>
        <aside class="account-note">
          <div><h2>{{ auth.isAuthenticated.value ? 'Make it your workspace' : 'Less repetition, more getting things done.' }}</h2><p>Save company details, your logo, and stamp as defaults for Form I.</p></div>
          <NuxtLink :to="auth.isAuthenticated.value ? '/profile-settings' : '/register'">{{ auth.isAuthenticated.value ? 'Profile settings' : 'Create an account' }} <span aria-hidden="true">→</span></NuxtLink>
        </aside>
      </main>
      <footer class="home-footer">
        <NuxtLink to="/contact">Contact & requests</NuxtLink>
        <a href="https://paypal.me/ncsinfo" target="_blank" rel="noopener noreferrer">Support this toolkit <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.home-page { background: #f8faf9; min-height: 100vh; padding: 24px; }
.home-container { max-width: 1120px; margin-inline: auto; }
.home-page :deep(.top-nav) { background: #fff; border: 1px solid #e2e8e5; box-shadow: none; backdrop-filter: none; border-radius: 12px; }
.home-page :deep(.nav-chip) { background: transparent; border-color: transparent; border-radius: 8px; }
.home-page :deep(.nav-chip-active) { background: #0f766e; color: white; box-shadow: none; }
.home-page :deep(a:focus-visible), .home-page button:focus-visible { outline: 3px solid #0f766e; outline-offset: 4px; }
.home-page ::selection { background: #ccfbf1; color: #134e4a; }
.skip-link { position: absolute; left: 24px; top: -100px; z-index: 60; background: white; padding: 12px; }
.skip-link:focus { top: 12px; }
.home-intro { display: flex; justify-content: space-between; align-items: flex-end; gap: 40px; padding: 58px 0 48px; }
h1 { font-size: clamp(2.5rem, 5vw, 3.75rem); line-height: 1.08; font-weight: 500; letter-spacing: -.035em; }
h1 span { color: #0f766e; }
.home-intro p { color: #52635f; font-size: 16px; line-height: 1.8; margin-top: 20px; }
.guide-link { display: flex; align-items: center; gap: 16px; padding: 18px 0; border-bottom: 1px solid #cddbd6; color: #0f766e; }
.guide-link > svg { width: 28px; height: 28px; flex-shrink: 0; }
.guide-link strong { display: block; color: #172f29; font-size: 14px; }
.guide-link span span { display: block; margin-top: 5px; color: #52635f; font-size: 12px; }
.guide-link > span:last-child { margin-left: 16px; }
.tool-directory { background: white; border: 1px solid #e0e7e3; border-radius: 16px; padding: 32px; scroll-margin-top: 100px; }
.directory-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.directory-heading h2 { font-size: 24px; font-weight: 500; letter-spacing: -.025em; }
.tool-search { display: flex; gap: 10px; align-items: center; border: 1px solid #bdcbc5; border-radius: 8px; padding: 11px 14px; width: 300px; }
.tool-search:focus-within { outline: 2px solid #0f766e; outline-offset: 2px; }
.tool-search svg { width: 18px; height: 18px; color: #52635f; flex-shrink: 0; }
.tool-search input { width: 100%; min-width: 0; outline: none; font-size: 14px; background: transparent; caret-color: #0f766e; }
.tool-search input::placeholder { color: #65766f; }
.category-filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 8px; }
.category-filters button { padding: 9px 14px; font-size: 13px; font-weight: 600; border-radius: 6px; color: #52635f; transition: background-color .15s; }
.category-filters button:hover { background: #f0f5f2; }
.category-filters button[aria-pressed='true'] { background: #0f766e; color: white; }
.tool-group { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 32px; padding-top: 30px; margin-top: 24px; border-top: 1px solid #e5ebe7; }
.group-heading h3 { font-size: 17px; font-weight: 600; }
.group-heading p { color: #52635f; font-size: 13px; line-height: 1.7; margin-top: 8px; max-width: 26ch; }
.tool-row { display: flex; align-items: center; gap: 16px; padding: 16px 12px; border-radius: 8px; transition: background-color .15s; }
.tool-row + .tool-row { border-top: 1px solid #eef2ef; }
.tool-row:hover { background: #f1f8f5; }
.tool-icon { width: 24px; height: 24px; flex-shrink: 0; color: #0f766e; }
.tool-copy { flex: 1; min-width: 0; }
.tool-copy strong { display: block; font-size: 14px; font-weight: 700; color: #172f29; }
.tool-copy > span { display: block; margin-top: 4px; font-size: 13px; line-height: 1.6; color: #52635f; }
.tool-arrow { width: 18px; height: 18px; flex-shrink: 0; color: #52635f; }
.account-note { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 32px 0; }
.account-note h2 { font-size: 17px; font-weight: 500; }
.account-note p { font-size: 13px; color: #52635f; margin-top: 6px; line-height: 1.6; }
.account-note a { flex-shrink: 0; padding: 12px 16px; background: white; border: 1px solid #bdcbc5; border-radius: 8px; font-size: 13px; font-weight: 700; color: #0f655e; }
.account-note a:hover { background: #eaf3ee; }
.account-note a span { margin-left: 12px; }
.home-footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #e0e7e3; padding: 24px 0; font-size: 12px; color: #52635f; }
.home-footer a:hover { color: #0f766e; text-decoration: underline; text-underline-offset: 4px; }
.empty-results { text-align: center; padding: 56px 16px; }
.empty-results h3 { font-size: 20px; }
.empty-results p { margin-top: 8px; font-size: 14px; color: #52635f; }
.empty-results button { margin-top: 20px; color: #0f766e; text-decoration: underline; text-underline-offset: 4px; font-size: 14px; }
@media (max-width: 767px) {
  .home-page { padding: 16px; }
  .home-intro { align-items: stretch; flex-direction: column; gap: 20px; padding: 32px 4px; }
  .guide-link { align-self: flex-start; padding: 12px 0; }
  .directory-heading { align-items: stretch; flex-direction: column; gap: 18px; }
  .tool-search { width: 100%; }
  .tool-directory { padding: 20px 16px; }
  .category-filters { gap: 4px; margin-top: 20px; }
  .category-filters button { padding: 10px; font-size: 12px; min-height: 44px; }
  .tool-group { grid-template-columns: minmax(0, 1fr); gap: 12px; padding-top: 24px; }
  .group-heading p { max-width: none; margin-top: 4px; }
  .tool-row { padding-inline: 4px; gap: 12px; }
  .account-note { align-items: flex-start; flex-direction: column; gap: 16px; }
}
</style>
