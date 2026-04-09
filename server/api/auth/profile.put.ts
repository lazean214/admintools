import { requireSessionUser, sanitizeProfile, updateUserProfile } from '../../utils/auth-db'

type ProfileBody = {
  establishmentName?: string
  officeAddress?: string
  officePhone?: string
  officeEmail?: string
  orn?: string
  dedLicense?: string
  poBox?: string
  logoDataUrl?: string | null
  stampDataUrl?: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireSessionUser(event)
  const body = await readBody<ProfileBody>(event)
  const updated = await updateUserProfile(user.id, sanitizeProfile(body))
  return updated
})
