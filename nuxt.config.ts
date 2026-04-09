// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/tailwind.css'],
  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      },
      titleTemplate: '%s | Real Estate Web Tools',
      meta: [
        {
          name: 'description',
          content: 'Real estate web tools for Form I, PDF processing, image resizing, e-signatures, watermarking, and profile-based defaults.'
        },
        {
          name: 'robots',
          content: 'index, follow'
        },
        {
          property: 'og:site_name',
          content: 'Real Estate Web Tools'
        },
        {
          property: 'og:type',
          content: 'website'
        },
        {
          name: 'twitter:card',
          content: 'summary_large_image'
        }
      ]
    }
  }
})
