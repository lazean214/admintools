// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  sourcemap: { client: false, server: false },
  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
      }
    },
    '/api/**': { headers: { 'Cache-Control': 'no-store' } },
    '/profile-settings': { headers: { 'Cache-Control': 'no-store' } }
  },
  modules: ['@nuxtjs/tailwindcss'],
  tailwindcss: { viewer: false, exposeConfig: false },
  // The app uses flat/scoped CSS. Nuxt 4.6 no longer resolves this legacy alias.
  postcss: { plugins: { 'tailwindcss/nesting': false } },
  css: ['~/assets/css/tailwind.css'],
  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      },
      titleTemplate: '%s | Real Estate Web Tools',
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon_io/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon_io/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon_io/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicon_io/apple-touch-icon.png' },
        { rel: 'manifest', href: '/favicon_io/site.webmanifest' },
        { rel: 'preload', as: 'image', href: '/neil-salazar-logo.png' }
      ],
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
