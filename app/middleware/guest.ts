export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuth()
  await auth.hydrate()

  if (auth.isAuthenticated.value) {
    return navigateTo('/')
  }
})
