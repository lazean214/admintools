<script setup lang="ts">
import JSZip from 'jszip'
import { MAX_COMPRESSION_BYTES, type PdfCompressionLevel, type PdfCompressionResult, type PdfCustomCompressionSettings } from '../utils/pdf-compression'
import { collectPdfImageTargets } from '../utils/pdf-compression-analysis'

const MAX_BATCH_FILES = 20
const MAX_BATCH_BYTES = 256 * 1024 * 1024
type CompressedFile = Omit<PdfCompressionResult, 'bytes'> & { blob: Blob; fileName: string }
type BatchEntry = { originalName: string; result?: CompressedFile; error?: string }
const files = ref<File[]>([])
const level = ref<PdfCompressionLevel>('maximum')
const quality = ref(50)
const dpi = ref(80)
const busy = ref(false)
const status = ref('Ready. Choose one or more PDFs to begin.')
const result = ref<{ url: string | null; fileName: string; entries: BatchEntry[] } | null>(null)
let worker: Worker | null = null
let rejectActiveWorker: ((error: Error) => void) | null = null
let generation = 0
let disposed = false
function bytesLabel(bytes: number) { return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(2) + ' MB' }
const successfulEntries = computed(() => result.value?.entries.flatMap((entry) => entry.result ? [entry.result] : []) ?? [])
const totalOriginalBytes = computed(() => successfulEntries.value.reduce((sum, entry) => sum + entry.originalBytes, 0))
const totalOutputBytes = computed(() => successfulEntries.value.reduce((sum, entry) => sum + entry.blob.size, 0))
const savings = computed(() => totalOriginalBytes.value ? Math.max(0, (1 - totalOutputBytes.value / totalOriginalBytes.value) * 100).toFixed(1) : '0')
function clearResult() { if (result.value?.url) URL.revokeObjectURL(result.value.url); result.value = null }
function stopWorker() {
  rejectActiveWorker?.(new Error('Compression cancelled.'))
  rejectActiveWorker = null
  worker?.terminate()
  worker = null
}
function cancel() { generation++; stopWorker(); busy.value = false; status.value = 'Compression cancelled. Your original files are unchanged.' }
function chooseFiles(event: Event) {
  clearResult()
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  files.value = []
  if (!selected.length) { status.value = 'Ready. Choose one or more PDFs to begin.'; return }
  if (selected.length > MAX_BATCH_FILES) {
    input.value = ''
    status.value = `Select no more than ${MAX_BATCH_FILES} PDFs at once.`
    return
  }
  if (selected.some((file) => !file.size || file.size > MAX_COMPRESSION_BYTES)) {
    input.value = ''
    status.value = 'Each PDF must be non-empty and no larger than 64 MB.'
    return
  }
  if (selected.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) {
    input.value = ''
    status.value = 'Selected PDFs must total no more than 256 MB.'
    return
  }
  files.value = selected
  status.value = `${selected.length} PDF(s) ready to compress.`
}
function uniqueName(fileName: string, used: Set<string>) {
  const base = fileName.replace(/\.pdf$/i, '') || 'document'
  let candidate = base + '.pdf', suffix = 2
  while (used.has(candidate.toLowerCase())) candidate = `${base}-${suffix++}.pdf`
  used.add(candidate.toLowerCase())
  return candidate
}
async function compressOne(file: File, selectedLevel: PdfCompressionLevel, customSettings: PdfCustomCompressionSettings, current: number, index: number, total: number) {
  const bytes = await file.arrayBuffer()
  if (disposed || current !== generation) throw new Error('Compression cancelled.')
  let imageTargets: [string, number][] | undefined
  if (selectedLevel === 'maximum' || selectedLevel === 'custom') {
    try {
      status.value = `File ${index} of ${total}: ${file.name} — measuring image resolution…`
      const targetDpi = selectedLevel === 'custom' ? customSettings.dpi : 80
      imageTargets = [...(await collectPdfImageTargets(new Uint8Array(bytes), targetDpi,
        (message) => { status.value = `File ${index} of ${total}: ${file.name} — ${message}` })).entries()]
    } catch (error) {
      const detail = error instanceof Error ? ` (${error.message})` : ''
      status.value = `File ${index} of ${total}: image resolution measurement failed${detail}; continuing with an estimate.`
    }
  }
  if (disposed || current !== generation) throw new Error('Compression cancelled.')
  const activeWorker = new Worker(new URL('../workers/pdf-compression.worker.ts', import.meta.url), { type: 'module' })
  worker = activeWorker
  try {
    return await new Promise<CompressedFile>((resolve, reject) => {
      rejectActiveWorker = reject
        activeWorker.onerror = (event: ErrorEvent) => {
          const detail = event.message && event.message !== 'Script error.' ? `: ${event.message}` : ''
          reject(new Error(`PDF worker failed while processing "${file.name}"${detail}.`))
        }
      activeWorker.onmessage = (event: MessageEvent) => {
        if (disposed || current !== generation) { reject(new Error('Compression cancelled.')); return }
        const message = event.data
        if (message.type === 'progress') {
          status.value = `File ${index} of ${total}: ${file.name} — ${message.message}`
          return
        }
        if (message.type === 'result' && message.bytes instanceof ArrayBuffer) {
          const blob = new Blob([message.bytes], { type: 'application/pdf' })
          resolve({
            blob,
            fileName: message.keptOriginal ? file.name : file.name.replace(/\.pdf$/i, '') + '-compressed.pdf',
            originalBytes: file.size,
            pages: message.pages,
            imagesCompressed: message.imagesCompressed,
            streamsCompressed: message.streamsCompressed,
            imagesSkipped: message.imagesSkipped,
            keptOriginal: message.keptOriginal,
          })
        } else if (message.type === 'error') {
          reject(new Error(typeof message.message === 'string' && message.message ? message.message : 'PDF worker reported an error without details.'))
        } else if (message.type === 'result') {
          reject(new Error(`PDF worker returned an invalid result (${Object.prototype.toString.call(message.bytes)}).`))
        } else {
          reject(new Error(`Unexpected PDF worker response (${String(message.type)}).`))
        }
      }
      activeWorker.postMessage({ bytes, level: selectedLevel, imageTargets, customSettings }, [bytes])
    })
  } finally {
    activeWorker.terminate()
    if (worker === activeWorker) worker = null
    rejectActiveWorker = null
  }
}
async function compress() {
  if (!files.value.length || busy.value) return
  clearResult()
  const current = ++generation, selectedFiles = [...files.value], selectedLevel = level.value
  const customSettings = { quality: quality.value, dpi: dpi.value }
  busy.value = true
  const entries: BatchEntry[] = []
  const usedNames = new Set<string>()
  try {
    for (let index = 0; index < selectedFiles.length; index++) {
      const file = selectedFiles[index]!
      if (disposed || current !== generation) return
      status.value = `Compressing file ${index + 1} of ${selectedFiles.length}: ${file.name}`
      try {
        const compressed = await compressOne(file, selectedLevel, customSettings, current, index + 1, selectedFiles.length)
        compressed.fileName = uniqueName(compressed.fileName, usedNames)
        entries.push({ originalName: file.name, result: compressed })
      } catch (error) {
        if (disposed || current !== generation) return
        entries.push({ originalName: file.name, error: error instanceof Error ? error.message : 'Could not compress this PDF.' })
      }
    }
    if (disposed || current !== generation) return
    const successful = entries.flatMap((entry) => entry.result ? [entry.result] : [])
    let url: string | null = null
    if (successful.length) {
      const zip = new JSZip()
      for (const entry of successful) zip.file(entry.fileName, entry.blob, { compression: 'STORE' })
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      if (disposed || current !== generation) return
      url = URL.createObjectURL(blob)
    }
    result.value = { url, fileName: 'compressed-pdfs.zip', entries }
    const failed = entries.length - successful.length
    status.value = failed ? `Finished ${successful.length} PDF(s); ${failed} could not be compressed.` : `Compression complete for ${successful.length} PDF(s).`
  } catch (error) {
    if (disposed || current !== generation) return
    status.value = error instanceof Error ? error.message : 'Could not prepare compressed PDFs.'
  } finally {
    if (current === generation) {
      stopWorker()
      busy.value = false
    }
  }
}
watch([level, quality, dpi], () => { clearResult(); status.value = files.value.length ? 'Settings changed. Compress again to update the result.' : 'Ready. Choose one or more PDFs to begin.' })
onBeforeUnmount(() => { disposed = true; generation++; stopWorker(); clearResult() })
</script>

<template>
  <section class="module-surface" aria-labelledby="compression-heading">
    <h2 id="compression-heading" class="module-title text-2xl font-bold">Make PDFs smaller</h2>
    <p class="mt-2 max-w-2xl text-sm text-slate-600">Compress locally in your browser. Text stays selectable, pages are not flattened, and document metadata is removed from the compressed PDF.</p>
    <p class="mt-1 text-xs text-slate-600">Select up to 20 PDFs (256 MB total; 64 MB per PDF, 300 pages each). Files are compressed one at a time and downloaded together as a ZIP.</p>
    <p class="status-pill mt-4" role="status" aria-live="polite">{{ status }}</p>

    <fieldset :disabled="busy" class="mt-5 grid gap-5 md:grid-cols-2">
      <label class="block text-sm font-semibold">
        PDF files
        <input type="file" accept=".pdf,application/pdf" multiple class="field-control mt-2" @change="chooseFiles">
        <span v-if="files.length" class="mt-2 block text-xs font-normal text-slate-600">{{ files.length }} file(s) · {{ bytesLabel(files.reduce((sum, item) => sum + item.size, 0)) }} total</span>
        <span v-if="files.length" class="mt-2 block max-h-32 overflow-y-auto text-xs font-normal text-slate-600">{{ files.map((item) => item.name).join(' · ') }}</span>
      </label>
      <label class="block text-sm font-semibold">
        Compression level
        <select v-model="level" class="field-control mt-2">
          <option value="lossless">Lossless — preserve image quality</option>
          <option value="balanced">Balanced — smaller JPEG images</option>
          <option value="small">Smaller file — lower image quality</option>
          <option value="maximum">Maximum — target 80% smaller</option>
          <option value="custom">Custom — choose quality and DPI</option>
        </select>
        <span class="mt-2 block text-xs font-normal text-slate-600">{{ level === 'lossless' ? 'Optimizes PDF structure and uncompressed streams without changing image quality.' : level === 'balanced' ? 'Recompresses supported RGB and grayscale images at 76% quality, up to 2400 pixels on the longest side.' : level === 'small' ? 'Recompresses supported RGB and grayscale images at 55% quality, up to 1600 pixels on the longest side.' : level === 'maximum' ? 'Maximum compression uses 50% JPEG quality and targets 80 DPI from each image’s page placement. Savings depend on PDF contents.' : 'Choose the JPEG quality and target resolution for embedded RGB and grayscale images.' }}</span>
      </label>
    </fieldset>
    <fieldset v-if="level === 'custom'" :disabled="busy" class="mt-4 grid gap-5 md:grid-cols-2">
      <label class="block text-sm font-semibold">Image quality: {{ quality }}%
        <input v-model.number="quality" type="range" min="10" max="100" step="5" class="mt-3 w-full">
        <span class="block text-xs font-normal text-slate-600">Lower quality usually makes images and the PDF smaller.</span>
      </label>
      <label class="block text-sm font-semibold">Target resolution: {{ dpi }} DPI
        <input v-model.number="dpi" type="range" min="75" max="300" step="5" class="mt-3 w-full">
        <span class="block text-xs font-normal text-slate-600">Calculated from each image’s size on the PDF page; higher DPI preserves more detail.</span>
      </label>
    </fieldset>
    <p v-if="level !== 'lossless'" class="mt-4 max-w-2xl text-sm text-slate-600">Supported images are optimized across every page. Image quality is reduced; images with transparency, masks, custom color profiles or unsupported encodings remain unchanged.</p>
    <div class="mt-5 flex flex-wrap gap-3">
      <button type="button" class="btn-primary min-h-11 disabled:opacity-60" :disabled="busy || !files.length" @click="compress">{{ busy ? 'Compressing…' : files.length > 1 ? `Compress ${files.length} PDFs` : 'Compress PDF' }}</button>
      <button v-if="busy" type="button" class="btn-secondary min-h-11" @click="cancel">Cancel compression</button>
    </div>

    <div v-if="result" class="mt-6 border-t border-slate-200 pt-5">
      <h3 class="text-lg font-semibold">Batch compression results</h3>
      <dl class="mt-3 grid gap-4 sm:grid-cols-3">
        <div><dt class="text-sm text-slate-600">Original total</dt><dd class="mt-1 font-semibold">{{ bytesLabel(totalOriginalBytes) }}</dd></div>
        <div><dt class="text-sm text-slate-600">Output total</dt><dd class="mt-1 font-semibold">{{ bytesLabel(totalOutputBytes) }}</dd></div>
        <div><dt class="text-sm text-slate-600">Size saved</dt><dd class="mt-1 font-semibold text-teal-800">{{ savings }}%</dd></div>
      </dl>
      <ul class="mt-4 space-y-3">
        <li v-for="(entry, index) in result.entries" :key="index" class="rounded-lg border border-slate-200 p-3 text-sm">
          <template v-if="entry.result">
            <p class="break-all font-semibold">{{ entry.originalName }} → {{ entry.result.fileName }}</p>
            <p class="mt-1 text-slate-600">{{ bytesLabel(entry.result.originalBytes) }} → {{ bytesLabel(entry.result.blob.size) }} · {{ entry.result.pages }} page(s) · {{ entry.result.imagesCompressed }} image(s) recompressed<span v-if="entry.result.keptOriginal"> · original kept</span></p>
          </template>
          <template v-else>
            <p class="break-all font-semibold">{{ entry.originalName }}</p>
            <p class="mt-1 text-rose-700">{{ entry.error }}</p>
          </template>
        </li>
      </ul>
      <p v-if="successfulEntries.length && level === 'maximum' && Number(savings) < 80" class="mt-3 text-sm text-slate-600">The 80% savings goal was not reached for this batch; PDF contents and unsupported images affect compression.</p>
      <a v-if="result.url" :href="result.url" :download="result.fileName" class="btn-primary mt-4 inline-flex min-h-11 items-center">Download compressed PDFs (ZIP)</a>
      <p v-else class="mt-3 text-sm text-rose-700">No PDFs could be compressed. Choose supported files and try again.</p>
    </div>
  </section>
</template>
