/// <reference lib="webworker" />
import { chooseObjectMask } from '../utils/smart-selection-mask'
import type { SelectionInput } from '../utils/smart-selection'

const scope = self as unknown as DedicatedWorkerGlobalScope
const MODEL = 'Xenova/slimsam-77-uniform'
const REVISION = '41cefaebe8f8880948ea21fc3ef641419b6a3ab3'
let model: import('@huggingface/transformers').SamModel | null = null
let processor: import('@huggingface/transformers').SamProcessor | null = null

scope.onmessage = async ({ data }: MessageEvent<SelectionInput>) => {
  const progress = (message: string) => scope.postMessage({ type: 'progress', message })
  try {
    const { width, height, x, y, rgba } = data
    if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 1024) || !(rgba instanceof ArrayBuffer) || rgba.byteLength !== width * height * 4) throw new Error('Could not read this image. Try the brush instead.')
    const { SamModel, AutoProcessor, RawImage, Tensor, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.useBrowserCache = true
    if (env.backends.onnx.wasm) {
      env.backends.onnx.wasm.wasmPaths = new URL('/onnx-selection/', self.location.origin).href
      env.backends.onnx.wasm.numThreads = 1
      env.backends.onnx.wasm.proxy = false
    }
    if (!model || !processor) {
      progress('Getting smart selection ready. First use may take a few minutes…')
      processor = await AutoProcessor.from_pretrained(MODEL, { revision: REVISION }) as import('@huggingface/transformers').SamProcessor
      // Quantized SlimSAM keeps the free CPU/WASM path available on ordinary devices.
      model = await SamModel.from_pretrained(MODEL, { revision: REVISION, device: 'wasm', dtype: 'q8' }) as import('@huggingface/transformers').SamModel
    }
    progress('Finding your object…')
    const image = new RawImage(new Uint8ClampedArray(rgba), width, height, 4)
    const tensors = new Set<import('@huggingface/transformers').Tensor>()
    const retain = (values: object) => { for (const value of Object.values(values)) if (value instanceof Tensor) tensors.add(value) }
    try {
      const inputs = await processor(image, { input_points: [[[x, y]]] }); retain(inputs)
      const embeddings = await model.get_image_embeddings(inputs); retain(embeddings)
      const outputs = await model({ ...inputs, ...embeddings }); retain(outputs)
      const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes); retain(masks)
      const mask = chooseObjectMask(masks[0].data, outputs.iou_scores.data, width, height, x, y)
      const buffer = mask.buffer as ArrayBuffer
      scope.postMessage({ type: 'result', mask: buffer }, [buffer])
    } finally { for (const tensor of tensors) tensor.dispose() }
  } catch {
    scope.postMessage({ type: 'error', message: 'Could not select this object. Check your connection on first use, or use the brush instead.' })
  }
}
