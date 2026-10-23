/// <reference lib="webworker" />
import { initializeImageMagick } from '@imagemagick/magick-wasm'
import wasmUrl from '@imagemagick/magick-wasm/magick.wasm?url'
import { configurePhotoCodecs, transcodePhoto, photoCodecError } from '../utils/photo-codecs'

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = async (event: MessageEvent<File>) => {
  const file = event.data
  try {
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error('Could not load the photo decoder.')
    await initializeImageMagick(await response.arrayBuffer())
    configurePhotoCodecs()
    const { blob } = transcodePhoto(new Uint8Array(await file.arrayBuffer()), file.name, { format: 'png', quality: 100 }, 12_000_000)
    scope.postMessage({ blob })
  } catch (error) {
    scope.postMessage({ error: photoCodecError(file.name, error) })
  }
}
