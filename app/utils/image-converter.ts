export const CONVERTER_FORMATS = [
  { value: 'jpg', label: 'JPG', mime: 'image/jpeg' },
  { value: 'png', label: 'PNG', mime: 'image/png' },
  { value: 'webp', label: 'WebP', mime: 'image/webp' },
  { value: 'tiff', label: 'TIFF', mime: 'image/tiff' },
  { value: 'bmp', label: 'BMP', mime: 'image/bmp' },
  { value: 'ico', label: 'ICO', mime: 'image/x-icon' },
] as const
export type ConverterFormat = typeof CONVERTER_FORMATS[number]['value']
export type ConvertPhotoOptions = { format: ConverterFormat; quality: number }
export const CONVERTER_MAX_PIXELS = 50_000_000

export function validateConverterOptions(options: ConvertPhotoOptions) {
  if (!CONVERTER_FORMATS.some((item) => item.value === options.format) || !Number.isInteger(options.quality) || options.quality < 10 || options.quality > 100) {
    throw new Error('Choose a supported output format and quality from 10 to 100.')
  }
}

export function validateConverterFiles(files: readonly File[]) {
  if (files.length > 32 || files.some((file) => !file.size || file.size > 64 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) {
    throw new Error('Choose up to 32 non-empty photos, 64 MB each and 128 MB in total.')
  }
}

export function convertedPhotoName(name: string, format: ConverterFormat, suffix: string, used: Set<string>) {
  const base = (name.split(/[\\/]/).pop() || 'photo').replace(/\.[^.]+$/, '').replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'photo'
  const safeSuffix = suffix.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 60)
  let output = base + safeSuffix + '.' + format
  let index = 2
  while (used.has(output.toLowerCase())) output = base + safeSuffix + '-' + index++ + '.' + format
  used.add(output.toLowerCase())
  return output
}
