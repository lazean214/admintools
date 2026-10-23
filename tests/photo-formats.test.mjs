import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ImageMagick, initializeImageMagick, MagickFormat, MagickReadSettings, Magick } from '@imagemagick/magick-wasm'
import { PHOTO_ACCEPT, isRawPhoto } from '../app/utils/photo-formats.ts'

test('file picker includes photos whose operating system supplies no image MIME', () => {
  for (const extension of ['heic', 'heif', 'cr3', 'dng', 'nef', 'arw', 'tiff', 'psd', 'jxl']) {
    assert.ok(PHOTO_ACCEPT.split(',').includes('.' + extension))
  }
  assert.equal(isRawPhoto('PHOTO.CR2'), true)
  assert.equal(isRawPhoto('photo.NEF'), true)
  assert.equal(isRawPhoto('photo.tiff'), false)
})

test('local WASM decodes extended raster formats to browser-readable PNG', async () => {
  await initializeImageMagick(readFileSync(new URL('../node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm', import.meta.url)))
  assert.match(Magick.delegates, /heic/)
  assert.match(Magick.delegates, /raw/)
  for (const format of [MagickFormat.Tiff, MagickFormat.Psd, MagickFormat.Jxl, MagickFormat.Jp2]) {
    const input = ImageMagick.read('xc:red', (image) => image.write(format, (bytes) => new Uint8Array(bytes)))
    const settings = new MagickReadSettings()
    settings.frameCount = 1
    const output = ImageMagick.read(input, settings, (image) => {
      image.autoOrient()
      return image.write(MagickFormat.Png, (bytes) => new Uint8Array(bytes))
    })
    assert.deepEqual([...output.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  }
})
