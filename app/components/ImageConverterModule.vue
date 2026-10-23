<script setup lang="ts">
import JSZip from 'jszip'
import { PHOTO_ACCEPT } from '../utils/photo-formats'
import { CONVERTER_FORMATS, convertedPhotoName, validateConverterFiles, type ConverterFormat } from '../utils/image-converter'
import { convertPhoto, type ConvertedPhoto } from '../utils/image-converter-client'

type PhotoRow = { id: number; file: File; state: 'ready' | 'converting' | 'done' | 'error'; error?: string; output?: ConvertedPhoto; name?: string; url?: string; previewUrl?: string }
const rows = ref<PhotoRow[]>([])
const format = ref<ConverterFormat>('jpg')
const quality = ref(90)
const suffix = ref('-converted')
const busy = ref(false)
const packing = ref(false)
const dragging = ref(false)
const status = ref('Choose photos to get started.')
const selectionError = ref('')
const completed = computed(() => rows.value.filter((row) => row.state === 'done' && row.output))
let nextId = 0
let version = 0
let cancelActive: (() => void) | undefined
let disposed = false

function bytes(size: number) { return size < 1024 * 1024 ? (size / 1024).toFixed(1) + ' KB' : (size / 1024 / 1024).toFixed(2) + ' MB' }
function release(row: PhotoRow) {
  if (row.url) URL.revokeObjectURL(row.url)
  if (row.previewUrl) URL.revokeObjectURL(row.previewUrl)
  row.output = undefined; row.url = undefined; row.previewUrl = undefined; row.name = undefined; row.error = undefined
}
function addFiles(files: File[]) {
  if (busy.value || packing.value) return
  selectionError.value = ''
  const additions = files.filter((file, index) => !rows.value.some((row) => row.file.name === file.name && row.file.size === file.size && row.file.lastModified === file.lastModified)
    && files.findIndex((other) => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === index)
  try {
    validateConverterFiles([...rows.value.map((row) => row.file), ...additions])
    rows.value.push(...additions.map((file) => ({ id: nextId++, file, state: 'ready' as const })))
    status.value = rows.value.length ? rows.value.length + ' photo(s) ready. Choose an output format, then convert.' : 'Choose photos to get started.'
  } catch (error) { selectionError.value = error instanceof Error ? error.message : 'Could not add these files.' }
}
function selectFiles(event: Event) {
  const target = event.target as HTMLInputElement
  addFiles(Array.from(target.files || []))
  target.value = ''
}
function dropFiles(event: DragEvent) {
  dragging.value = false
  addFiles(Array.from(event.dataTransfer?.files || []))
}
function removeRow(row: PhotoRow) {
  release(row)
  rows.value = rows.value.filter((item) => item.id !== row.id)
  status.value = rows.value.length ? rows.value.length + ' photo(s) selected.' : 'Choose photos to get started.'
}
function clearFiles() {
  for (const row of rows.value) release(row)
  rows.value = []
  selectionError.value = ''
  status.value = 'Choose photos to get started.'
}
function cancel() {
  version++
  cancelActive?.()
  cancelActive = undefined
  for (const row of rows.value) if (row.state === 'converting') row.state = 'ready'
  busy.value = false
  status.value = 'Conversion cancelled. Completed photos are still available to download.'
}
async function convertAll() {
  if (busy.value || packing.value || !rows.value.length) return
  const current = ++version
  const options = { format: format.value, quality: quality.value }
  const outputSuffix = suffix.value
  const usedNames = new Set<string>()
  let outputBytes = 0
  busy.value = true
  for (const row of rows.value) { release(row); row.state = 'ready' }
  try {
    for (const [index, row] of rows.value.entries()) {
      if (disposed || current !== version) return
      row.state = 'converting'
      status.value = 'Converting ' + (index + 1) + ' of ' + rows.value.length + ': ' + row.file.name
      try {
        const task = convertPhoto(row.file, options)
        cancelActive = task.cancel
        const output = await task.result
        if (disposed || current !== version) return
        if (outputBytes + output.blob.size > 128 * 1024 * 1024) throw new Error('Converted files exceed the 128 MB batch limit. Remove some photos or choose a smaller output format.')
        outputBytes += output.blob.size
        row.output = output
        row.name = convertedPhotoName(row.file.name, options.format, outputSuffix, usedNames)
        row.url = URL.createObjectURL(output.blob)
        if (output.preview) row.previewUrl = URL.createObjectURL(output.preview)
        row.state = 'done'
      } catch (error) {
        if (disposed || current !== version) return
        row.state = 'error'
        row.error = error instanceof Error ? error.message : 'Conversion failed. Try another photo.'
      } finally { if (current === version) cancelActive = undefined }
    }
    const failed = rows.value.filter((row) => row.state === 'error').length
    status.value = 'Converted ' + completed.value.length + ' of ' + rows.value.length + ' photo(s).' + (failed ? ' ' + failed + ' failed; review the errors below. Successful photos are ready to download.' : ' Your files are ready to download.')
  } finally { if (current === version) busy.value = false }
}
async function downloadZip() {
  if (busy.value || packing.value || !completed.value.length) return
  packing.value = true
  const current = version
  try {
    const zip = new JSZip()
    for (const row of completed.value) zip.file(row.name!, row.output!.blob)
    const blob = await zip.generateAsync({ type: 'blob' })
    if (disposed || version !== current) return
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'converted-images.zip'
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch { if (!disposed) status.value = 'Could not prepare the ZIP. Download the converted photos individually.' }
  finally { packing.value = false }
}
onBeforeUnmount(() => {
  disposed = true
  version++
  cancelActive?.()
  for (const row of rows.value) release(row)
})
</script>

<template>
  <section class="module-surface" aria-labelledby="converter-title">
    <h2 id="converter-title" class="module-title text-2xl font-bold">Change the format. Keep the photo.</h2>
    <p class="mt-2 max-w-3xl text-sm text-slate-600">Convert HEIC/HEIF, camera RAW, TIFF, PNG, JPG, WebP and more. Photos stay in your browser. Dimensions stay the same, with camera orientation applied.</p>
    <p class="mt-2 text-xs text-slate-600">Up to 32 photos, 64 MB each, 128 MB per batch and 50 megapixels per photo. Camera and codec support varies. Animated and multi-page files use the first frame.</p>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <div class="flex min-h-52 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors" :class="dragging ? 'border-teal-700 bg-teal-50' : 'border-slate-300 bg-white/60'" @dragover.prevent="dragging = !busy && !packing" @dragleave.prevent="dragging = false" @drop.prevent="dropFiles">
        <svg aria-hidden="true" class="mb-3 h-8 w-8 text-teal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4" /></svg>
        <p class="font-semibold text-slate-800">Drop photos here</p>
        <p class="mt-1 text-sm text-slate-600">or choose files from your device</p>
        <label class="mt-4 block w-full max-w-sm text-left text-sm font-semibold">Add photos
          <input type="file" :accept="PHOTO_ACCEPT" multiple :disabled="busy || packing" class="field-control mt-1 w-full" @change="selectFiles">
        </label>
        <p class="mt-3 text-xs text-slate-600">HEIC is an input format; export to one of the formats alongside.</p>
      </div>
      <fieldset class="space-y-4" :disabled="busy || packing">
        <legend class="sr-only">Conversion settings</legend>
        <label class="block text-sm font-semibold">Convert to
          <select v-model="format" class="field-control mt-1 w-full">
            <option v-for="option in CONVERTER_FORMATS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label class="block text-sm font-semibold">Quality ({{ quality }}%)
          <input v-model.number="quality" type="range" min="10" max="100" :disabled="!['jpg', 'webp'].includes(format)" class="mt-2 w-full accent-teal-700">
          <span class="mt-1 block text-xs font-normal text-slate-600">{{ ['jpg', 'webp'].includes(format) ? 'Higher quality produces larger files.' : 'This format uses lossless output; quality does not apply.' }}</span>
        </label>
        <label class="block text-sm font-semibold">Filename suffix
          <input v-model="suffix" type="text" maxlength="60" class="field-control mt-1 w-full" placeholder="-converted">
        </label>
        <p class="text-xs text-slate-600">Metadata is removed. JPG and BMP use a white background for transparency. ICO fits on a transparent 256 × 256 px canvas.</p>
      </fieldset>
    </div>

    <p v-if="selectionError" class="mt-4 text-sm text-red-700" role="alert">{{ selectionError }}</p>
    <div class="mt-5 flex flex-wrap items-center gap-3">
      <button type="button" class="btn-primary min-h-11 disabled:opacity-60" :disabled="busy || packing || !rows.length" @click="convertAll">{{ busy ? 'Converting…' : 'Convert photos' }}</button>
      <button v-if="busy" type="button" class="btn-secondary min-h-11" @click="cancel">Cancel conversion</button>
      <button v-if="rows.length" type="button" class="btn-secondary min-h-11" :disabled="busy || packing" @click="clearFiles">Clear files</button>
      <NuxtLink to="/image-resize" class="text-sm font-semibold text-teal-800 underline underline-offset-4">Need to resize?</NuxtLink>
    </div>
    <p class="mt-4 text-sm text-slate-700" role="status" aria-live="polite">{{ status }}</p>

    <section v-if="rows.length" class="mt-7" aria-labelledby="converter-files-title">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 id="converter-files-title" class="text-lg font-bold">Photos ({{ rows.length }})</h3>
        <button v-if="completed.length" type="button" class="btn-secondary min-h-11" :disabled="busy || packing" @click="downloadZip">{{ packing ? 'Preparing ZIP…' : 'Download ZIP (' + completed.length + ')' }}</button>
      </div>
      <ul class="divide-y divide-slate-200 border-y border-slate-200">
        <li v-for="row in rows" :key="row.id" class="flex flex-wrap items-start gap-3 py-4 sm:flex-nowrap">
          <div class="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            <img v-if="row.previewUrl" :src="row.previewUrl" :alt="'Converted preview of ' + row.file.name" class="h-full w-full object-contain">
            <span v-else class="px-1 text-center text-xs font-semibold uppercase text-slate-600">{{ row.file.name.split('.').pop()?.slice(0, 8) || 'Photo' }}</span>
          </div>
          <div class="min-w-0 flex-1 basis-[calc(100%-6rem)] sm:basis-auto">
            <p class="break-words text-sm font-semibold text-slate-900">{{ row.file.name }}</p>
            <p class="mt-1 text-xs text-slate-600">{{ bytes(row.file.size) }} · {{ row.state === 'ready' ? 'Ready to convert' : row.state === 'converting' ? 'Converting…' : row.state === 'done' ? 'Converted' : 'Conversion failed' }}</p>
            <p v-if="row.output" class="mt-1 break-words text-sm text-teal-800">{{ row.name }} · {{ row.output.width }} × {{ row.output.height }} px · {{ bytes(row.output.blob.size) }}</p>
            <p v-if="row.error" class="mt-2 break-words text-sm text-red-700">{{ row.error }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <a v-if="row.url" :href="row.url" :download="row.name" class="btn-secondary inline-flex min-h-11 items-center" :aria-label="'Download ' + row.name">Download</a>
            <button type="button" class="btn-secondary min-h-11" :disabled="busy || packing" :aria-label="'Remove ' + row.file.name" @click="removeRow(row)">Remove</button>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>
