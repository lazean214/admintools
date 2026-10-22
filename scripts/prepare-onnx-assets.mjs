import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await mkdir(resolve(root, 'public/onnx'), { recursive: true })
for (const name of await readdir(resolve(root, 'node_modules/onnxruntime-web/dist'))) {
  if (!/^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(name)) continue
  await copyFile(resolve(root, 'node_modules/onnxruntime-web/dist', name), resolve(root, 'public/onnx', name))
}
