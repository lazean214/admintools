import { createError } from 'h3'
import { createClient } from '@supabase/supabase-js'

// Capture the configured factory's concrete inferred type. ReturnType of the
// generic createClient function erases its defaults and makes table writes never.
let cachedClient: ReturnType<typeof createAdminClient> | null = null

function createAdminClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

export function getSupabaseAdminClient() {
  if (cachedClient) {
    return cachedClient
  }

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    })
  }

  cachedClient = createAdminClient(url, serviceRoleKey)

  return cachedClient
}
