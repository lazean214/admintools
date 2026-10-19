import { createError } from 'h3'

function invalid(message: string): never {
  throw createError({statusCode:400,statusMessage:message})
}

function record(input: unknown): Record<string,unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Expected an authentication object.')
  return input as Record<string,unknown>
}

function credentials(input: Record<string,unknown>) {
  if (typeof input.email !== 'string' || typeof input.password !== 'string') invalid('Email and password must be strings.')
  const email = input.email.trim().toLowerCase()
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Enter a valid email address.')
  // Do not trim passwords or alter their Unicode representation.
  if (!input.password.length || Buffer.byteLength(input.password,'utf8') > 4096) invalid('Password must contain between 1 and 4096 UTF-8 bytes.')
  return {email,password:input.password}
}

export function parseLoginInput(input: unknown) {
  return credentials(record(input))
}

export function parseRegisterInput(input: unknown) {
  const source = record(input)
  const result = credentials(source)
  if (typeof source.name !== 'string' || !source.name.trim() || source.name.trim().length > 200) invalid('Name must contain between 1 and 200 characters.')
  if (result.password.length < 6) invalid('Password must be at least 6 characters.')
  return {...result,name:source.name.trim()}
}
