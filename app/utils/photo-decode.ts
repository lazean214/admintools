/** A dedicated worker keeps codec work off the UI thread and bounds its lifetime. */
export function decodePhoto(file: File): { result: Promise<Blob>; cancel: () => void } {
  const worker = new Worker(new URL('../workers/photo-decode.worker.ts', import.meta.url), { type: 'module' })
  let cancel = () => {}
  const result = new Promise<Blob>((resolve, reject) => {
    const finish = (error?: string, blob?: Blob) => {
      clearTimeout(timer)
      worker.terminate()
      if (error) reject(new Error(error))
      else if (blob) resolve(blob)
      else reject(new Error('The image decoder returned no image.'))
    }
    const timer = setTimeout(() => finish('Decoding timed out for ' + file.name + '.'), 120_000)
    cancel = () => finish('Image loading cancelled.')
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => finish(event.data.error, event.data.blob)
    worker.onerror = () => finish('Could not start the photo decoder. Reload and try again.')
    worker.postMessage(file)
  })
  return { result, cancel: () => cancel() }
}
