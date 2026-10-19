/// <reference lib="webworker" />
import init, { remove_watermark, resize_rgba, composite_rgba, create_raster_pdf } from '../wasm/processing/admintools_processing.js'
import wasmUrl from '../wasm/processing/admintools_processing_bg.wasm?url'
import { cropRemoval, restoreCrop, validateResize, validateComposite, validateWatermarkExport, validateRasterPdf } from '../utils/processing'
import type { RemovalRequest, RemovalResponse, ResizeRequest, CompositeRequest, WatermarkExportRequest, RasterPdfRequest } from '../utils/processing'

const workerScope = self as unknown as DedicatedWorkerGlobalScope
let initialized: ReturnType<typeof init> | null = null

workerScope.onmessage = async (event: MessageEvent<RemovalRequest | ResizeRequest | CompositeRequest | WatermarkExportRequest | RasterPdfRequest>) => {
  const { id, width, height } = event.data
  const send = (message: RemovalResponse, transfer: Transferable[] = []) => workerScope.postMessage(message, transfer)
  try {
    send({ id, type: 'progress', phase: 'Preparing image' })
    initialized ??= init({ module_or_path: wasmUrl })
    await initialized
    if (event.data.operation === 'watermark-export') {
      const input = event.data
      validateWatermarkExport(input)
      if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') throw new Error('Background export is unavailable. Select Standard export.')
      let bitmap: ImageBitmap
      try { bitmap = await createImageBitmap(input.file) }
      catch { throw new Error('Could not decode this image in the background. Select Standard export and retry.') }
      let canvas: OffscreenCanvas | null = null
      try {
        if (bitmap.width !== width || bitmap.height !== height) throw new Error('Image dimensions changed. Please select the files again.')
        canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Could not read image pixels.')
        context.drawImage(bitmap, 0, 0)
        const rgba = context.getImageData(0, 0, width, height).data.buffer as ArrayBuffer
        validateComposite({ ...input, rgba })
        const output = composite_rgba(new Uint8Array(rgba), width, height, new Uint8Array(input.mark), input.markWidth, input.markHeight, input.x, input.y, input.opacity)
        context.putImageData(new ImageData(new Uint8ClampedArray(output), width, height), 0, 0)
        const blob = await canvas.convertToBlob({ type: 'image/png' })
        send({ id, type: 'file', blob })
      } finally {
        bitmap.close()
        if (canvas) canvas.width = canvas.height = 0
      }
      return
    }
    const { rgba } = event.data
    if (!(rgba instanceof ArrayBuffer)) throw new Error('Invalid processing buffers.')
    if (event.data.operation === 'raster-pdf') {
      const input = event.data
      validateRasterPdf(input)
      const output = create_raster_pdf(new Uint8Array(rgba), width, height, input.pageWidth, input.pageHeight)
      send({ id, type: 'file', blob: new Blob([output.buffer as ArrayBuffer], { type: 'application/pdf' }) })
      return
    }
    if (event.data.operation === 'composite') {
      const input = event.data
      validateComposite(input)
      const output = composite_rgba(new Uint8Array(rgba), width, height, new Uint8Array(input.mark), input.markWidth, input.markHeight, input.x, input.y, input.opacity)
      const buffer = output.buffer as ArrayBuffer
      send({ id, type: 'result', rgba: buffer }, [buffer])
      return
    }
    if (event.data.operation === 'resize') {
      validateResize(event.data)
      send({ id, type: 'progress', phase: 'Resampling image' })
      const output = resize_rgba(new Uint8Array(rgba), width, height, event.data.targetWidth, event.data.targetHeight)
      const buffer = output.buffer as ArrayBuffer
      send({ id, type: 'result', rgba: buffer }, [buffer])
      return
    }
    const { mask, seed } = event.data
    if (!(mask instanceof ArrayBuffer)) throw new Error('Invalid processing buffers.')
    const pixels = new Uint8Array(rgba)
    const crop = cropRemoval(pixels, new Uint8Array(mask), width, height)
    const output = remove_watermark(crop.pixels, crop.selection, crop.width, crop.height, seed, (phase: string) => {
      send({ id, type: 'progress', phase })
    })
    restoreCrop(pixels, width, crop, output)
    send({ id, type: 'result', rgba }, [rgba])
  } catch (error) {
    initialized = null
    send({ id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
