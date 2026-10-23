/// <reference lib="webworker" />
import { ImageMagick, initializeImageMagick, MagickFormat, MagickReadSettings, ResourceLimits } from '@imagemagick/magick-wasm'
import wasmUrl from '@imagemagick/magick-wasm/magick.wasm?url'
import { isRawPhoto } from '../utils/photo-formats'
import { validateDimensions } from '../utils/processing'

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = async (event: MessageEvent<File>) => {
  const file = event.data
  try {
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error('Could not load the photo decoder.')
    await initializeImageMagick(await response.arrayBuffer())
    ResourceLimits.memory = 256n * 1024n * 1024n
    ResourceLimits.disk = 0n
    ResourceLimits.width = 16384n
    ResourceLimits.height = 16384n
    ResourceLimits.listLength = 1n
    const settings = new MagickReadSettings()
    settings.frameCount = 1
    // Force LibRaw for TIFF-based camera formats rather than reading a TIFF preview.
    if (isRawPhoto(file.name)) settings.format = MagickFormat.Dng
    const blob = ImageMagick.read(new Uint8Array(await file.arrayBuffer()), settings, (image) => {
      validateDimensions(image.width, image.height)
      image.autoOrient()
      return image.write(MagickFormat.Png, (bytes) => new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    })
    scope.postMessage({ blob })
  } catch {
    scope.postMessage({ error: 'Could not decode ' + file.name + '. This photo may be damaged, use an unsupported codec/camera variant, or exceed the 12 megapixel limit. Try exporting it as JPEG or PNG.' })
  }
}
