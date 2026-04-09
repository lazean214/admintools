import { createSession, loginUser } from '../../utils/auth-db'

type LoginBody = {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)

  const user = loginUser({
    email: body.email || '',
    password: body.password || ''
  })

  createSession(event, user.id)
  return user
})
