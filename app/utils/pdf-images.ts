import { validateDimensions } from './processing'

export type PdfImagePixels = {
  width: number
  height: number
  kind?: number
  data?: Uint8Array | Uint8ClampedArray
  bitmap?: ImageBitmap
}

export type PdfImageRegion = { x: number; y: number; w: number; h: number }

export function validatePdfRegion(region: PdfImageRegion, width: number, height: number) {
  if (![region.x, region.y, region.w, region.h].every(Number.isSafeInteger)
    || region.x < 0 || region.y < 0 || region.w < 1 || region.h < 1
    || region.x + region.w > width || region.y + region.h > height) {
    throw new Error('PDF contains an invalid grouped image region.')
  }
}

// PDF.js ImageKind values: 1 = packed monochrome, 2 = RGB, 3 = RGBA.
// Monochrome rows have byte padding; byte-length inference cannot decode them.
export function pdfPixelsToRgba(image: PdfImagePixels): Uint8ClampedArray<ArrayBuffer> {
  validateDimensions(image.width, image.height)
  const { data, width, height, kind } = image
  if (!data) throw new Error('PDF image data is unavailable.')
  const count = width * height
  if ((kind === 3 || kind === undefined) && data.length === count * 4) return new Uint8ClampedArray(data)
  const stride = Math.ceil(width / 8)
  const monochrome = kind === 1 && data.length === stride * height
  const rgb = kind === 2 && data.length === count * 3
  if (!monochrome && !rgb) throw new Error('PDF image has an unsupported or invalid pixel layout.')
  const rgba = new Uint8ClampedArray(count * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, out = i * 4
      if (monochrome) {
        const value = (data[y * stride + (x >> 3)]! & (128 >> (x & 7))) ? 255 : 0
        rgba[out] = rgba[out + 1] = rgba[out + 2] = value
      } else {
        rgba[out] = data[i * 3]!
        rgba[out + 1] = data[i * 3 + 1]!
        rgba[out + 2] = data[i * 3 + 2]!
      }
      rgba[out + 3] = 255
    }
  }
  return rgba
}
