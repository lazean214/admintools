import { ProcessingClient, ProcessingCancelledError } from '/processing-client.js'
import { createWatermarkStamp } from '/watermark-utils.js'

const status = document.querySelector('#status'), results = document.querySelector('#results'), button = document.querySelector('#run')
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const png = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
async function imageFrom(blob) {
  const url = URL.createObjectURL(blob)
  try { const image = new Image(); image.src = url; await image.decode(); return image }
  finally { URL.revokeObjectURL(url) }
}
button.onclick = async () => {
  button.disabled = true; results.textContent = ''; document.querySelector('#previews').replaceChildren()
  const client = new ProcessingClient(() => new Worker('/worker-production.js', { type: 'module' }))
  try {
    status.textContent = 'Verifying…'
    const base = makeCanvas(160, 100), context = base.getContext('2d')
    const pixels = context.createImageData(160, 100)
    for (let i = 0; i < 160 * 100; i++) pixels.data.set([i % 256, (i * 3) % 256, 180, 96 + i % 160], i * 4)
    context.putImageData(pixels, 0, 0)
    const file = await png(base), baseImage = await imageFrom(file)
    const mark = makeCanvas(24, 12), markCtx = mark.getContext('2d')
    markCtx.fillStyle = '#ff0000'; markCtx.fillRect(0, 0, 24, 12)
    markCtx.clearRect(0, 0, 12, 6)
    const markImage = await imageFrom(await png(mark))
    let count = 0
    for (const type of ['text', 'image']) for (const position of ['top-left', 'center', 'bottom-right']) {
      const options = { type, text: 'Agj Test', color: '#ffffff', size: 24, opacity: 0.35, position, scale: 0.5 }
      const stamp = createWatermarkStamp(160, 100, options, markImage)
      const reference = makeCanvas(160, 100), ref = reference.getContext('2d')
      ref.drawImage(baseImage, 0, 0); ref.globalAlpha = options.opacity; ref.drawImage(stamp.canvas, stamp.x, stamp.y)
      const expected = ref.getImageData(0, 0, 160, 100).data
      const input = () => ({ file, width: 160, height: 100, mark: stamp.canvas.getContext('2d').getImageData(0, 0, stamp.canvas.width, stamp.canvas.height).data.buffer, markWidth: stamp.canvas.width, markHeight: stamp.canvas.height, x: stamp.x, y: stamp.y, opacity: stamp.opacity })
      const blob = await client.exportWatermark(input())
      const bitmap = await createImageBitmap(blob)
      if (bitmap.width !== 160 || bitmap.height !== 100 || blob.type !== 'image/png') throw new Error('Wrong exported format/dimensions')
      const actualCanvas = makeCanvas(160, 100), actualCtx = actualCanvas.getContext('2d')
      actualCtx.drawImage(bitmap, 0, 0); bitmap.close()
      const actual = actualCtx.getImageData(0, 0, 160, 100).data
      let maxAlpha = 0, maxPremultiplied = 0
      for (let i = 0; i < actual.length; i += 4) {
        maxAlpha = Math.max(maxAlpha, Math.abs(actual[i + 3] - expected[i + 3]))
        for (let c = 0; c < 3; c++) maxPremultiplied = Math.max(maxPremultiplied, Math.abs(actual[i + c] * actual[i + 3] / 255 - expected[i + c] * expected[i + 3] / 255))
      }
      // Canvas keeps premultiplied bytes internally. Readback, straight-alpha
      // composition, and PNG round-trips can each round a least-significant bit.
      if (maxAlpha > 1 || maxPremultiplied > 3) throw new Error(`${type}/${position}: Canvas parity failed: alpha ${maxAlpha}, color ${maxPremultiplied}`)
      results.textContent += `PASS ${type}/${position}: alpha difference ≤ ${maxAlpha}, premultiplied color difference ≤ ${maxPremultiplied.toFixed(2)}\n`
      count++
      if (type === 'text' && position === 'center') document.querySelector('#previews').append(reference, actualCanvas)
      const pending = client.exportWatermark(input())
      client.cancel()
      try { await pending; throw new Error('Cancellation did not reject') } catch (error) { if (!(error instanceof ProcessingCancelledError)) throw error }
      await client.exportWatermark(input())
      stamp.canvas.width = stamp.canvas.height = 0
    }
    results.textContent += 'PASS cancellation and fresh-worker retry after every case\n'
    status.textContent = `Passed: ${count} text/image cases, PNG export, cancellation and retry`
  } catch (error) { status.textContent = 'FAILED: ' + String(error) }
  finally { client.cancel(); button.disabled = false }
}
