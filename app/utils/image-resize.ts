import { imageResizeRegion, validateDimensions } from './processing'

export type ImageResizeSettings = {
  width: number; height: number; mode: 'crop' | 'fit'
  format: 'original' | 'png' | 'jpg' | 'webp'; quality: number
  method: 'standard' | 'lanczos'; targetKb: number
}
export type SavedImagePreset = ImageResizeSettings & { name: string }
export const IMAGE_PRESET_STORAGE_KEY = 'admintools.image-resize.presets.v1'

export function validateImageResizeSettings(settings: ImageResizeSettings) {
  validateDimensions(settings.width, settings.height)
  if (!['crop', 'fit'].includes(settings.mode) || !['original', 'png', 'jpg', 'webp'].includes(settings.format)
    || !['standard', 'lanczos'].includes(settings.method)
    || !Number.isFinite(settings.quality) || settings.quality < 10 || settings.quality > 100
    || !Number.isFinite(settings.targetKb) || settings.targetKb < 0 || settings.targetKb > 131072) {
    throw new Error('Check the output format, quality, and target size (up to 131072 KB).')
  }
  if (settings.targetKb > 0 && !['jpg', 'webp'].includes(settings.format)) throw new Error('Choose JPG or WebP to use a target file size.')
}

export function parseImageResizePresets(json: string): SavedImagePreset[] {
  const value: unknown = JSON.parse(json)
  if (!Array.isArray(value)) return []
  const presets: SavedImagePreset[] = []
  for (const item of value.slice(0, 20)) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60) continue
    try {
      validateImageResizeSettings(item)
      const name = item.name.trim()
      if (presets.some((preset) => preset.name === name)) continue
      presets.push({ name, width: item.width, height: item.height, mode: item.mode, format: item.format, quality: item.quality, method: item.method, targetKb: item.targetKb })
    } catch { /* Ignore invalid or obsolete saved settings. */ }
  }
  return presets
}

export function orientedImageSize(width: number, height: number, rotation: number) {
  validateDimensions(width, height)
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Rotation must use quarter turns.')
  return rotation % 180 ? { width: height, height: width } : { width, height }
}

/** Rotate in visible image space, including when the image is already mirrored. */
export function rotateImageOrientation(rotation: number, flipX: boolean, flipY: boolean, direction: 'left' | 'right') {
  if (![0, 90, 180, 270].includes(rotation)) throw new Error('Rotation must use quarter turns.')
  return { rotation: (rotation + (direction === 'right' ? 90 : 270)) % 360, flipX: flipY, flipY: flipX }
}

export function imageUpscaleFactor(width: number, height: number, settings: ImageResizeSettings, x: number, y: number, scale: number) {
  const region = imageResizeRegion(width, height, settings.width, settings.height, settings.mode, x, y, scale)
  return Math.max(region.targetWidth / region.sourceWidth, region.targetHeight / region.sourceHeight)
}

/** Bounded search; returns the smallest tried result when the target is unreachable. */
export async function encodeImageWithinSize(encode: (quality: number) => Promise<Blob>, maximumQuality: number, targetBytes: number, assertActive: () => void = () => {}) {
  if (!Number.isFinite(maximumQuality) || maximumQuality < 0.1 || maximumQuality > 1 || !Number.isFinite(targetBytes) || targetBytes < 0) throw new Error('Invalid image compression settings.')
  const run = async (quality: number) => { assertActive(); const blob = await encode(quality); assertActive(); return blob }
  const initial = await run(maximumQuality)
  if (!targetBytes || initial.size <= targetBytes || !['image/jpeg', 'image/webp'].includes(initial.type)) return { blob: initial, quality: maximumQuality, targetMet: !targetBytes || initial.size <= targetBytes }
  let low = 0.1, high = maximumQuality
  let smallest = { blob: initial, quality: maximumQuality }
  const minimum = await run(low)
  if (minimum.size < smallest.blob.size) smallest = { blob: minimum, quality: low }
  if (minimum.size > targetBytes) return { ...smallest, targetMet: false }
  let best = { blob: minimum, quality: low }
  for (let attempt = 0; attempt < 7; attempt++) {
    const quality = (low + high) / 2, blob = await run(quality)
    if (blob.size <= targetBytes) { low = quality; best = { blob, quality } } else high = quality
  }
  return { ...best, targetMet: true }
}
