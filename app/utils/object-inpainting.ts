import { cropRemoval, restoreCrop } from './processing'

// Model contract and license: https://huggingface.co/edgetools/lama
const MODEL_URL = 'https://huggingface.co/edgetools/lama/resolve/d3f22ee032d32d9a68ac06dd3da40aba1f831f1d/lama_fp32.onnx'
const SIZE = 512
let session: import('onnxruntime-web').InferenceSession | null = null
let provider = 'WASM'

async function loadModel(progress: (phase: string) => void) {
  const ort = await import('onnxruntime-web/webgpu')
  ort.env.wasm.wasmPaths = new URL('/onnx/', self.location.origin).href
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  if (session) return { ort, session }
  progress('Downloading AI model (first use may take several minutes)')
  let response: Response | undefined
  try { response = await (await caches.open('object-remover-lama-v1')).match(MODEL_URL) } catch { /* Cache is optional. */ }
  if (!response) {
    response = await fetch(MODEL_URL)
    if (!response.ok) throw new Error('Could not download the AI model. Check your connection or choose Texture repair.')
    try { await (await caches.open('object-remover-lama-v1')).put(MODEL_URL, response.clone()) } catch { /* Storage may be full. */ }
  }
  const model = await response.arrayBuffer()
  if ('gpu' in navigator) {
    try {
      progress('Preparing AI with WebGPU')
      session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu', 'wasm'] })
      provider = 'WebGPU / WASM'
    } catch { /* Unsupported operators/devices fall back to WASM. */ }
  }
  if (!session) {
    progress('Preparing AI with WASM')
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
    provider = 'WASM'
  }
  return { ort, session }
}

export async function inpaintObjects(pixels: Uint8Array, mask: Uint8Array, width: number, height: number, progress: (phase: string) => void) {
  const crop = cropRemoval(pixels, mask, width, height)
  const { ort, session: model } = await loadModel(progress)
  const canvas = new OffscreenCanvas(crop.width, crop.height)
  const context = canvas.getContext('2d')
  const input = new OffscreenCanvas(SIZE, SIZE)
  const inputContext = input.getContext('2d', { willReadFrequently: true })
  if (!context || !inputContext) throw new Error('AI image editing is unavailable in this browser. Choose Texture repair.')
  context.putImageData(new ImageData(new Uint8ClampedArray(crop.pixels), crop.width, crop.height), 0, 0)
  inputContext.drawImage(canvas, 0, 0, SIZE, SIZE)
  const rgba = inputContext.getImageData(0, 0, SIZE, SIZE).data
  const plane = SIZE * SIZE
  const image = new Float32Array(plane * 3)
  const selection = new Float32Array(plane)
  // Max-pool masks so thin brush strokes survive reduction to model resolution.
  for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
    if (!crop.selection[y * crop.width + x]) continue
    const left = Math.floor(x * SIZE / crop.width), right = Math.ceil((x + 1) * SIZE / crop.width)
    const top = Math.floor(y * SIZE / crop.height), bottom = Math.ceil((y + 1) * SIZE / crop.height)
    for (let sy = top; sy < bottom; sy++) selection.fill(1, sy * SIZE + left, sy * SIZE + right)
  }
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) image[c * plane + i] = rgba[i * 4 + c]! / 255
  const feeds = { image: new ort.Tensor('float32', image, [1, 3, SIZE, SIZE]), mask: new ort.Tensor('float32', selection, [1, 1, SIZE, SIZE]) }
  let outputs: Awaited<ReturnType<typeof model.run>> | undefined
  try {
    progress(`Reconstructing object background with AI (${provider})`)
    try { outputs = await model.run(feeds) }
    catch (error) {
      if (provider === 'WASM') throw error
      await model.release()
      session = null
      provider = 'WASM'
      progress('Retrying AI with WASM')
      session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] })
      outputs = await session.run(feeds)
    }
    const output = outputs[Object.keys(outputs)[0]!]!
    if (output.data.length !== plane * 3 || output.dims.join(',') !== '1,3,512,512') throw new Error('The AI model returned an unexpected image.')
    const data = output.data as Float32Array
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) {
        const value = data[c * plane + i]!
        if (!Number.isFinite(value)) throw new Error('AI reconstruction failed. Choose Texture repair and retry.')
        rgba[i * 4 + c] = Math.round(Math.max(0, Math.min(255, value)))
      }
      rgba[i * 4 + 3] = 255
    }
    inputContext.putImageData(new ImageData(rgba, SIZE, SIZE), 0, 0)
    context.drawImage(input, 0, 0, crop.width, crop.height)
    const fill = context.getImageData(0, 0, crop.width, crop.height).data
    // Keep every unselected pixel and original alpha byte exactly intact.
    for (let i = 0; i < crop.selection.length; i++) if (crop.selection[i]) {
      for (let c = 0; c < 3; c++) crop.pixels[i * 4 + c] = fill[i * 4 + c]!
    }
    restoreCrop(pixels, width, crop, crop.pixels)
  } finally {
    feeds.image.dispose(); feeds.mask.dispose()
    if (outputs) for (const tensor of Object.values(outputs)) tensor.dispose()
  }
}
