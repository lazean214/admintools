import { validateResize, validateComposite, validateWatermarkExport, validateRasterPdf } from './processing'
import type { RemovalRequest, RemovalResponse, ResizeRequest, CompositeRequest, WatermarkExportRequest, RasterPdfRequest } from './processing'

export type EjariRequest = { operation: 'ejari-pdf'; template: ArrayBuffer; text: ArrayBuffer; offsets: ArrayBuffer; placements: ArrayBuffer }
export type EjariRasterRequest = { operation: 'ejari-raster'; rgba: ArrayBuffer }

export class ProcessingCancelledError extends Error {
  constructor() { super('Processing cancelled.'); this.name = 'ProcessingCancelledError' }
}

export class ProcessingClient {
  private createWorker: () => Worker
  private worker: Worker | null = null
  private nextId = 0
  private pending: {
    id: number
    bytes: number
    kind: 'rgba' | 'png' | 'pdf'
    resolve: (output: ArrayBuffer | Blob) => void
    reject: (error: Error) => void
    progress: (phase: string) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  constructor(createWorker: () => Worker) { this.createWorker = createWorker }

  run(input: Omit<RemovalRequest, 'id'>, progress: (phase: string) => void): Promise<ArrayBuffer> {
    return this.dispatch(input, progress, input.rgba.byteLength, [input.rgba, input.mask]) as Promise<ArrayBuffer>
  }

  resize(input: Omit<ResizeRequest, 'id' | 'operation'>, progress: (phase: string) => void = () => {}): Promise<ArrayBuffer> {
    try { validateResize(input) } catch (error) { return Promise.reject(error) }
    return this.dispatch({ ...input, operation: 'resize' }, progress, input.targetWidth * input.targetHeight * 4, [input.rgba]) as Promise<ArrayBuffer>
  }

  composite(input: Omit<CompositeRequest, 'id' | 'operation'>): Promise<ArrayBuffer> {
    try { validateComposite(input) } catch (error) { return Promise.reject(error) }
    return this.dispatch({ ...input, operation: 'composite' }, () => {}, input.rgba.byteLength, [input.rgba, input.mark]) as Promise<ArrayBuffer>
  }

  exportWatermark(input: Omit<WatermarkExportRequest, 'id' | 'operation'>): Promise<Blob> {
    try { validateWatermarkExport(input) } catch (error) { return Promise.reject(error) }
    return this.dispatch({ ...input, operation: 'watermark-export' }, () => {}, 0, [input.mark], 'png') as Promise<Blob>
  }

  rasterPdf(input: Omit<RasterPdfRequest, 'id' | 'operation'>): Promise<Blob> {
    try { validateRasterPdf(input) } catch (error) { return Promise.reject(error) }
    return this.dispatch({ ...input, operation: 'raster-pdf' }, () => {}, 0, [input.rgba], 'pdf') as Promise<Blob>
  }

  ejariPdf(input: Omit<EjariRequest, 'operation'>): Promise<Blob> {
    return this.dispatch({ ...input, operation: 'ejari-pdf' }, () => {}, 0, [input.template, input.text, input.offsets, input.placements], 'pdf') as Promise<Blob>
  }

  ejariRasterPdf(rgba: ArrayBuffer): Promise<Blob> {
    if (!(rgba instanceof ArrayBuffer) || rgba.byteLength !== 1224 * 1584 * 4 * 3) return Promise.reject(new Error('EJARI requires three complete rendered pages.'))
    return this.dispatch({ operation: 'ejari-raster', rgba }, () => {}, 0, [rgba], 'pdf') as Promise<Blob>
  }

  private dispatch(input: Omit<RemovalRequest, 'id'> | Omit<ResizeRequest, 'id'> | Omit<CompositeRequest, 'id'> | Omit<WatermarkExportRequest, 'id'> | Omit<RasterPdfRequest, 'id'> | EjariRequest | EjariRasterRequest, progress: (phase: string) => void, bytes: number, transfer: ArrayBuffer[], kind: 'rgba' | 'png' | 'pdf' = 'rgba'): Promise<ArrayBuffer | Blob> {
    if (this.pending) return Promise.reject(new Error('An export is already being processed.'))
    return new Promise((resolve, reject) => {
      try {
        if (!this.worker) {
          this.worker = this.createWorker()
          this.worker.onmessage = (event: MessageEvent<RemovalResponse>) => {
            const message = event.data
            const pending = this.pending
            if (!pending || message.id !== pending.id) return
            if (message.type === 'progress') { pending.progress(message.phase); return }
            if (message.type === 'error') { this.fail(new Error(message.message)); return }
            const validRgba = pending.kind === 'rgba' && message.type === 'result' && message.rgba instanceof ArrayBuffer && message.rgba.byteLength === pending.bytes
            const validFile = pending.kind !== 'rgba' && message.type === 'file' && message.blob instanceof Blob && message.blob.type === (pending.kind === 'png' ? 'image/png' : 'application/pdf') && message.blob.size > 0 && message.blob.size <= 128 * 1024 * 1024
            if (!validRgba && !validFile) {
              this.fail(new Error('Processing returned an invalid result.')); return
            }
            clearTimeout(pending.timer)
            this.pending = null
            pending.resolve(message.type === 'file' ? message.blob : (message as { rgba: ArrayBuffer }).rgba)
          }
          this.worker.onerror = (event) => {
            event.preventDefault()
            this.fail(new Error('Processing failed. Please retry.'))
          }
          this.worker.onmessageerror = () => this.fail(new Error('Could not receive the processing result.'))
        }
        const id = ++this.nextId
        this.pending = {
          id, bytes, kind, resolve, reject, progress,
          timer: setTimeout(() => this.fail(new Error('Processing took too long. Try a smaller selection.')), ('engine' in input && input.engine === 'ai') ? 600_000 : 120_000)
        }
        this.worker.postMessage({ ...input, id }, transfer)
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error('Could not start processing.'))
        reject(error)
      }
    })
  }

  cancel() { this.fail(new ProcessingCancelledError()) }

  private fail(error: Error) {
    this.worker?.terminate()
    this.worker = null
    if (!this.pending) return
    clearTimeout(this.pending.timer)
    const { reject } = this.pending
    this.pending = null
    reject(error)
  }
}
