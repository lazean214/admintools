// Optional real-model smoke test: node scripts/check-object-model.mjs path/to/lama_fp32.onnx
import * as ort from 'onnxruntime-web/wasm'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

if (!process.argv[2]) throw new Error('Pass the downloaded LaMa ONNX model path.')
ort.env.wasm.numThreads = 1
const model = await ort.InferenceSession.create(new Uint8Array(await readFile(process.argv[2])), { executionProviders: ['wasm'] })
const image = new ort.Tensor('float32', new Float32Array(3 * 512 * 512).fill(0.5), [1, 3, 512, 512])
const maskData = new Float32Array(512 * 512)
for (let y = 240; y < 272; y++) maskData.fill(1, y * 512 + 240, y * 512 + 272)
const mask = new ort.Tensor('float32', maskData, [1, 1, 512, 512])
try {
  const result = await model.run({ image, mask })
  try {
    const output = result.output
    assert.deepEqual(output.dims, [1, 3, 512, 512])
    assert.ok(output.data.every(Number.isFinite))
    assert.ok(Math.abs(output.data[0] - 127.5) < 2, 'Output must use the expected 0–255 scale')
    console.log('LaMa WASM inference passed: correct shape, finite RGB, expected output scale.')
  } finally { for (const tensor of Object.values(result)) tensor.dispose() }
} finally {
  image.dispose(); mask.dispose(); await model.release()
}
