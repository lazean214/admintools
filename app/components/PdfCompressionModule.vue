<script setup lang="ts">
import { MAX_COMPRESSION_BYTES, type PdfCompressionLevel, type PdfCompressionResult } from '../utils/pdf-compression'

const file = ref<File | null>(null)
const level = ref<PdfCompressionLevel>('lossless')
const busy = ref(false)
const status = ref('Ready. Choose a PDF to begin.')
const result = ref<(Omit<PdfCompressionResult, 'bytes'> & { blob: Blob; url: string; fileName: string }) | null>(null)
let worker: Worker | null = null
let generation = 0
let disposed = false
function bytesLabel(bytes: number) { return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(2) + ' MB' }
const savings = computed(() => result.value ? Math.max(0, (1 - result.value.blob.size / result.value.originalBytes) * 100).toFixed(1) : '0')
function clearResult() { if (result.value) URL.revokeObjectURL(result.value.url); result.value = null }
function stopWorker() { worker?.terminate(); worker = null }
function cancel() { generation++; stopWorker(); busy.value = false; status.value = 'Compression cancelled. Your original file is unchanged.' }
function chooseFile(event: Event) {
  clearResult()
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  file.value = null
  if (!selected) { status.value = 'Ready. Choose a PDF to begin.'; return }
  if (!selected.size || selected.size > MAX_COMPRESSION_BYTES) { input.value = ''; status.value = 'Select a non-empty PDF up to 64 MB.'; return }
  file.value = selected
  status.value = 'Ready to compress ' + selected.name + '.'
}
async function compress() {
  if (!file.value || busy.value) return
  clearResult()
  const current = ++generation, selected = file.value, selectedLevel = level.value
  busy.value = true
  status.value = 'Reading PDF…'
  try {
    const bytes = await selected.arrayBuffer()
    if (disposed || current !== generation) return
    worker = new Worker(new URL('../workers/pdf-compression.worker.ts', import.meta.url), { type: 'module' })
    worker.onerror = () => {
      if (disposed || current !== generation) return
      status.value = 'Compression failed. Try a smaller PDF or the lossless option.'
      stopWorker(); busy.value = false
    }
    worker.onmessage = (event: MessageEvent) => {
      if (disposed || current !== generation) return
      const message = event.data
      if (message.type === 'progress') { status.value = message.message; return }
      if (message.type === 'result' && message.bytes instanceof ArrayBuffer) {
        const blob = new Blob([message.bytes], { type: 'application/pdf' })
        const fileName = message.keptOriginal ? selected.name : selected.name.replace(/\.pdf$/i, '') + '-compressed.pdf'
        result.value = { blob, url: URL.createObjectURL(blob), fileName, originalBytes: selected.size, pages: message.pages, imagesCompressed: message.imagesCompressed, streamsCompressed: message.streamsCompressed, imagesSkipped: message.imagesSkipped, keptOriginal: message.keptOriginal }
        status.value = message.keptOriginal ? 'No size reduction achieved. The original file is available below.' : 'Compression complete. Review the result before downloading.'
      } else status.value = message.message || 'Could not compress this PDF.'
      stopWorker(); busy.value = false
    }
    worker.postMessage({ bytes, level: selectedLevel }, [bytes])
  } catch (error) {
    if (disposed || current !== generation) return
    status.value = error instanceof Error ? error.message : 'Could not read this PDF.'
    stopWorker(); busy.value = false
  }
}
watch(level, () => { clearResult(); status.value = file.value ? 'Settings changed. Compress again to update the result.' : 'Ready. Choose a PDF to begin.' })
onBeforeUnmount(() => { disposed = true; generation++; stopWorker(); clearResult() })
</script>

<template>
  <section class="module-surface" aria-labelledby="compression-heading">
    <h2 id="compression-heading" class="module-title text-2xl font-bold">Make PDFs smaller</h2>
    <p class="mt-2 max-w-2xl text-sm text-slate-600">Compress locally in your browser. Text stays selectable, and pages are not flattened into images.</p>
    <p class="mt-1 text-xs text-slate-600">One PDF at a time, up to 64 MB and 300 pages. Encrypted and digitally signed PDFs are not supported.</p>
    <p class="status-pill mt-4" role="status" aria-live="polite">{{ status }}</p>

    <fieldset :disabled="busy" class="mt-5 grid gap-5 md:grid-cols-2">
      <label class="block text-sm font-semibold">
        PDF file
        <input type="file" accept=".pdf,application/pdf" class="field-control mt-2" @change="chooseFile">
        <span v-if="file" class="mt-2 block break-all text-xs font-normal text-slate-600">{{ file.name }} · {{ bytesLabel(file.size) }}</span>
      </label>
      <label class="block text-sm font-semibold">
        Compression level
        <select v-model="level" class="field-control mt-2">
          <option value="lossless">Lossless — preserve image quality</option>
          <option value="balanced">Balanced — smaller JPEG images</option>
          <option value="small">Smaller file — lower image quality</option>
        </select>
        <span class="mt-2 block text-xs font-normal text-slate-600">{{ level === 'lossless' ? 'Optimizes PDF structure and uncompressed streams without changing image quality.' : level === 'balanced' ? 'Recompresses supported JPEG images at 76% quality, up to 2400 pixels on the longest side.' : 'Recompresses supported JPEG images at 55% quality, up to 1600 pixels on the longest side.' }}</span>
      </label>
    </fieldset>
    <p v-if="level !== 'lossless'" class="mt-4 max-w-2xl text-sm text-slate-600">Other image formats, masked images and custom color profiles remain unchanged. Image-heavy PDFs may shrink more; already optimized PDFs may not shrink.</p>
    <div class="mt-5 flex flex-wrap gap-3">
      <button type="button" class="btn-primary min-h-11 disabled:opacity-60" :disabled="busy || !file" @click="compress">{{ busy ? 'Compressing…' : 'Compress PDF' }}</button>
      <button v-if="busy" type="button" class="btn-secondary min-h-11" @click="cancel">Cancel compression</button>
    </div>

    <div v-if="result" class="mt-6 border-t border-slate-200 pt-5">
      <h3 class="text-lg font-semibold">{{ result.keptOriginal ? 'Original kept' : 'Your compressed PDF' }}</h3>
      <dl class="mt-3 grid gap-4 sm:grid-cols-3">
        <div><dt class="text-sm text-slate-600">Original size</dt><dd class="mt-1 font-semibold">{{ bytesLabel(result.originalBytes) }}</dd></div>
        <div><dt class="text-sm text-slate-600">{{ result.keptOriginal ? 'Output size' : 'Compressed size' }}</dt><dd class="mt-1 font-semibold">{{ bytesLabel(result.blob.size) }}</dd></div>
        <div><dt class="text-sm text-slate-600">Size saved</dt><dd class="mt-1 font-semibold text-teal-800">{{ savings }}%</dd></div>
      </dl>
      <p class="mt-4 text-sm text-slate-600">{{ result.pages }} page(s) · {{ result.imagesCompressed }} image(s) recompressed · {{ result.streamsCompressed }} stream(s) compressed.</p>
      <p v-if="result.imagesSkipped" class="mt-2 text-sm text-slate-600">{{ result.imagesSkipped }} image(s) kept as-is because they were unsupported or could not be made smaller.</p>
      <p v-if="result.keptOriginal" class="mt-2 text-sm text-slate-600">This setting did not produce a smaller file. The original bytes have been kept.</p>
      <a :href="result.url" :download="result.fileName" class="btn-primary mt-4 inline-flex min-h-11 items-center">{{ result.keptOriginal ? 'Download original PDF' : 'Download compressed PDF' }}</a>
    </div>
  </section>
</template>
