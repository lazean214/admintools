export const MAX_IMAGE_PIXELS = 12_000_000
export const MAX_IMAGE_SIDE = 16_384
export const MAX_MASK_PIXELS = 250_000
export const MAX_MASK_AREA = 1_000_000
export const MAX_UNDO_BYTES = 64 * 1024 * 1024

export type RemovalRequest = {
  operation?: 'remove'
  id: number
  width: number
  height: number
  rgba: ArrayBuffer
  mask: ArrayBuffer
  seed: number
}

export type ResizeRequest = {
  id: number
  operation: 'resize'
  width: number
  height: number
  targetWidth: number
  targetHeight: number
  rgba: ArrayBuffer
}

export type RasterPdfRequest = {
  id: number
  operation: 'raster-pdf'
  rgba: ArrayBuffer
  width: number
  height: number
  pageWidth: number
  pageHeight: number
}

export function validateRasterPdf(input: Omit<RasterPdfRequest, 'id' | 'operation'>) {
  validateDimensions(input.width, input.height)
  if (!(input.rgba instanceof ArrayBuffer) || input.rgba.byteLength !== input.width * input.height * 4) throw new Error('PDF pixels do not match their dimensions.')
  if (![input.pageWidth, input.pageHeight].every((n) => Number.isFinite(n) && n >= 1 && n <= 14400)) throw new Error('PDF page dimensions must be between 1 and 14400 points.')
}

export type CompositeRequest = {
  id: number
  operation: 'composite'
  width: number
  height: number
  rgba: ArrayBuffer
  mark: ArrayBuffer
  markWidth: number
  markHeight: number
  x: number
  y: number
  opacity: number
}

export type WatermarkExportRequest = Omit<CompositeRequest, 'operation' | 'rgba'> & {
  operation: 'watermark-export'
  file: Blob
}

export function validateWatermarkExport(input: Omit<WatermarkExportRequest, 'id' | 'operation'>) {
  validateDimensions(input.width, input.height)
  validateDimensions(input.markWidth, input.markHeight)
  if (!(input.file instanceof Blob) || !input.file.size || input.file.size > 32 * 1024 * 1024) throw new Error('Choose an image smaller than 32 MB.')
  if (!(input.mark instanceof ArrayBuffer) || input.mark.byteLength !== input.markWidth * input.markHeight * 4) throw new Error('Watermark pixel buffer does not match its dimensions.')
  if (![input.x, input.y].every((n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 2147483647)) throw new Error('Invalid watermark position.')
  if (!Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1) throw new Error('Watermark opacity must be between 0 and 1.')
}

export function validateComposite(input: Omit<CompositeRequest, 'id' | 'operation'>) {
  validateDimensions(input.width, input.height)
  validateDimensions(input.markWidth, input.markHeight)
  if (input.rgba.byteLength !== input.width * input.height * 4 || input.mark.byteLength !== input.markWidth * input.markHeight * 4) {
    throw new Error('Watermark pixel buffers do not match their dimensions.')
  }
  if (![input.x, input.y].every((n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 2147483647)) throw new Error('Invalid watermark position.')
  if (!Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1) throw new Error('Watermark opacity must be between 0 and 1.')
}

export function resizeDimensions(width: number, height: number, requestedWidth: number, requestedHeight: number, keepAspect: boolean) {
  validateDimensions(width, height)
  validateDimensions(requestedWidth, requestedHeight)
  const ratio = Math.min(requestedWidth / width, requestedHeight / height)
  const targetWidth = keepAspect ? Math.max(1, Math.round(width * ratio)) : requestedWidth
  const targetHeight = keepAspect ? Math.max(1, Math.round(height * ratio)) : requestedHeight
  validateDimensions(targetWidth, targetHeight)
  return { targetWidth, targetHeight }
}

export function validateResize(input: Omit<ResizeRequest, 'id' | 'operation'>) {
  validateDimensions(input.width, input.height)
  validateDimensions(input.targetWidth, input.targetHeight)
  if (input.rgba.byteLength !== input.width * input.height * 4) throw new Error('Pixel buffer length does not match the image dimensions.')
  if (input.width * input.targetHeight > 24_000_000 || input.targetWidth * input.height > 24_000_000) {
    throw new Error('This resize needs too much memory. Choose a less extreme aspect ratio.')
  }
}

export type RemovalResponse =
  | { id: number; type: 'progress'; phase: string }
  | { id: number; type: 'result'; rgba: ArrayBuffer }
  | { id: number; type: 'file'; blob: Blob }
  | { id: number; type: 'error'; message: string }

export function validateDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('Use an image up to 12 megapixels and 16384 pixels per side.')
  }
}

export function validateRemoval(rgba: Uint8Array, mask: Uint8Array, width: number, height: number) {
  validateDimensions(width, height)
  if (rgba.length !== width * height * 4 || mask.length !== width * height) {
    throw new Error('Pixel or mask buffer length does not match the image dimensions.')
  }
  let count = 0
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    count++
    const x = i % width, y = Math.floor(i / width)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x)
    y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  if (!count) throw new Error('Paint or select the area you want to remove first.')
  if (count === mask.length) throw new Error('Leave some surrounding pixels unselected to reconstruct the area.')
  if (count > MAX_MASK_PIXELS) throw new Error('Select a smaller area (up to 250000 pixels) and process in stages.')
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_MASK_AREA) {
    throw new Error('Keep the selected areas closer together and process in stages.')
  }
  return { x0, y0, x1, y1 }
}

// Include the original search padding, block extent, and FMM radius around the
// selection. Large photos with a small mask no longer need full-image Rust arrays.
export function cropRemoval(rgba: Uint8Array, mask: Uint8Array, width: number, height: number) {
  const { x0, y0, x1, y1 } = validateRemoval(rgba, mask, width, height)
  const mw = x1 - x0 + 1, mh = y1 - y0 + 1
  const block = Math.max(5, Math.min(12, Math.ceil(Math.sqrt(mw * mh) * 0.035)))
  const pad = Math.max(30, block * 3, Math.ceil(Math.max(mw, mh) * 0.6)) + block
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad)
  const cropWidth = Math.min(width, x1 + pad + 1) - left
  const cropHeight = Math.min(height, y1 + pad + 1) - top
  const pixels = new Uint8Array(cropWidth * cropHeight * 4)
  const selection = new Uint8Array(cropWidth * cropHeight)
  for (let y = 0; y < cropHeight; y++) {
    const offset = (top + y) * width + left
    pixels.set(rgba.subarray(offset * 4, (offset + cropWidth) * 4), y * cropWidth * 4)
    selection.set(mask.subarray(offset, offset + cropWidth), y * cropWidth)
  }
  return { pixels, selection, width: cropWidth, height: cropHeight, left, top }
}

export function restoreCrop(rgba: Uint8Array, width: number, crop: ReturnType<typeof cropRemoval>, output: Uint8Array) {
  if (output.length !== crop.width * crop.height * 4) throw new Error('Processing returned an invalid image.')
  for (let y = 0; y < crop.height; y++) {
    rgba.set(output.subarray(y * crop.width * 4, (y + 1) * crop.width * 4), ((crop.top + y) * width + crop.left) * 4)
  }
}

export function retainUndo<T extends { data: { byteLength: number } }>(history: T[], entry: T, budget = MAX_UNDO_BYTES) {
  if (entry.data.byteLength > budget) return
  let bytes = history.reduce((sum, item) => sum + item.data.byteLength, 0)
  while (history.length && bytes + entry.data.byteLength > budget) bytes -= history.shift()!.data.byteLength
  history.push(entry)
}
