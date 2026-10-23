/// <reference lib="webworker" />
import { initializeImageMagick } from '@imagemagick/magick-wasm'
import wasmUrl from '@imagemagick/magick-wasm/magick.wasm?url'
import { configurePhotoCodecs, transcodePhoto, photoCodecError } from '../utils/photo-codecs'
import { CONVERTER_MAX_PIXELS, validateConverterFiles, type ConvertPhotoOptions } from '../utils/image-converter'

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = async (event: MessageEvent<{ file: File; options: ConvertPhotoOptions }>) => {
  const { file, options } = event.data
  try {
    validateConverterFiles([file])
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error('Could not load the converter. Reload and try again.')
    await initializeImageMagick(await response.arrayBuffer())
    configurePhotoCodecs()
    scope.postMessage(transcodePhoto(new Uint8Array(await file.arrayBuffer()), file.name, options, CONVERTER_MAX_PIXELS, true))
  } catch (error) {
    scope.postMessage({ error: photoCodecError(file.name, error) })
  }
}
