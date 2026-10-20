/// <reference lib="webworker" />
import { compressPdf, type PdfCompressionLevel, type PdfJpegInput } from '../utils/pdf-compression'

const scope = self as unknown as DedicatedWorkerGlobalScope
async function encodeJpeg(input: PdfJpegInput) {
  // PDF image matrices control orientation; JPEG EXIF must not rotate it again.
  const bitmap = await createImageBitmap(new Blob([input.bytes.slice().buffer], { type: 'image/jpeg' }), {
    imageOrientation: 'none', colorSpaceConversion: 'none', premultiplyAlpha: 'none',
  })
  let canvas: OffscreenCanvas | undefined
  try {
    if (bitmap.width !== input.width || bitmap.height !== input.height) throw new Error('JPEG dimensions do not match the PDF.')
    const scale = Math.min(1, input.maxSide / Math.max(input.width, input.height))
    const width = Math.max(1, Math.round(input.width * scale)), height = Math.max(1, Math.round(input.height * scale))
    canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create image canvas.')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: input.quality })
    if (blob.type !== 'image/jpeg') throw new Error('JPEG encoding is unavailable.')
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
  } finally { bitmap.close(); if (canvas) canvas.width = canvas.height = 0 }
}
scope.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer; level: PdfCompressionLevel }>) => {
  try {
    const canEncode = typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'
    const result = await compressPdf(new Uint8Array(event.data.bytes), event.data.level, canEncode ? encodeJpeg : undefined,
      (message) => scope.postMessage({ type: 'progress', message }))
    scope.postMessage({ type: 'result', ...result, bytes: result.bytes.buffer }, [result.bytes.buffer])
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Could not compress this PDF.' })
  }
}
