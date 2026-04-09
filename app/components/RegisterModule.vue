<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const status = ref('Create a new account to access profile settings.')
const loading = ref(false)

const form = reactive({
  name: '',
  email: '',
  password: '',
  confirmPassword: ''
})

async function registerUser() {
  status.value = 'Creating account...'

  if (!form.name.trim() || !form.email.trim() || !form.password) {
    status.value = 'Please fill all required fields.'
    return
  }

  if (form.password.length < 6) {
    status.value = 'Password must be at least 6 characters.'
    return
  }

  if (form.password !== form.confirmPassword) {
    status.value = 'Password confirmation does not match.'
    return
  }

  loading.value = true
  try {
    await auth.register({
      name: form.name,
      email: form.email,
      password: form.password
    })

    status.value = 'Account created. Redirecting...'
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/profile-settings'
    await router.push(target)
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Registration failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Register</h2>
    <p class="mt-2 text-sm text-slate-600">
      Create an account to unlock private profile settings.
    </p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-4 grid gap-3">
      <label class="text-sm font-semibold">
        Name
        <input v-model="form.name" type="text" class="field-control mt-1" placeholder="Your name" >
      </label>

      <label class="text-sm font-semibold">
        Email
        <input v-model="form.email" type="email" class="field-control mt-1" placeholder="you@email.com" >
      </label>

      <label class="text-sm font-semibold">
        Password
        <input v-model="form.password" type="password" class="field-control mt-1" placeholder="Minimum 6 characters" >
      </label>

      <label class="text-sm font-semibold">
        Confirm Password
        <input v-model="form.confirmPassword" type="password" class="field-control mt-1" placeholder="Confirm password" >
      </label>
    </div>

    <div class="mt-5 flex flex-wrap items-center gap-3">
      <button class="btn-primary disabled:opacity-60" :disabled="loading" @click="registerUser">
        {{ loading ? 'Registering...' : 'Register' }}
      </button>
      <NuxtLink to="/login" class="btn-secondary">Have an account? Login</NuxtLink>
    </div>
  </section>
</template>
