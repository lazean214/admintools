import { registerHooks } from 'node:module'

// Resolve Nuxt's extensionless relative TypeScript imports in native Node tests.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context) }
    catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error
      return next(specifier + '.ts', context)
    }
  }
})
