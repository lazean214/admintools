<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const isMenuOpen = ref(false)
const isToolsOpen = ref(false)

onMounted(() => {
  auth.hydrate()
})

const links = [
  { label: 'Guide', to: '/real-estate-guide' }
]

const toolLinks = [
  { label: 'Form I', to: '/agent-to-agent-form' },
  { label: 'NOC', to: '/listing-noc-form' },
  { label: 'PDF Extract', to: '/pdf-image-extractor' },
  { label: 'Resize', to: '/image-resize' },
  { label: 'E-Sign', to: '/e-signature' },
  { label: 'Watermark', to: '/watermark' },
  { label: 'Watermark Remover', to: '/watermark-remover' }
]

function isActive(path: string) {
  return route.path === path
}

async function logout() {
  await auth.logout()
  isMenuOpen.value = false
  await router.push('/')
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function closeTools() {
  isToolsOpen.value = false
}

function onClickOutside(e: Event) {
  const target = e.target as HTMLElement
  if (isToolsOpen.value && !target.closest('.tools-dropdown')) {
    isToolsOpen.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  document.addEventListener('click', onClickOutside)

  // Prefetch guide articles in background so /real-estate-guide loads instantly
  const hasPrefetched = useState<boolean>('guide-prefetched-once', () => false)
  if (!hasPrefetched.value) {
    const guideEndpoint = ['/api', 'guide-articles'].join('/')
    $fetch<unknown[]>(guideEndpoint)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          useState('guide-prefetched-articles', () => []).value = data
          hasPrefetched.value = true
        }
      })
      .catch(() => {})
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
})

watch(() => route.path, () => {
  isMenuOpen.value = false
  isToolsOpen.value = false
})
</script>

<template>
  <nav class="top-nav mb-5 px-3 py-2.5">
    <!-- Top bar: brand + hamburger (always visible) -->
    <div class="flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center">
        <img src="/neil-salazar-logo.png" alt="Logo" class="h-8 w-auto">
      </NuxtLink>

      <!-- Desktop nav -->
      <div class="hidden items-center gap-1.5 md:flex">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="nav-chip"
          :class="isActive(link.to) ? 'nav-chip-active' : ''"
        >
          {{ link.label }}
        </NuxtLink>

        <!-- Tools dropdown -->
        <div class="tools-dropdown relative">
          <button
            type="button"
            class="nav-chip inline-flex items-center gap-1"
            :class="toolLinks.some(t => isActive(t.to)) ? 'nav-chip-active' : ''"
            @click="isToolsOpen = !isToolsOpen"
          >
            Tools
            <svg class="h-3.5 w-3.5 transition-transform" :class="isToolsOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="scale-95 opacity-0"
            enter-to-class="scale-100 opacity-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="scale-100 opacity-100"
            leave-to-class="scale-95 opacity-0"
          >
            <div v-if="isToolsOpen" class="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-xl">
              <NuxtLink
                v-for="tool in toolLinks"
                :key="tool.to"
                :to="tool.to"
                class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-teal-50 hover:text-teal-800"
                :class="isActive(tool.to) ? 'bg-teal-50 text-teal-800' : ''"
                @click="closeTools"
              >
                {{ tool.label }}
              </NuxtLink>
            </div>
          </Transition>
        </div>

        <span class="mx-0.5 h-5 w-px bg-slate-200" />
        <template v-if="auth.isAuthenticated.value">
          <NuxtLink to="/profile-settings" class="nav-chip" :class="isActive('/profile-settings') ? 'nav-chip-active' : ''">Profile</NuxtLink>
          <button type="button" class="nav-chip" @click="logout">Logout</button>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="nav-chip" :class="isActive('/login') ? 'nav-chip-active' : ''">Login</NuxtLink>
          <NuxtLink to="/register" class="nav-chip" :class="isActive('/register') ? 'nav-chip-active' : ''">Register</NuxtLink>
        </template>
      </div>

      <button type="button" class="nav-chip md:hidden" @click="toggleMenu">
        {{ isMenuOpen ? 'Close' : 'Menu' }}
      </button>
    </div>

    <!-- Mobile: expandable grid -->
    <div v-if="isMenuOpen" class="mt-3 space-y-3 md:hidden">
      <div class="grid grid-cols-3 gap-1.5">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="nav-chip text-center"
          :class="isActive(link.to) ? 'nav-chip-active' : ''"
        >
          {{ link.label }}
        </NuxtLink>
        <template v-if="auth.isAuthenticated.value">
          <NuxtLink to="/profile-settings" class="nav-chip text-center" :class="isActive('/profile-settings') ? 'nav-chip-active' : ''">Profile</NuxtLink>
          <button type="button" class="nav-chip w-full text-center" @click="logout">Logout</button>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="nav-chip text-center" :class="isActive('/login') ? 'nav-chip-active' : ''">Login</NuxtLink>
          <NuxtLink to="/register" class="nav-chip text-center" :class="isActive('/register') ? 'nav-chip-active' : ''">Register</NuxtLink>
        </template>
      </div>
      <div>
        <p class="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Tools</p>
        <div class="grid grid-cols-3 gap-1.5">
          <NuxtLink
            v-for="tool in toolLinks"
            :key="tool.to"
            :to="tool.to"
            class="nav-chip text-center text-xs"
            :class="isActive(tool.to) ? 'nav-chip-active' : ''"
          >
            {{ tool.label }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </nav>
</template>
