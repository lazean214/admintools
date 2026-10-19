import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cropRemoval, restoreCrop, retainUndo, validateDimensions, validateRemoval, resizeDimensions } from '../app/utils/processing.ts'
import { pdfPixelsToRgba, validatePdfRegion } from '../app/utils/pdf-images.ts'
import { ProcessingClient, ProcessingCancelledError } from '../app/utils/processing-client.ts'
import init, { remove_watermark, resize_rgba, composite_rgba, create_raster_pdf } from '../app/wasm/processing/admintools_processing.js'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { watermarkPosition } from '../app/utils/watermark.ts'

await init({ module_or_path: readFileSync(new URL('../app/wasm/processing/admintools_processing_bg.wasm', import.meta.url)) })

function fixture(width = 32, height = 32) {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set([100, 140, 180, (i % 4) * 85], i * 4)
  return { rgba, mask: new Uint8Array(width * height), width, height }
}

test('dimension and buffer guards reject malformed or oversized inputs', () => {
  for (const [w, h] of [[0, 2], [-1, 2], [NaN, 2], [1.5, 2], [4000, 4000], [16385, 1]]) {
    assert.throws(() => validateDimensions(w, h))
  }
  assert.doesNotThrow(() => validateDimensions(4000, 3000))
  assert.throws(() => validateRemoval(new Uint8Array(8), new Uint8Array(1), 1, 1), /buffer length/)
  assert.throws(() => remove_watermark(new Uint8Array(8), new Uint8Array(1), 1, 1, 1, () => {}), /buffer length/)
  assert.throws(() => remove_watermark(new Uint8Array(), new Uint8Array(), 0, 0, 1, () => {}), /12 megapixels/)
})

test('empty Rust mask is a no-op; UI rejects empty and full selections', () => {
  const f = fixture(2, 2)
  assert.deepEqual(remove_watermark(f.rgba, f.mask, 2, 2, 1, () => {}), f.rgba)
  assert.throws(() => validateRemoval(f.rgba, f.mask, 2, 2), /select/)
  f.mask.fill(1)
  assert.throws(() => validateRemoval(f.rgba, f.mask, 2, 2), /surrounding/)
  assert.throws(() => remove_watermark(f.rgba, f.mask, 2, 2, 1, () => {}), /surrounding/)
})

test('large or distant masks are rejected in both JavaScript and Rust', () => {
  const f = fixture(1100, 1000)
  f.mask.fill(1, 0, 250_001)
  assert.throws(() => validateRemoval(f.rgba, f.mask, f.width, f.height), /smaller area/)
  assert.throws(() => remove_watermark(f.rgba, f.mask, f.width, f.height, 1, () => {}), /smaller area/)
  f.mask.fill(0); f.mask[0] = 1; f.mask[f.mask.length - 1] = 1
  assert.throws(() => validateRemoval(f.rgba, f.mask, f.width, f.height), /closer together/)
  assert.throws(() => remove_watermark(f.rgba, f.mask, f.width, f.height, 1, () => {}), /closer together/)
})

test('uniform surroundings reconstruct selected RGB while preserving alpha and all known pixels', () => {
  const f = fixture()
  for (let y = 12; y < 18; y++) for (let x = 12; x < 18; x++) {
    const i = y * f.width + x
    f.mask[i] = 1
    f.rgba.set([255, 0, 0], i * 4)
  }
  const phases = []
  const output = remove_watermark(f.rgba, f.mask, f.width, f.height, 7, (p) => phases.push(p))
  assert.deepEqual(phases, ['Base fill', 'Texture synthesis'])
  for (let i = 0; i < f.mask.length; i++) {
    assert.equal(output[i * 4 + 3], f.rgba[i * 4 + 3])
    assert.deepEqual(output.slice(i * 4, i * 4 + 3), f.mask[i] ? new Uint8Array([100, 140, 180]) : f.rgba.slice(i * 4, i * 4 + 3))
  }
})

test('tiny images and edge selections reconstruct without out-of-bounds access', () => {
  for (const [width, height] of [[1, 2], [2, 1], [2, 2], [7, 7], [32, 32]]) {
    for (const index of [0, width * height - 1]) {
      const f = fixture(width, height)
      f.mask[index] = 1
      f.rgba.set([255, 0, 0], index * 4)
      const output = remove_watermark(f.rgba, f.mask, width, height, 1, () => {})
      assert.deepEqual(output.slice(index * 4, index * 4 + 3), new Uint8Array([100, 140, 180]))
    }
  }
})

test('texture synthesis is deterministic and leaves unselected bytes untouched', () => {
  const f = fixture(64, 48)
  for (let i = 0; i < f.rgba.length; i++) f.rgba[i] = (i * 31 + Math.floor(i / 71)) % 256
  for (let y = 15; y < 28; y++) for (let x = 20; x < 31; x++) f.mask[y * f.width + x] = 1
  const run = () => remove_watermark(f.rgba, f.mask, f.width, f.height, 123, () => {})
  const output = run()
  assert.deepEqual(output, run())
  for (let i = 0; i < f.mask.length; i++) {
    if (!f.mask[i]) assert.deepEqual(output.slice(i * 4, i * 4 + 4), f.rgba.slice(i * 4, i * 4 + 4))
  }
})

test('crop round-trip preserves pixels outside the selection and reduces the working set', () => {
  const f = fixture(1000, 800)
  const index = 400 * f.width + 500
  f.mask[index] = 1
  f.rgba.set([255, 0, 0], index * 4)
  const before = f.rgba.slice()
  const crop = cropRemoval(f.rgba, f.mask, f.width, f.height)
  assert.ok(crop.width * crop.height < f.width * f.height / 20)
  const output = remove_watermark(crop.pixels, crop.selection, crop.width, crop.height, 7, () => {})
  restoreCrop(f.rgba, f.width, crop, output)
  before.set([100, 140, 180], index * 4)
  assert.deepEqual(f.rgba, before)
})

test('undo drops oldest snapshots to stay within its byte budget', () => {
  const history = []
  const entry = (bytes) => ({ data: new Uint8Array(bytes) })
  const first = entry(8), second = entry(8)
  retainUndo(history, first, 12)
  retainUndo(history, second, 12)
  assert.deepEqual(history, [second])
  retainUndo(history, entry(20), 12)
  assert.deepEqual(history, [second])
})

class FakeWorker {
  terminated = false
  postMessage(message, transfers) { this.request = message; this.transfers = transfers }
  terminate() { this.terminated = true }
  emit(message) { this.onmessage({ data: message }) }
}
function clientFixture() {
  const workers = []
  const client = new ProcessingClient(() => { const w = new FakeWorker(); workers.push(w); return w })
  const input = () => ({ width: 2, height: 2, rgba: new ArrayBuffer(16), mask: new ArrayBuffer(4), seed: 1 })
  return { client, workers, input }
}

test('worker client transfers inputs, forwards progress, ignores stale IDs, and reuses its worker', async () => {
  const { client, workers, input } = clientFixture()
  const phases = []
  const pending = client.run(input(), (p) => phases.push(p))
  const worker = workers[0], id = worker.request.id
  assert.deepEqual(worker.transfers, [worker.request.rgba, worker.request.mask])
  worker.emit({ id: id - 1, type: 'error', message: 'stale' })
  worker.emit({ id, type: 'progress', phase: 'Base fill' })
  const output = new ArrayBuffer(16)
  worker.emit({ id, type: 'result', rgba: output })
  assert.equal(await pending, output)
  assert.deepEqual(phases, ['Base fill'])
  const next = client.run(input(), () => {})
  worker.emit({ id: worker.request.id, type: 'result', rgba: output })
  await next
  assert.equal(workers.length, 1)
  client.cancel()
})

test('cancellation terminates work and permits a fresh worker on retry', async () => {
  const { client, workers, input } = clientFixture()
  const pending = client.run(input(), () => {})
  client.cancel()
  await assert.rejects(pending, ProcessingCancelledError)
  assert.equal(workers[0].terminated, true)
  const next = client.run(input(), () => {})
  assert.equal(workers.length, 2)
  workers[1].emit({ id: workers[1].request.id, type: 'result', rgba: new ArrayBuffer(16) })
  await next
  client.cancel()
})

test('worker failures and invalid outputs reject and release the worker', async () => {
  for (const kind of ['error', 'invalid', 'crash', 'messageerror']) {
    const { client, workers, input } = clientFixture()
    const pending = client.run(input(), () => {})
    const w = workers[0], id = w.request.id
    if (kind === 'error') w.emit({ id, type: 'error', message: 'bad input' })
    if (kind === 'invalid') w.emit({ id, type: 'result', rgba: new ArrayBuffer(1) })
    if (kind === 'crash') w.onerror({ preventDefault() {} })
    if (kind === 'messageerror') w.onmessageerror()
    await assert.rejects(pending)
    assert.equal(w.terminated, true)
  }
})

test('resize calculates aspect fit and rejects invalid target sizes', () => {
  assert.deepEqual(resizeDimensions(4000, 3000, 1920, 1080, true), { targetWidth: 1440, targetHeight: 1080 })
  assert.deepEqual(resizeDimensions(4000, 3000, 1920, 1080, false), { targetWidth: 1920, targetHeight: 1080 })
  assert.throws(() => resizeDimensions(4000, 3000, NaN, 1080, true))
  assert.throws(() => resizeDimensions(4000, 3000, 99999, 1080, true))
})

test('WASM resize preserves identical dimensions and uniform opaque colors', () => {
  const f = fixture(16, 16)
  for (let i = 3; i < f.rgba.length; i += 4) f.rgba[i] = 255
  assert.deepEqual(resize_rgba(f.rgba, 16, 16, 16, 16), f.rgba)
  for (const [width, height] of [[1, 1], [7, 9], [32, 32]]) {
    const output = resize_rgba(f.rgba, 16, 16, width, height)
    assert.equal(output.length, width * height * 4)
    for (let i = 0; i < output.length; i += 4) {
      assert.deepEqual(output.slice(i, i + 4), new Uint8Array([100, 140, 180, 255]))
    }
  }
})

test('WASM resize handles transparent edges without leaking hidden colors', () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0])
  const output = resize_rgba(pixels, 2, 1, 1, 1)
  assert.ok(output[0] >= 250)
  assert.equal(output[1], 0)
  assert.equal(output[2], 0)
  assert.ok(output[3] >= 120 && output[3] <= 136)
  assert.deepEqual(resize_rgba(new Uint8Array(16), 2, 2, 1, 1), new Uint8Array(4))
})

test('WASM resize guards buffer sizes, allocation limits, and extreme reshapes', () => {
  assert.throws(() => resize_rgba(new Uint8Array(3), 1, 1, 2, 2), /buffer length/)
  assert.throws(() => resize_rgba(new Uint8Array(4), 1, 1, 4000, 4000), /12 megapixels/)
  assert.throws(() => resize_rgba(new Uint8Array(16384 * 4), 16384, 1, 1, 16384), /too much memory/)
})

test('worker resize validates different output buffer lengths and transfers source ownership', async () => {
  const { client, workers } = clientFixture()
  const input = { width: 4, height: 4, targetWidth: 2, targetHeight: 2, rgba: new ArrayBuffer(64) }
  const pending = client.resize(input)
  assert.equal(workers[0].request.operation, 'resize')
  assert.deepEqual(workers[0].transfers, [input.rgba])
  workers[0].emit({ id: workers[0].request.id, type: 'result', rgba: new ArrayBuffer(16) })
  assert.equal((await pending).byteLength, 16)
  await assert.rejects(client.resize({ ...input, targetWidth: NaN }))
  client.cancel()
})

test('packed PDF monochrome decoding respects row padding and bit order', () => {
  const output = pdfPixelsToRgba({ width: 9, height: 2, kind: 1, data: new Uint8Array([0b10101010, 0b10000000, 0, 0]) })
  const gray = Array.from({ length: 18 }, (_, i) => output[i * 4])
  assert.deepEqual(gray, [255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  for (let i = 3; i < output.length; i += 4) assert.equal(output[i], 255)
})

test('PDF RGB/RGBA decoding and atlas region validation reject malformed data', () => {
  assert.deepEqual(pdfPixelsToRgba({ width: 1, height: 1, kind: 2, data: new Uint8Array([1, 2, 3]) }), new Uint8ClampedArray([1, 2, 3, 255]))
  assert.deepEqual(pdfPixelsToRgba({ width: 1, height: 1, kind: 3, data: new Uint8Array([1, 2, 3, 4]) }), new Uint8ClampedArray([1, 2, 3, 4]))
  assert.throws(() => pdfPixelsToRgba({ width: 1, height: 1, kind: 1, data: new Uint8Array(4) }))
  assert.doesNotThrow(() => validatePdfRegion({ x: 1, y: 2, w: 3, h: 4 }, 10, 10))
  assert.throws(() => validatePdfRegion({ x: 9, y: 0, w: 3, h: 4 }, 10, 10))
  assert.throws(() => validatePdfRegion({ x: -1, y: 0, w: 3, h: 4 }, 10, 10))
})

test('Rust source-over composition respects destination alpha and opacity', () => {
  const base = new Uint8Array([0, 0, 255, 255])
  const mark = new Uint8Array([255, 0, 0, 255])
  assert.deepEqual(composite_rgba(base, 1, 1, mark, 1, 1, 0, 0, 0.5), new Uint8Array([128, 0, 128, 255]))
  assert.deepEqual(composite_rgba(new Uint8Array([0, 255, 0, 0]), 1, 1, mark, 1, 1, 0, 0, 0.5), new Uint8Array([255, 0, 0, 128]))
  assert.deepEqual(composite_rgba(base, 1, 1, new Uint8Array([1, 2, 3, 0]), 1, 1, 0, 0, 1), base)
  assert.deepEqual(composite_rgba(base, 1, 1, mark, 1, 1, 0, 0, 0), base)
})

test('Rust watermark clipping preserves untouched pixels, including extreme coordinates', () => {
  const base = new Uint8Array(4 * 4 * 4)
  const mark = new Uint8Array(2 * 2 * 4).fill(255)
  const result = composite_rgba(base, 4, 4, mark, 2, 2, -1, -1, 1)
  assert.deepEqual(result.slice(0, 4), new Uint8Array([255, 255, 255, 255]))
  assert.deepEqual(result.slice(4), base.slice(4))
  for (const offset of [-2147483648, 2147483647, 100]) assert.deepEqual(composite_rgba(base, 4, 4, mark, 2, 2, offset, offset, 1), base)
  assert.throws(() => composite_rgba(base, 4, 4, mark, 2, 2, 0, 0, NaN), /opacity/)
  assert.throws(() => composite_rgba(base, 4, 4, mark, 2, 2, 0, 0, 2), /opacity/)
  assert.throws(() => composite_rgba(base, 4, 4, mark, 1, 1, 0, 0, 1), /buffer/)
})

test('watermark positions share integer alignment between preview and export', () => {
  assert.deepEqual(watermarkPosition('top-left', 320, 200, 80, 20), { x: 24, y: 24 })
  assert.deepEqual(watermarkPosition('bottom-right', 320, 200, 80, 20), { x: 216, y: 156 })
  assert.deepEqual(watermarkPosition('center', 321, 201, 80, 20), { x: 121, y: 91 })
})

test('worker watermark export accepts PNG results and resets after cancellation', async () => {
  const { client, workers } = clientFixture()
  const input = () => ({ file: new Blob(['fixture']), width: 2, height: 2, mark: new ArrayBuffer(4), markWidth: 1, markHeight: 1, x: 0, y: 0, opacity: 0.5 })
  const pending = client.exportWatermark(input())
  assert.equal(workers[0].request.operation, 'watermark-export')
  assert.deepEqual(workers[0].transfers, [workers[0].request.mark])
  const blob = new Blob(['PNG fixture'], { type: 'image/png' })
  workers[0].emit({ id: workers[0].request.id, type: 'file', blob })
  assert.equal(await pending, blob)
  const next = client.exportWatermark(input())
  client.cancel()
  await assert.rejects(next, ProcessingCancelledError)
  const retry = client.exportWatermark(input())
  workers[1].emit({ id: workers[1].request.id, type: 'file', blob: new Blob(['wrong type']) })
  await assert.rejects(retry, /invalid result/)
  await assert.rejects(client.exportWatermark({ ...input(), opacity: NaN }), /opacity/)
  await assert.rejects(client.exportWatermark({ ...input(), mark: new ArrayBuffer(0) }), /buffer/)
})

test('Rust raster PDF parses with correct page dimensions and lossless RGB samples', async () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 123, 87, 45, 255])
  const bytes = create_raster_pdf(pixels, 2, 2, 595.275591, 841.889764)
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(), 1)
  const page = doc.getPage(0)
  assert.equal(page.getWidth(), 595.275591)
  assert.equal(page.getHeight(), 841.889764)
  const imageRef = page.node.Resources().lookup(PDFName.of('XObject')).get(PDFName.of('Im0'))
  const image = doc.context.lookup(imageRef, PDFRawStream)
  assert.equal(image.dict.get(PDFName.of('Width')).asNumber(), 2)
  assert.equal(image.dict.get(PDFName.of('Height')).asNumber(), 2)
  assert.deepEqual(new Uint8Array(inflateSync(image.getContents())), new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 123, 87, 45]))
  const text = Buffer.from(bytes).toString('latin1')
  const xref = Number(text.match(/startxref\n(\d+)/)[1])
  assert.equal(text.slice(xref, xref + 4), 'xref')
  const entries = text.slice(xref).split('\n').slice(3, 8)
  entries.forEach((entry, index) => assert.ok(text.slice(Number(entry.slice(0, 10))).startsWith((index + 1) + ' 0 obj')))
})

test('PDF transparency is flattened against white and invalid page inputs are rejected', async () => {
  const bytes = create_raster_pdf(new Uint8Array([0, 0, 0, 0, 255, 0, 0, 128]), 2, 1, 72, 36)
  const doc = await PDFDocument.load(bytes)
  const image = doc.context.lookup(doc.getPage(0).node.Resources().lookup(PDFName.of('XObject')).get(PDFName.of('Im0')), PDFRawStream)
  assert.deepEqual(new Uint8Array(inflateSync(image.getContents())), new Uint8Array([255, 255, 255, 255, 127, 127]))
  assert.throws(() => create_raster_pdf(new Uint8Array(3), 1, 1, 100, 100), /buffer/)
  assert.throws(() => create_raster_pdf(new Uint8Array(4), 1, 1, NaN, 100), /page dimensions/)
  assert.throws(() => create_raster_pdf(new Uint8Array(4), 1, 1, 14401, 100), /page dimensions/)
})

test('worker PDF requests transfer pixel ownership and accept only PDF file results', async () => {
  const { client, workers } = clientFixture()
  const input = () => ({ rgba: new ArrayBuffer(16), width: 2, height: 2, pageWidth: 595, pageHeight: 842 })
  const pending = client.rasterPdf(input())
  assert.equal(workers[0].request.operation, 'raster-pdf')
  assert.deepEqual(workers[0].transfers, [workers[0].request.rgba])
  const blob = new Blob(['%PDF fixture'], { type: 'application/pdf' })
  workers[0].emit({ id: workers[0].request.id, type: 'file', blob })
  assert.equal(await pending, blob)
  const next = client.rasterPdf(input())
  client.cancel()
  await assert.rejects(next, ProcessingCancelledError)
  await assert.rejects(client.rasterPdf({ ...input(), pageWidth: Infinity }), /page dimensions/)
})
