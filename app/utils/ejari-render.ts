import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { EjariField } from './ejari'

// Draw the original artwork and captured values in one canvas before PDF
// packaging. This avoids reader-specific behavior of appended text layers.
export async function renderEjariPages(template: ArrayBuffer, fields: EjariField[], signal: AbortSignal, assertActive: () => void) {
  if (template.byteLength > 2_000_000) throw new Error('EJARI template exceeds the size limit.')
  const hash = await crypto.subtle.digest('SHA-256', template)
  const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('')
  if (hex !== '7d73b9acc9a02eab27de682fd28fb79070c861b1214107a1ec68b52b3f1d3ddc') throw new Error('EJARI template has changed. Review its field mapping before exporting.')
  assertActive()
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const task = pdfjs.getDocument({ data: template })
  const abort = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener('abort',abort,{ once:true })
  const canvas = document.createElement('canvas')
  const width = 1224, height = 1584, pageBytes = width * height * 4
  const output = new Uint8Array(pageBytes * 3)
  try {
    if (signal.aborted) throw new Error('EJARI export cancelled.')
    const pdf = await task.promise
    assertActive()
    if (pdf.numPages !== 3) throw new Error('EJARI template must contain three pages.')
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
      assertActive()
      const page = await pdf.getPage(pageIndex + 1)
      const viewport = page.getViewport({ scale:2 })
      if (viewport.width !== width || viewport.height !== height) throw new Error('Unexpected EJARI page dimensions.')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d',{ willReadFrequently:true })
      if (!context) throw new Error('Could not render EJARI pages.')
      await page.render({ canvas, canvasContext:context, viewport }).promise
      assertActive()
      context.save()
      context.scale(2,2)
      context.fillStyle = '#000000'
      context.textBaseline = 'alphabetic'
      for (const field of fields.filter(field => field.page === pageIndex)) {
        context.font = `${field.style ? 'bold 10' : '8'}px Arial, Helvetica, sans-serif`
        context.fillText(field.text,(field.x+20)*72/25.4,(field.top+35)*72/25.4)
      }
      context.restore()
      output.set(context.getImageData(0,0,width,height).data,pageIndex*pageBytes)
      page.cleanup()
    }
    assertActive()
    return output.buffer
  } finally {
    canvas.width = canvas.height = 0
    signal.removeEventListener('abort',abort)
    await task.destroy()
  }
}
