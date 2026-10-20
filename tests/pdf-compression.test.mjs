import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib'
import init, { PdfEditorDocument } from '../app/wasm/ejari/admintools_ejari.js'
import { compressPdf, validatePdfCompressionInput, MAX_COMPRESSION_BYTES } from '../app/utils/pdf-compression.ts'

await init({ module_or_path: await readFile(new URL('../app/wasm/ejari/admintools_ejari_bg.wasm', import.meta.url)) })
const jpeg = new Uint8Array(await readFile(new URL('./fixtures/compression-photo.jpg', import.meta.url)))
const n = (key) => PDFName.of(key)
async function fixture(withImage = false) {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Compression regression fixture')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([600, 800])
  page.drawText('Selectable original text', { x: 40, y: 740, font, size: 18 })
  const extra = pdf.context.register(pdf.context.stream(new TextEncoder().encode('% repeated content for lossless compression\n'.repeat(2000))))
  page.node.addContentStream(extra)
  const field = pdf.getForm().createTextField('reference')
  field.setText('FORM-123')
  field.addToPage(page, { x: 40, y: 680, width: 200, height: 30 })
  if (withImage) {
    const image = await pdf.embedJpg(jpeg)
    page.drawImage(image, { x: 40, y: 150, width: 480, height: 480 })
  }
  return pdf
}

test('lossless compression reduces size while retaining text, form values, metadata and page geometry', async () => {
  const pdf = await fixture()
  const source = await pdf.save({ useObjectStreams: false })
  const progress = []
  const result = await compressPdf(source, 'lossless', undefined, (message) => progress.push(message))
  assert.ok(result.bytes.length < source.length)
  assert.equal(result.keptOriginal, false)
  assert.equal(result.pages, 1)
  assert.ok(result.streamsCompressed >= 1)
  assert.equal(result.imagesCompressed, 0)
  const reopened = await PDFDocument.load(result.bytes)
  assert.equal(reopened.getTitle(), 'Compression regression fixture')
  assert.equal(reopened.getForm().getTextField('reference').getText(), 'FORM-123')
  assert.equal(reopened.getPage(0).getWidth(), 600)
  assert.equal(reopened.getPage(0).getHeight(), 800)
  const text = new PdfEditorDocument(result.bytes)
  try { assert.ok(JSON.parse(text.inspect(0)).texts.some((run) => run.text === 'Selectable original text')) } finally { text.free() }
  assert.ok(progress.includes('Writing optimized PDF…'))
  await mkdir(new URL('../tmp/pdfs/', import.meta.url), { recursive: true })
  await writeFile(new URL('../tmp/pdfs/compression-original.pdf', import.meta.url), source)
  await writeFile(new URL('../tmp/pdfs/compression-lossless.pdf', import.meta.url), result.bytes)
})

test('already compact PDFs return exactly the original bytes when optimization does not help', async () => {
  const pdf = await PDFDocument.create()
  pdf.addPage([400, 500])
  const first = await compressPdf(await pdf.save(), 'lossless')
  const second = await compressPdf(first.bytes, 'lossless')
  assert.equal(second.keptOriginal, true)
  assert.deepEqual(second.bytes, first.bytes)
})

test('input guards reject oversized, malformed, encrypted and signed documents', async () => {
  assert.throws(() => validatePdfCompressionInput(new Uint8Array(), 'lossless'), /64 MB/)
  assert.throws(() => validatePdfCompressionInput(new Uint8Array(MAX_COMPRESSION_BYTES + 1), 'lossless'), /64 MB/)
  assert.throws(() => validatePdfCompressionInput(new TextEncoder().encode('not a PDF'), 'lossless'), /header/)
  await assert.rejects(compressPdf(new TextEncoder().encode('%PDF-1.7\ninvalid'), 'lossless'), /damaged or unsupported/)
  const pdf = await fixture()
  const bytes = await pdf.save()
  assert.throws(() => validatePdfCompressionInput(bytes, 'invalid'), /level/)
  // Direct dictionaries are scanned as well as indirect signature objects.
  pdf.catalog.set(n('SignatureTest'), pdf.context.obj({ Type: 'Sig', ByteRange: [0, 100, 200, 300] }))
  await assert.rejects(compressPdf(await pdf.save(), 'balanced'), /digital signature/)
  const encrypted = await fixture()
  encrypted.context.trailerInfo.Encrypt = encrypted.context.register(encrypted.context.obj({ Filter: 'Standard', V: 1 }))
  await assert.rejects(compressPdf(await encrypted.save(), 'lossless'), /encrypted/)
})

test('JPEG recompression replaces supported image streams without rasterizing the page', async () => {
  const pdf = await fixture(true)
  await pdf.flush()
  for (const [ref, stream] of pdf.context.enumerateIndirectObjects()) {
    if (stream instanceof PDFRawStream && stream.dict.get(n('Filter')) === n('DCTDecode')) {
      const padded = new Uint8Array(stream.contents.length + 50000)
      padded.set(stream.contents)
      pdf.context.assign(ref, PDFRawStream.of(stream.dict.clone(pdf.context), padded))
    }
  }
  const source = await pdf.save({ useObjectStreams: false })
  let calls = 0
  const result = await compressPdf(source, 'balanced', async (input) => {
    calls++
    assert.equal(input.quality, 0.76)
    assert.equal(input.maxSide, 2400)
    return { bytes: jpeg, width: input.width, height: input.height }
  })
  assert.equal(calls, 1)
  assert.equal(result.imagesCompressed, 1)
  const reopened = await PDFDocument.load(result.bytes)
  assert.equal(reopened.getForm().getTextField('reference').getText(), 'FORM-123')
  const images = reopened.context.enumerateIndirectObjects().map(([, obj]) => obj).filter((obj) => obj instanceof PDFRawStream && obj.dict.get(n('Subtype')) === n('Image'))
  assert.equal(images.length, 1)
  assert.deepEqual(images[0].contents, jpeg)
  await writeFile(new URL('../tmp/pdfs/compression-photo-original.pdf', import.meta.url), source)
  await writeFile(new URL('../tmp/pdfs/compression-photo-result.pdf', import.meta.url), result.bytes)
})

test('lossless mode never reencodes images; unsupported masks and encoder failures keep images intact', async () => {
  const pdf = await fixture(true)
  const source = await pdf.save()
  let calls = 0
  await compressPdf(source, 'lossless', async () => { calls++; throw new Error('must not run') })
  assert.equal(calls, 0)
  const failed = await compressPdf(source, 'small', async () => { calls++; throw new Error('Unsupported image') })
  assert.equal(calls, 1)
  assert.equal(failed.imagesCompressed, 0)
  assert.equal(failed.imagesSkipped, 1)
  for (const [, stream] of pdf.context.enumerateIndirectObjects()) {
    if (stream instanceof PDFRawStream && stream.dict.get(n('Filter')) === n('DCTDecode')) stream.dict.set(n('Mask'), pdf.context.obj([0, 0, 0, 0, 0, 0]))
  }
  const masked = await compressPdf(await pdf.save(), 'balanced', async () => { throw new Error('must not run') })
  assert.equal(masked.imagesCompressed, 0)
  assert.equal(masked.imagesSkipped, 1)
  const reopened = await PDFDocument.load(masked.bytes)
  const image = reopened.context.enumerateIndirectObjects().find(([, obj]) => obj instanceof PDFRawStream && obj.dict.get(n('Subtype')) === n('Image'))[1]
  assert.deepEqual(image.contents, jpeg)
})
