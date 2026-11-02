/// <reference lib="webworker" />
import { compressPdf, type PdfCompressionLevel, type PdfCustomCompressionSettings, type PdfImageTargetMap, type PdfJpegInput } from '../utils/pdf-compression'

const scope = self as unknown as DedicatedWorkerGlobalScope
function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'An unknown PDF processing error occurred.'
}

async function encodeJpeg(input: PdfJpegInput) {
  let canvas: OffscreenCanvas | undefined
  let sourceCanvas: OffscreenCanvas | undefined
  let bitmap: ImageBitmap | undefined
  try {
    if (input.format === 'jpeg') {
      // PDF image matrices control orientation; JPEG EXIF must not rotate it again.
      bitmap = await createImageBitmap(new Blob([input.bytes.slice().buffer], { type: 'image/jpeg' }), {
        imageOrientation: 'none', colorSpaceConversion: 'none', premultiplyAlpha: 'none',
      })
      if (bitmap.width !== input.width || bitmap.height !== input.height) throw new Error('JPEG dimensions do not match the PDF.')
    }
    let pixels = input.bytes
    if (input.format === 'flate') {
      if (typeof DecompressionStream === 'undefined') throw new Error('Image decompression is unavailable.')
      const stream = new Blob([input.bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate'))
      pixels = new Uint8Array(await new Response(stream).arrayBuffer())
    }
    const expectedBytes = input.width * input.height * input.components
    if (input.format !== 'jpeg' && pixels.length !== expectedBytes) throw new Error('PDF image data has an unsupported pixel layout.')
    const scale = Math.min(1, input.maxSide / Math.max(input.width, input.height))
    const width = Math.max(1, Math.round(input.width * scale)), height = Math.max(1, Math.round(input.height * scale))
    canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create image canvas.')
    if (bitmap) context.drawImage(bitmap, 0, 0, width, height)
    else {
      const imageData = context.createImageData(input.width, input.height)
      for (let pixel = 0; pixel < input.width * input.height; pixel++) {
        const source = pixel * input.components, target = pixel * 4
        imageData.data[target] = pixels[source]!
        imageData.data[target + 1] = pixels[source + (input.components === 3 ? 1 : 0)]!
        imageData.data[target + 2] = pixels[source + (input.components === 3 ? 2 : 0)]!
        imageData.data[target + 3] = 255
      }
      sourceCanvas = new OffscreenCanvas(input.width, input.height)
      const sourceContext = sourceCanvas.getContext('2d')
      if (!sourceContext) throw new Error('Could not create image canvas.')
      sourceContext.putImageData(imageData, 0, 0)
      context.drawImage(sourceCanvas, 0, 0, width, height)
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: input.quality })
    if (blob.type !== 'image/jpeg') throw new Error('JPEG encoding is unavailable.')
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
  } finally {
    bitmap?.close()
    if (canvas) canvas.width = canvas.height = 0
    if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 0
  }
}
scope.onmessage = async (event: MessageEvent<{
  bytes: ArrayBuffer
  level: PdfCompressionLevel
  imageTargets?: [string, number][]
  customSettings?: PdfCustomCompressionSettings
}>) => {
  try {
    const canEncode = typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'
    const bytes = new Uint8Array(event.data.bytes)
    const imageTargets: PdfImageTargetMap | undefined = event.data.imageTargets
      ? new Map(event.data.imageTargets)
      : undefined
    const result = await compressPdf(bytes, event.data.level, canEncode ? encodeJpeg : undefined,
      (message) => scope.postMessage({ type: 'progress', message }), imageTargets, event.data.customSettings)
    scope.postMessage({ type: 'result', ...result, bytes: result.bytes.buffer }, [result.bytes.buffer])
  } catch (error) {
    scope.postMessage({ type: 'error', message: describeError(error) })
  }
}
