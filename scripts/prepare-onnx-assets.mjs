import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
await mkdir(resolve(root, 'public/onnx'), { recursive: true })
for (const name of await readdir(resolve(root, 'node_modules/onnxruntime-web/dist'))) {
  if (!/^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(name)) continue
  await copyFile(resolve(root, 'node_modules/onnxruntime-web/dist', name), resolve(root, 'public/onnx', name))
}

// Transformers.js pins its own ONNX Runtime; never mix its binaries with LaMa's.
const requireForSelection = createRequire(resolve(root, 'node_modules/@huggingface/transformers/package.json'))
const selectionDist = dirname(requireForSelection.resolve('onnxruntime-web'))
await mkdir(resolve(root, 'public/onnx-selection'), { recursive: true })
for (const name of await readdir(selectionDist)) {
  if (!/^ort-wasm.*\.(mjs|wasm)$/.test(name)) continue
  await copyFile(resolve(selectionDist, name), resolve(root, 'public/onnx-selection', name))
}
