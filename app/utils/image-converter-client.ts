import type { ConvertPhotoOptions } from './image-converter'

export type ConvertedPhoto = { blob: Blob; preview?: Blob; width: number; height: number; originalWidth: number; originalHeight: number }

export function convertPhoto(file: File, options: ConvertPhotoOptions) {
  const worker = new Worker(new URL('../workers/image-converter.worker.ts', import.meta.url), { type: 'module' })
  let cancel = () => {}
  const result = new Promise<ConvertedPhoto>((resolve, reject) => {
    let settled = false
    const finish = (error?: string, output?: ConvertedPhoto) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      if (error) reject(new Error(error))
      else if (output?.blob instanceof Blob && output.blob.size && output.width > 0 && output.height > 0) resolve(output)
      else reject(new Error('The converter returned no image.'))
    }
    const timer = setTimeout(() => finish('Conversion timed out for ' + file.name + '. Try a smaller photo.'), 120_000)
    cancel = () => finish('Conversion cancelled.')
    worker.onmessage = (event: MessageEvent<ConvertedPhoto & { error?: string }>) => finish(event.data.error, event.data)
    worker.onerror = () => finish('Could not start the converter. Reload and try again.')
    worker.postMessage({ file, options })
  })
  return { result, cancel: () => cancel() }
}
