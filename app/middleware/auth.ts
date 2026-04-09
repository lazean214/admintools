export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  await auth.hydrate()

  if (!auth.isAuthenticated.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
