// Worker-only codec implementation, also exercised directly by Node regression tests.
import { AlphaAction, Gravity, ImageMagick, MagickColors, MagickFormat, MagickGeometry, MagickReadSettings, ResourceLimits } from '@imagemagick/magick-wasm'
import { isRawPhoto } from './photo-formats'
import { CONVERTER_FORMATS, validateConverterOptions, type ConvertPhotoOptions } from './image-converter'

export function configurePhotoCodecs() {
  ResourceLimits.memory = 768n * 1024n * 1024n
  ResourceLimits.disk = 0n
  ResourceLimits.width = 16384n
  ResourceLimits.height = 16384n
  // HEIF decoding needs internal images even when frameCount is 1.
  ResourceLimits.listLength = 32n
}

export function transcodePhoto(bytes: Uint8Array, name: string, options: ConvertPhotoOptions, maxPixels: number, includePreview = false) {
  validateConverterOptions(options)
  const settings = new MagickReadSettings()
  settings.frameCount = 1
  if (isRawPhoto(name)) settings.format = MagickFormat.Dng
  // ICO's zero-byte 256px dimensions are not reliably auto-detected by ImageMagick.
  else if (/\.ico$/i.test(name)) settings.format = MagickFormat.Ico
  const formats = { jpg: MagickFormat.Jpeg, png: MagickFormat.Png, webp: MagickFormat.WebP, tiff: MagickFormat.Tiff, bmp: MagickFormat.Bmp, ico: MagickFormat.Ico }
  return ImageMagick.read(bytes, settings, (image) => {
    if (image.width * image.height > maxPixels) throw new Error('This photo exceeds the ' + maxPixels / 1_000_000 + ' megapixel limit.')
    image.autoOrient()
    const originalWidth = image.width, originalHeight = image.height
    if (options.format === 'ico') {
      image.resize(new MagickGeometry('256x256>'))
      image.backgroundColor = MagickColors.Transparent
      image.extent(256, 256, Gravity.Center)
    }
    if (options.format === 'jpg' || options.format === 'bmp') {
      image.backgroundColor = MagickColors.White
      image.alpha(AlphaAction.Remove)
    }
    image.strip()
    image.quality = options.quality
    const width = image.width, height = image.height
    const preview = includePreview ? image.clone((thumbnail) => {
      thumbnail.resize(new MagickGeometry('320x240>'))
      return thumbnail.write(MagickFormat.Png, (data) => new Blob([new Uint8Array(data)], { type: 'image/png' }))
    }) : undefined
    return image.write(formats[options.format], (data) => ({
      blob: new Blob([new Uint8Array(data)], { type: CONVERTER_FORMATS.find((item) => item.value === options.format)!.mime }),
      width, height, originalWidth, originalHeight, preview,
    }))
  })
}

export function photoCodecError(name: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error)
  if (/megapixel limit/.test(reason)) return name + ': ' + reason
  if (/cache resources exhausted|memory|ListLength|WidthOrHeightExceeds|ImagePixelLimit|limit/i.test(reason)) return name + ': this photo exceeds the decoder’s memory or dimension limits. Try a smaller photo.'
  return 'Could not convert ' + name + '. The photo may use an unsupported codec or be damaged. Decoder: ' + reason.slice(0, 300)
}
