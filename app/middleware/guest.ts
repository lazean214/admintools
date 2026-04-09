export default defineNuxtRouteMiddleware(() => {
  const auth = useAuth()
  auth.hydrate()

  if (auth.isAuthenticated.value) {
    return navigateTo('/')
  }
})
