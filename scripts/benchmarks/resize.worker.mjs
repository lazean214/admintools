import init, { resize_rgba } from '/wasm.js'
const initialized = init({ module_or_path: '/admintools_processing_bg.wasm' })
self.onmessage = async ({ data }) => {
  try {
    await initialized
    const start = performance.now()
    const output = resize_rgba(new Uint8Array(data.rgba), data.width, data.height, data.targetWidth, data.targetHeight)
    self.postMessage({ rgba: output.buffer, kernelMs: performance.now() - start }, [output.buffer])
  } catch (error) { self.postMessage({ error: String(error) }) }
}
