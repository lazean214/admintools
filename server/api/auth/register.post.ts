import { createSession, registerUser } from '../../utils/auth-db'

type RegisterBody = {
  name?: string
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterBody>(event)

  const user = registerUser({
    name: body.name || '',
    email: body.email || '',
    password: body.password || ''
  })

  createSession(event, user.id)
  return user
})
