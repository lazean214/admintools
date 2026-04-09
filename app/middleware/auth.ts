export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuth()
  auth.hydrate()

  if (!auth.isAuthenticated.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
