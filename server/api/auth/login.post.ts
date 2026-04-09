import { createSession, loginUser } from '../../utils/auth-db'

type LoginBody = {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)

  const user = await loginUser({
    email: body.email || '',
    password: body.password || ''
  })

  await createSession(event, user.id)
  return user
})
