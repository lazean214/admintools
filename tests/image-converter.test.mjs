import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeImageMagick, ImageMagick, ResourceLimits, MagickFormat, MagickReadSettings } from '@imagemagick/magick-wasm'
import { configurePhotoCodecs, transcodePhoto, photoCodecError } from '../app/utils/photo-codecs.ts'
import { CONVERTER_FORMATS, convertedPhotoName, validateConverterFiles, validateConverterOptions } from '../app/utils/image-converter.ts'
import { convertPhoto } from '../app/utils/image-converter-client.ts'

await initializeImageMagick(readFileSync(new URL('../node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm', import.meta.url)))
const heic = new Uint8Array(readFileSync(new URL('./fixtures/heic/example.heic', import.meta.url)))

test('HEIC internal images remain readable with the first-frame-only conversion', async () => {
  ResourceLimits.listLength = 1n
  assert.throws(() => transcodePhoto(heic, 'example.heic', { format: 'png', quality: 90 }, 12_000_000), /ListLengthExceedsLimit/)
  configurePhotoCodecs()
  const output = transcodePhoto(heic, 'example.heic', { format: 'png', quality: 90 }, 12_000_000)
  assert.equal(output.width, 1280)
  assert.equal(output.height, 854)
  assert.equal(output.blob.type, 'image/png')
  assert.deepEqual([...new Uint8Array(await output.blob.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
})

test('real HEIC converts to all advertised output formats with bounded previews', async () => {
  configurePhotoCodecs()
  for (const format of CONVERTER_FORMATS) {
    const output = transcodePhoto(heic, 'example.heic', { format: format.value, quality: 90 }, 50_000_000, true)
    assert.equal(output.blob.type, format.mime)
    const expected = format.value === 'ico' ? [256, 256] : [1280, 854]
    assert.deepEqual([output.width, output.height], expected)
    const encoded = new Uint8Array(await output.blob.arrayBuffer())
    const readSettings = new MagickReadSettings()
    if (format.value === 'ico') readSettings.format = MagickFormat.Ico
    ImageMagick.read(encoded, readSettings, (image) => {
      assert.deepEqual([image.width, image.height], expected)
      assert.equal(image.hasProfile('exif'), false)
    })
    ImageMagick.read(new Uint8Array(await output.preview.arrayBuffer()), (image) => {
      assert.ok(image.width <= 320 && image.height <= 240)
    })
  }
})

test('JPEG and BMP flatten transparency to white; PNG retains alpha', async () => {
  const transparent = ImageMagick.read('xc:none', (image) => image.write(MagickFormat.Png, (bytes) => new Uint8Array(bytes)))
  for (const format of ['jpg', 'bmp', 'png']) {
    const output = transcodePhoto(transparent, 'transparent.png', { format, quality: 100 }, 50_000_000)
    ImageMagick.read(new Uint8Array(await output.blob.arrayBuffer()), (image) => {
      image.getPixels((pixels) => {
        const color = pixels.getColor(0, 0)
        if (format === 'png') assert.equal(color.a, 0)
        else { assert.equal(color.r, 255); assert.equal(color.g, 255); assert.equal(color.b, 255) }
      })
    })
  }
})

test('conversion limits and damaged input produce actionable failures', () => {
  assert.throws(() => validateConverterFiles([new File([], 'empty.heic')]), /non-empty/)
  assert.throws(() => validateConverterFiles(Array.from({ length: 33 }, () => new File(['x'], 'a.png'))), /32/)
  assert.throws(() => validateConverterOptions({ format: 'heic', quality: 90 }), /supported output/)
  assert.throws(() => validateConverterOptions({ format: 'jpg', quality: NaN }), /quality/)
  assert.throws(() => transcodePhoto(heic, 'example.heic', { format: 'jpg', quality: 90 }, 1), /megapixel limit/)
  assert.throws(() => transcodePhoto(new Uint8Array([1, 2, 3]), 'bad.heic', { format: 'jpg', quality: 90 }, 50_000_000))
  assert.match(photoCodecError('large.heic', new Error('This photo exceeds the 50 megapixel limit.')), /50 megapixel/)
  assert.match(photoCodecError('bad.heic', new Error('Unsupported codec')), /Unsupported codec/)
})

test('output filenames avoid traversal and case-insensitive ZIP collisions', () => {
  const used = new Set()
  assert.equal(convertedPhotoName('Photo.HEIC', 'jpg', '-converted', used), 'Photo-converted.jpg')
  assert.equal(convertedPhotoName('photo.png', 'jpg', '-converted', used), 'photo-converted-2.jpg')
  assert.equal(convertedPhotoName('../unsafe/file.heic', 'png', '/suffix', used), 'file_suffix.png')
})

test('cancelling conversion terminates the codec worker and rejects the pending result', async () => {
  const originalWorker = globalThis.Worker
  let instance
  globalThis.Worker = class {
    constructor() { instance = this }
    postMessage(message) { this.message = message }
    terminate() { this.terminated = true }
  }
  try {
    const task = convertPhoto(new File(['data'], 'photo.heic'), { format: 'jpg', quality: 90 })
    task.cancel()
    await assert.rejects(task.result, /cancelled/)
    assert.equal(instance.terminated, true)
    assert.equal(instance.message.options.format, 'jpg')
  } finally { globalThis.Worker = originalWorker }
})
