export type ProfileSettings = {
  establishmentName: string
  officeAddress: string
  officePhone: string
  officeEmail: string
  orn: string
  dedLicense: string
  poBox: string
  logoDataUrl: string | null
  stampDataUrl: string | null
}

export type UserRole = 'admin' | 'editor' | 'viewer'

type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  profile: ProfileSettings
}

type RegisterPayload = {
  name: string
  email: string
  password: string
}

type LoginPayload = {
  email: string
  password: string
}

let hydratePromise: Promise<void> | null = null

function emptyProfile(): ProfileSettings {
  return {
    establishmentName: '',
    officeAddress: '',
    officePhone: '',
    officeEmail: '',
    orn: '',
    dedLicense: '',
    poBox: '',
    logoDataUrl: null,
    stampDataUrl: null
  }
}

export function useAuth() {
  const currentUser = useState<AuthUser | null>('auth-current-user', () => null)
  const hydrated = useState<boolean>('auth-hydrated', () => false)

  const isAuthenticated = computed(() => currentUser.value !== null)

  async function hydrate() {
    if (hydrated.value) {
      return
    }

    if (hydratePromise) {
      await hydratePromise
      return
    }

    hydratePromise = (async () => {
      try {
        const user = await $fetch<AuthUser>('/api/auth/me')
        currentUser.value = user
      } catch {
        currentUser.value = null
      } finally {
        hydrated.value = true
      }
    })()

    try {
      await hydratePromise
    } finally {
      hydratePromise = null
    }
  }

  async function register(payload: RegisterPayload) {
    const user = await $fetch<AuthUser>('/api/auth/register', {
      method: 'POST',
      body: {
        name: payload.name,
        email: payload.email,
        password: payload.password
      }
    })

    currentUser.value = user
    hydrated.value = true
    return user
  }

  async function login(payload: LoginPayload) {
    const user = await $fetch<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: {
        email: payload.email,
        password: payload.password
      }
    })

    currentUser.value = user
    hydrated.value = true
    return user
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      currentUser.value = null
      hydrated.value = true
    }
  }

  async function updateProfile(nextProfile: ProfileSettings) {
    const user = await $fetch<AuthUser>('/api/auth/profile', {
      method: 'PUT',
      body: { ...nextProfile }
    })

    currentUser.value = user
    hydrated.value = true
  }

  async function listUsers() {
    const users = await $fetch<AuthUser[]>('/api/auth/users')
    return users
  }

  async function updateUserRole(userId: string, role: UserRole) {
    const updated = await $fetch<AuthUser>(`/api/auth/users/${userId}/role`, {
      method: 'PUT',
      body: { role }
    })

    if (currentUser.value?.id === updated.id) {
      currentUser.value = updated
    }

    return updated
  }

  return {
    currentUser,
    isAuthenticated,
    hydrate,
    register,
    login,
    logout,
    updateProfile,
    listUsers,
    updateUserRole,
    emptyProfile
  }
}
