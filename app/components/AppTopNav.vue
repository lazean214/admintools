<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isMenuOpen = ref(false)

onMounted(() => {
  auth.hydrate()
})

const links = [
  { label: 'Home', to: '/' },
  { label: 'Form I', to: '/agent-to-agent-form' },
  { label: 'Listing NOC', to: '/pdf-template-filler' },
  { label: 'PDF Extractor', to: '/pdf-image-extractor' },
  { label: 'Image Resize', to: '/image-resize' },
  { label: 'E-Signature', to: '/e-signature' },
  { label: 'Watermark', to: '/watermark' },
  { label: 'Remover', to: '/watermark-remover' },
  { label: 'Contact', to: '/contact' }
]

function isActive(path: string) {
  return route.path === path
}

async function logout() {
  auth.logout()
  isMenuOpen.value = false
  await router.push('/')
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

watch(() => route.path, () => {
  isMenuOpen.value = false
})
</script>

<template>
  <nav class="top-nav mb-5 p-3 md:p-4">
    <div class="flex items-center justify-between gap-2 md:hidden">
      <NuxtLink to="/" class="text-sm font-bold tracking-wide text-slate-800">DXB Admin Tools</NuxtLink>
      <button type="button" class="nav-chip" @click="toggleMenu">
        {{ isMenuOpen ? 'Close' : 'Menu' }}
      </button>
    </div>

    <div :class="isMenuOpen ? 'mt-3 grid gap-3 md:mt-0 md:grid-cols-[1fr_auto]' : 'hidden md:mt-0 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-2'">
      <div class="grid gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="nav-chip text-center"
          :class="isActive(link.to) ? 'nav-chip-active' : ''"
        >
          {{ link.label }}
        </NuxtLink>
      </div>

      <div class="grid gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:items-center md:justify-end">
        <NuxtLink
          v-if="auth.isAuthenticated.value"
          to="/profile-settings"
          class="nav-chip text-center"
          :class="isActive('/profile-settings') ? 'nav-chip-active' : ''"
        >
          Profile
        </NuxtLink>

        <template v-if="!auth.isAuthenticated.value">
          <NuxtLink to="/login" class="nav-chip text-center" :class="isActive('/login') ? 'nav-chip-active' : ''">Login</NuxtLink>
          <NuxtLink to="/register" class="nav-chip text-center" :class="isActive('/register') ? 'nav-chip-active' : ''">Register</NuxtLink>
        </template>

        <button v-else type="button" class="nav-chip text-center" @click="logout">Logout</button>
      </div>
    </div>
  </nav>
</template>
