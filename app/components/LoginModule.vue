<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const status = ref('Login to access your private profile settings.')
const loading = ref(false)

const form = reactive({
  email: '',
  password: ''
})

async function loginUser() {
  status.value = 'Signing in...'

  if (!form.email.trim() || !form.password) {
    status.value = 'Please enter your email and password.'
    return
  }

  loading.value = true
  try {
    await auth.login({ email: form.email, password: form.password })
    status.value = 'Signed in. Redirecting...'
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/profile-settings'
    await router.push(target)
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Login failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Login</h2>
    <p class="mt-2 text-sm text-slate-600">
      Sign in to use registered-user features.
    </p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-4 grid gap-3">
      <label class="text-sm font-semibold">
        Email
        <input v-model="form.email" type="email" class="field-control mt-1" placeholder="you@email.com" >
      </label>

      <label class="text-sm font-semibold">
        Password
        <input v-model="form.password" type="password" class="field-control mt-1" placeholder="Password" >
      </label>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <button class="btn-primary disabled:opacity-60" :disabled="loading" @click="loginUser">
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>
      <NuxtLink to="/register" class="btn-secondary">Create Account</NuxtLink>
    </div>
  </section>
</template>
