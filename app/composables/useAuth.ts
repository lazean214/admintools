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

type UserRecord = {
  id: string
  name: string
  email: string
  password: string
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

const AUTH_USERS_KEY = 'webtools-auth-users'
const AUTH_SESSION_KEY = 'webtools-auth-session-user-id'

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
  const users = useState<UserRecord[]>('auth-users', () => [])
  const sessionUserId = useState<string | null>('auth-session-user-id', () => null)
  const hydrated = useState<boolean>('auth-hydrated', () => false)

  const currentUser = computed(() => users.value.find((item) => item.id === sessionUserId.value) ?? null)
  const isAuthenticated = computed(() => currentUser.value !== null)

  function persistUsers() {
    if (!import.meta.client) {
      return
    }
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users.value))
  }

  function persistSession() {
    if (!import.meta.client) {
      return
    }

    if (sessionUserId.value) {
      localStorage.setItem(AUTH_SESSION_KEY, sessionUserId.value)
      return
    }
    localStorage.removeItem(AUTH_SESSION_KEY)
  }

  function hydrate() {
    if (!import.meta.client || hydrated.value) {
      return
    }

    try {
      const usersRaw = localStorage.getItem(AUTH_USERS_KEY)
      const parsedUsers = usersRaw ? JSON.parse(usersRaw) : []
      users.value = Array.isArray(parsedUsers) ? parsedUsers : []

      const storedSessionUserId = localStorage.getItem(AUTH_SESSION_KEY)
      const sessionExists = users.value.some((item) => item.id === storedSessionUserId)
      sessionUserId.value = sessionExists ? storedSessionUserId : null
    } catch {
      users.value = []
      sessionUserId.value = null
    } finally {
      hydrated.value = true
    }
  }

  function register(payload: RegisterPayload) {
    hydrate()

    const email = payload.email.trim().toLowerCase()
    if (users.value.some((item) => item.email === email)) {
      throw new Error('An account with this email already exists.')
    }

    const newUser: UserRecord = {
      id: crypto.randomUUID(),
      name: payload.name.trim(),
      email,
      password: payload.password,
      profile: emptyProfile()
    }

    users.value = [...users.value, newUser]
    sessionUserId.value = newUser.id
    persistUsers()
    persistSession()
    return newUser
  }

  function login(payload: LoginPayload) {
    hydrate()

    const email = payload.email.trim().toLowerCase()
    const match = users.value.find((item) => item.email === email && item.password === payload.password)
    if (!match) {
      throw new Error('Invalid email or password.')
    }

    sessionUserId.value = match.id
    persistSession()
    return match
  }

  function logout() {
    sessionUserId.value = null
    persistSession()
  }

  function updateProfile(nextProfile: ProfileSettings) {
    hydrate()
    if (!sessionUserId.value) {
      throw new Error('You need to be logged in to update profile settings.')
    }

    users.value = users.value.map((item) => {
      if (item.id !== sessionUserId.value) {
        return item
      }
      return {
        ...item,
        profile: { ...nextProfile }
      }
    })

    persistUsers()
  }

  return {
    users,
    currentUser,
    isAuthenticated,
    hydrate,
    register,
    login,
    logout,
    updateProfile,
    emptyProfile
  }
}
