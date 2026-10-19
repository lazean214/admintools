import { onBeforeUnmount } from 'vue'
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'

export function useRasterPdfExport() {
  const client = new ProcessingClient(() => new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' }))
  let generation = 0, cancelled = false, disposed = false
  function begin() { cancelled = false; return ++generation }
  function assertActive(run: number) {
    if (disposed || cancelled || run !== generation) throw new ProcessingCancelledError()
  }
  function cancel() { cancelled = true; client.cancel() }
  async function create(canvas: HTMLCanvasElement, pageWidth: number, pageHeight: number, run: number) {
    assertActive(run)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not read the document canvas.')
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data.buffer as ArrayBuffer
    const blob = await client.rasterPdf({ rgba, width: canvas.width, height: canvas.height, pageWidth, pageHeight })
    assertActive(run)
    return blob
  }
  onBeforeUnmount(() => { disposed = true; generation++; cancel() })
  return { begin, assertActive, create, cancel }
}
