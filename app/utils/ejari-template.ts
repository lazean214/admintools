export function decodeEjariTemplate(payload: unknown): ArrayBuffer {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid EJARI template response.')
  const { encoding, data } = payload as { encoding?: unknown; data?: unknown }
  if (encoding !== 'base64' || typeof data !== 'string' || data.length > 2_666_668) throw new Error('Invalid EJARI template response.')
  let decoded: string
  try { decoded = atob(data) } catch { throw new Error('Invalid EJARI template encoding.') }
  if (!decoded.startsWith('%PDF-') || decoded.length > 2_000_000) throw new Error('Invalid EJARI template data.')
  return Uint8Array.from(decoded,char => char.charCodeAt(0)).buffer
}

export async function loadEjariTemplate(signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch('/ejari-template-data.json',{signal})
  if (!response.ok) throw new Error('Could not load the EJARI template.')
  return decodeEjariTemplate(await response.json())
}
