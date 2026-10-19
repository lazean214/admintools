/// <reference lib="webworker" />
import init, { fill_ejari, create_ejari_raster } from '../wasm/ejari/admintools_ejari.js'
import wasmUrl from '../wasm/ejari/admintools_ejari_bg.wasm?url'
import type { EjariRequest, EjariRasterRequest } from '../utils/processing-client'

const scope = self as unknown as DedicatedWorkerGlobalScope
let initialized: ReturnType<typeof init> | null = null
scope.onmessage = async ({ data }: MessageEvent<(EjariRequest | EjariRasterRequest) & { id: number }>) => {
  const { id } = data
  try {
    if (data.operation === 'ejari-raster') {
      if (!(data.rgba instanceof ArrayBuffer) || data.rgba.byteLength !== 1224 * 1584 * 4 * 3) throw new Error('Incomplete EJARI page images.')
      initialized ??= init({ module_or_path: wasmUrl })
      await initialized
      const output = create_ejari_raster(new Uint8Array(data.rgba))
      scope.postMessage({ id, type:'file', blob:new Blob([Uint8Array.from(output)], { type:'application/pdf' }) })
      return
    }
    if (data.operation !== 'ejari-pdf' || !(data.template instanceof ArrayBuffer) || data.template.byteLength > 2_000_000
      || !(data.text instanceof ArrayBuffer) || data.text.byteLength > 65536
      || !(data.offsets instanceof ArrayBuffer) || data.offsets.byteLength > 260 || data.offsets.byteLength % 4
      || !(data.placements instanceof ArrayBuffer) || data.placements.byteLength > 2048 || data.placements.byteLength % 8) throw new Error('Invalid EJARI export request.')
    initialized ??= init({ module_or_path: wasmUrl })
    await initialized
    const output = fill_ejari(new Uint8Array(data.template), new Uint8Array(data.text), new Uint32Array(data.offsets), new Float64Array(data.placements))
    scope.postMessage({ id, type:'file', blob:new Blob([Uint8Array.from(output)], { type:'application/pdf' }) })
  } catch (error) {
    scope.postMessage({ id, type:'error', message:error instanceof Error ? error.message : String(error) })
  }
}
