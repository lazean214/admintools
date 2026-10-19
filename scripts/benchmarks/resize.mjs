const button = document.querySelector('#run'), status = document.querySelector('#status'), results = document.querySelector('#results')
const blobFrom = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Encoding failed')), 'image/jpeg', 0.9))
const decode = async (blob) => {
  const url = URL.createObjectURL(blob)
  try { const image = new Image(); image.src = url; await image.decode(); return image }
  finally { URL.revokeObjectURL(url) }
}
const canvasOf = (width, height) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c }
const median = (samples) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]

async function fixture(width, height) {
  const c = canvasOf(width, height), context = c.getContext('2d')
  const image = context.createImageData(width, height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    image.data.set([(x * 255 / width + ((x ^ y) & 31)) % 256, y * 255 / height, ((x * 17 + y * 13) & 255), x % 97 < 12 ? 80 : 255], i)
  }
  context.putImageData(image, 0, 0)
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'))
}

async function canvasRun(blob, tw, th, high) {
  const start = performance.now(), image = await decode(blob), canvas = canvasOf(tw, th)
  const context = canvas.getContext('2d')
  if (high) context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, tw, th)
  await blobFrom(canvas)
  return performance.now() - start
}

async function wasmRun(worker, blob, width, height, targetWidth, targetHeight) {
  const start = performance.now(), image = await decode(blob)
  const source = canvasOf(width, height), ctx = source.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  const rgba = ctx.getImageData(0, 0, width, height).data.buffer
  const output = await new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data)
    worker.onerror = reject
    worker.postMessage({ rgba, width, height, targetWidth, targetHeight }, [rgba])
  })
  const destination = canvasOf(targetWidth, targetHeight)
  destination.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(output.rgba), targetWidth, targetHeight), 0, 0)
  await blobFrom(destination)
  source.width = source.height = destination.width = destination.height = 0
  return { total: performance.now() - start, kernel: output.kernelMs }
}

button.onclick = async () => {
  button.disabled = true
  const worker = new Worker('/worker.js', { type: 'module' })
  try {
    results.textContent = ''
    for (const [width, height, tw, th] of [[800, 600, 400, 300], [4000, 3000, 1920, 1440], [4000, 3000, 800, 600]]) {
      status.textContent = `Testing ${width} × ${height} → ${tw} × ${th}…`
      const blob = await fixture(width, height)
      const cold = await wasmRun(worker, blob, width, height, tw, th)
      const canvas = [], high = [], wasm = [], kernels = []
      for (let i = 0; i < 3; i++) {
        canvas.push(await canvasRun(blob, tw, th, false))
        const result = await wasmRun(worker, blob, width, height, tw, th)
        wasm.push(result.total); kernels.push(result.kernel)
        high.push(await canvasRun(blob, tw, th, true))
      }
      results.textContent += JSON.stringify({ input: [width, height], output: [tw, th], firstWasmMs: cold.total, canvasMedianMs: median(canvas), canvasHighMedianMs: median(high), wasmMedianMs: median(wasm), wasmKernelMedianMs: median(kernels), samples: { canvas, high, wasm } }, null, 2) + '\n'
    }
    status.textContent = 'Benchmark complete'
  } catch (error) { status.textContent = String(error) }
  finally { worker.terminate(); button.disabled = false }
}
