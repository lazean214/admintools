import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import { PdfOcrClient } from './pdf-ocr-client'
import { MAX_DOCUMENT_TEXT } from './document-fields'

/** Reads one page at a time; Cancel also stops PDF rendering and OCR initialization. */
export class DocumentReader {
  private ocr = new PdfOcrClient()
  private task: PDFDocumentLoadingTask | null = null
  private render: RenderTask | null = null
  private generation = 0

  cancel() {
    this.generation++
    this.ocr.cancel()
    this.render?.cancel(); this.render = null
    const task = this.task; this.task = null
    void task?.destroy().catch(() => {})
  }

  async read(file: File, pageNumber: number, forceOcr: boolean, progress: (message: string) => void) {
    this.cancel()
    const generation = this.generation
    const active = () => { if (generation !== this.generation) throw new Error('Reading cancelled.') }
    if (!file.size || file.size > 32 * 1024 * 1024) throw new Error('Choose a PDF or image up to 32 MB.')
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 100) throw new Error('Choose a page from 1 to 100.')
    let canvas: HTMLCanvasElement | null = null
    let task: PDFDocumentLoadingTask | null = null
    try {
      progress('Reading your document…')
      const bytes = new Uint8Array(await file.arrayBuffer()); active()
      if (new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-') {
        const pdfjs = await import('pdfjs-dist'); active()
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
        task = pdfjs.getDocument({ data: bytes }); this.task = task
        const pdf = await task.promise; active()
        if (pdf.numPages > 100) throw new Error('Use a document with up to 100 pages.')
        if (pageNumber > pdf.numPages) throw new Error(`This document has ${pdf.numPages} pages. Choose an existing page.`)
        const page = await pdf.getPage(pageNumber); active()
        if (!forceOcr) {
          const content = await page.getTextContent(); active()
          // Keep physical rows together and separate labels from their values.
          const rows: { y: number; x: number; text: string }[][] = []
          for (const item of content.items) {
            if (!('str' in item) || !item.str.trim()) continue
            const y = item.transform[5]!, x = item.transform[4]!
            let row = rows.find(row => Math.abs(row[0]!.y - y) < 3)
            if (!row) { row = []; rows.push(row) }
            row.push({ y, x, text: item.str })
          }
          const text = rows.sort((a, b) => b[0]!.y - a[0]!.y).map(row => row.sort((a, b) => a.x - b.x).map(item => item.text).join('  ')).join('\n')
          if (text.length > MAX_DOCUMENT_TEXT) throw new Error('This page contains too much text. Use a shorter excerpt.')
          if (text.trim()) return { text, pages: pdf.numPages, method: 'text' as const }
        }
        const natural = page.getViewport({ scale: 1 })
        const scale = Math.min(2.5, 3000 / Math.max(natural.width, natural.height), Math.sqrt(8_000_000 / (natural.width * natural.height)))
        const viewport = page.getViewport({ scale })
        canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context || !canvas.width || !canvas.height) throw new Error('Could not read this page. Try an image instead.')
        this.render = page.render({ canvas, canvasContext: context, viewport })
        await this.render.promise; this.render = null; active()
        const text = await this.recognize(canvas, progress, active); active()
        return { text, pages: pdf.numPages, method: 'ocr' as const }
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, PNG, JPG or WebP file.')
      const bitmap = await createImageBitmap(file)
      try {
        active()
        if (bitmap.width * bitmap.height > 12_000_000 || Math.max(bitmap.width, bitmap.height) > 16384) throw new Error('Choose an image up to 12 megapixels and 16,384 pixels per side.')
        canvas = document.createElement('canvas')
        const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not read the image.')
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      } finally { bitmap.close() }
      const text = await this.recognize(canvas, progress, active); active()
      return { text, pages: 1, method: 'ocr' as const }
    } finally {
      if (canvas) canvas.width = canvas.height = 0
      if (this.task === task) { this.task = null; this.render = null }
      await task?.destroy().catch(() => {})
    }
  }

  private async recognize(canvas: HTMLCanvasElement, progress: (message: string) => void, active: () => void) {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not read the page.')), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer()); active()
    progress('Reading the text on this page…')
    const result = await this.ocr.recognize(bytes, new URL('/ocr/v7/', window.location.origin).href, () => {})
    if (result.text.length > MAX_DOCUMENT_TEXT) throw new Error('This page contains too much text. Use a smaller image.')
    return result.text
  }
}
