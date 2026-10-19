import type { H3Event } from 'h3'
import { createError, getRequestHeader, setHeader } from 'h3'

export const AUTH_BODY_MAX_BYTES = 32 * 1024
const AUTH_BODY_TIMEOUT_MS = 10_000

function rejectBody(event: H3Event, statusCode: number, statusMessage: string): never {
  // Do not keep an oversized or stalled upload connection alive. Let Node
  // flush the error response and close its socket, rather than destroying the
  // request first (which can hide HTTP 413/408 from the client).
  event.node.res.shouldKeepAlive = false
  setHeader(event,'Connection','close')
  throw createError({statusCode,statusMessage})
}

export async function readAuthJson(event: H3Event, timeoutMs = AUTH_BODY_TIMEOUT_MS): Promise<unknown> {
  const type = getRequestHeader(event,'content-type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'application/json') rejectBody(event,415,'Authentication requests must use application/json.')
  const encoding = getRequestHeader(event,'content-encoding')?.trim().toLowerCase()
  if (encoding && encoding !== 'identity') rejectBody(event,415,'Compressed authentication requests are not supported.')
  const declared = getRequestHeader(event,'content-length')
  if (declared && !/^\d+$/.test(declared)) rejectBody(event,400,'Invalid request length.')
  if (declared && Number(declared) > AUTH_BODY_MAX_BYTES) rejectBody(event,413,'Authentication request exceeds 32 KiB.')

  const request = event.node.req
  const bytes = await new Promise<Buffer>((resolve,reject) => {
    let length = 0, settled = false
    const chunks: Buffer[] = []
    const cleanup = () => {
      clearTimeout(timer)
      request.off('data',onData)
      request.off('end',onEnd)
      request.off('error',onError)
      request.off('aborted',onAborted)
    }
    const fail = (status: number, message: string) => {
      if (settled) return
      settled = true
      cleanup()
      chunks.length = 0
      // An aborted IncomingMessage can emit a subsequent ECONNRESET error.
      request.once('error',()=>{})
      request.pause()
      try { rejectBody(event,status,message) } catch (error) { reject(error) }
    }
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      length += buffer.byteLength
      if (length > AUTH_BODY_MAX_BYTES) { fail(413,'Authentication request exceeds 32 KiB.'); return }
      chunks.push(buffer)
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(Buffer.concat(chunks,length))
    }
    const onError = () => fail(400,'Could not read authentication request.')
    const onAborted = () => fail(400,'Authentication request was interrupted.')
    const timer = setTimeout(()=>fail(408,'Authentication request timed out.'),timeoutMs)
    timer.unref()
    request.on('data',onData)
    request.once('end',onEnd)
    request.once('error',onError)
    request.once('aborted',onAborted)
    if (request.readableEnded) onEnd()
    else if (request.destroyed) onAborted()
  })
  try {
    // Reject invalid UTF-8 as well as malformed JSON; neither should reach the
    // database with silently replaced credential bytes.
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown
  } catch {
    throw createError({statusCode:400,statusMessage:'Authentication request must contain valid JSON.'})
  }
}
