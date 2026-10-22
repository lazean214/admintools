export type SelectionInput = { rgba: ArrayBuffer; width: number; height: number; x: number; y: number }

export class SmartSelectionClient {
  private createWorker: () => Worker
  constructor(createWorker: () => Worker = () => new Worker(new URL('../workers/smart-selection.worker.ts', import.meta.url), { type: 'module' })) { this.createWorker = createWorker }
  private worker: Worker | null = null
  private reject: ((error: Error) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  cancel(reason = 'Selection cancelled.') {
    this.worker?.terminate(); this.worker = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.reject?.(new Error(reason)); this.reject = null
  }
  select(input: SelectionInput, progress: (message: string) => void): Promise<Uint8Array> {
    if (this.reject) return Promise.reject(new Error('Wait for the current selection.'))
    return new Promise((resolve, reject) => {
      this.reject = reject
      this.timer = setTimeout(() => this.cancel('Selection took too long. Try the brush instead.'), 300_000)
      try {
        const worker = this.worker ??= this.createWorker()
        const active = () => this.worker === worker && this.reject === reject
        worker.onmessage = ({ data }) => {
          if (!active()) return
          if (data.type === 'progress') { progress(String(data.message)); return }
          if (data.type !== 'result' || !(data.mask instanceof ArrayBuffer) || data.mask.byteLength !== input.width * input.height) {
            const message = data.type === 'error' ? String(data.message) : 'Could not select this object. Use the brush instead.'
            this.cancel(message); return
          }
          if (this.timer) clearTimeout(this.timer)
          this.timer = null; this.reject = null
          resolve(new Uint8Array(data.mask))
        }
        worker.onerror = event => { event.preventDefault(); if (active()) this.cancel('Smart selection is unavailable. Use the brush instead.') }
        worker.onmessageerror = () => { if (active()) this.cancel('Could not receive the selection. Use the brush instead.') }
        worker.postMessage(input, [input.rgba])
      } catch { this.cancel('Could not start smart selection. Use the brush instead.') }
    })
  }
}
