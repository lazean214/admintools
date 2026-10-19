<script setup lang="ts">
import JSZip from 'jszip'
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'
import { resizeDimensions, validateDimensions } from '../utils/processing'

type ResizePreviewImage = { id: string; name: string; previewUrl: string; width: number; height: number; sizeKb: number }
const status = ref('Ready')
const resizeFiles = ref<File[]>([])
const resizeWidth = ref(1920)
const resizeHeight = ref(1080)
const resizeKeepAspect = ref(true)
const resizeFormat = ref<'original' | 'png' | 'jpg' | 'webp'>('original')
const resizeMethod = ref<'standard' | 'lanczos'>('standard')
const resizeQuality = ref(90)
const resizeBusy = ref(false)
const resizeLoading = ref(false)
const resizePreviews = ref<ResizePreviewImage[]>([])
const processor = new ProcessingClient(() => new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' }))
let generation = 0
let disposed = false
let cancelled = false

function setStatus(message: string) { status.value = message }
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
async function readImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not load ' + file.name + '.'))
      image.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the resized image.')), mime, quality))
}
function clearResizePreviews() {
  for (const image of resizePreviews.value) URL.revokeObjectURL(image.previewUrl)
  resizePreviews.value = []
}
async function onResizeFilesChange(event: Event) {
  if (resizeBusy.value) return
  const current = ++generation
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  const previews: ResizePreviewImage[] = []
  let published = false
  clearResizePreviews()
  resizeFiles.value = []
  resizeLoading.value = true
  setStatus('Loading previews…')
  try {
    if (files.length > 32 || files.some((file) => file.size > 32 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) {
      throw new Error('Select up to 32 images, 32 MB each and 128 MB in total.')
    }
    // Decode one at a time instead of holding every full-resolution image at once.
    for (const [index, file] of files.entries()) {
      const image = await readImage(file)
      if (disposed || generation !== current) return
      validateDimensions(image.width, image.height)
      previews.push({ id: String(index), name: file.name, previewUrl: URL.createObjectURL(file), width: image.width, height: image.height, sizeKb: Math.max(1, Math.round(file.size / 1024)) })
    }
    resizePreviews.value = previews
    published = true
    resizeFiles.value = files
    setStatus(files.length ? 'Ready. Choose your output dimensions and filter.' : 'Ready')
  } catch (error) {
    if (disposed || generation !== current) return
    setStatus(error instanceof Error ? error.message : 'Could not load previews.')
    target.value = ''
  } finally {
    if (!published) for (const image of previews) URL.revokeObjectURL(image.previewUrl)
    if (generation === current) resizeLoading.value = false
  }
}
function assertActive() {
  if (disposed || cancelled) throw new ProcessingCancelledError()
}
function cancelResize() {
  cancelled = true
  processor.cancel()
  setStatus('Cancelling…')
}
async function resizeImages() {
  if (resizeBusy.value || resizeLoading.value) return
  if (!resizeFiles.value.length) { setStatus('Select image files first.'); return }
  const options = { width: resizeWidth.value, height: resizeHeight.value, keepAspect: resizeKeepAspect.value, format: resizeFormat.value, quality: resizeQuality.value, method: resizeMethod.value }
  resizeBusy.value = true
  cancelled = false
  const outputs: Array<{ name: string; blob: Blob }> = []
  const usedNames = new Set<string>()
  let totalBytes = 0
  try {
    for (const [index, file] of resizeFiles.value.entries()) {
      assertActive()
      setStatus('Resizing image ' + (index + 1) + ' of ' + resizeFiles.value.length + '…')
      const image = await readImage(file)
      assertActive()
      const { targetWidth, targetHeight } = resizeDimensions(image.width, image.height, options.width, options.height, options.keepAspect)
      const canvas = document.createElement('canvas')
      try {
        canvas.width = targetWidth
        canvas.height = targetHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not create the output canvas.')
        if (options.method === 'lanczos') {
          const source = document.createElement('canvas')
          let rgba: ArrayBuffer
          try {
            source.width = image.width
            source.height = image.height
            const sourceContext = source.getContext('2d', { willReadFrequently: true })
            if (!sourceContext) throw new Error('Could not read the image pixels.')
            sourceContext.drawImage(image, 0, 0)
            rgba = sourceContext.getImageData(0, 0, image.width, image.height).data.buffer as ArrayBuffer
          } finally { source.width = source.height = 0 }
          const result = await processor.resize({ rgba, width: image.width, height: image.height, targetWidth, targetHeight })
          assertActive()
          context.putImageData(new ImageData(new Uint8ClampedArray(result), targetWidth, targetHeight), 0, 0)
        } else {
          context.drawImage(image, 0, 0, targetWidth, targetHeight)
        }
        const extension = options.format === 'original' ? file.name.split('.').pop()?.toLowerCase() || 'png' : options.format
        const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png'
        const blob = await canvasToBlob(canvas, mime, mime === 'image/png' ? 1 : options.quality / 100)
        assertActive()
        totalBytes += blob.size
        if (totalBytes > 128 * 1024 * 1024) throw new Error('Outputs exceed 128 MB. Resize fewer images at a time.')
        const actualExtension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
        const base = file.name.replace(/\.[^/.]+$/, '') + '-resized'
        let name = base + '.' + actualExtension, suffix = 2
        while (usedNames.has(name)) name = base + '-' + suffix++ + '.' + actualExtension
        usedNames.add(name)
        outputs.push({ name, blob })
      } finally { canvas.width = canvas.height = 0 }
    }
    assertActive()
    if (outputs.length === 1) downloadBlob(outputs[0]!.blob, outputs[0]!.name)
    else {
      setStatus('Preparing ZIP…')
      const zip = new JSZip()
      for (const output of outputs) zip.file(output.name, output.blob)
      const blob = await zip.generateAsync({ type: 'blob' }, assertActive)
      assertActive()
      downloadBlob(blob, 'resized-images.zip')
    }
    setStatus('Done. Resized ' + outputs.length + ' image(s).')
  } catch (error) {
    if (!disposed) setStatus(error instanceof ProcessingCancelledError ? 'Resize cancelled. No files were downloaded.' : error instanceof Error ? error.message : 'Resize failed. Try a smaller batch.')
  } finally { resizeBusy.value = false }
}
onBeforeUnmount(() => {
  disposed = true
  generation++
  cancelled = true
  processor.cancel()
  clearResizePreviews()
})
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Resize Images</h2>
    <p class="mt-2 text-sm text-slate-600">Upload one or more images, review previews, then export resized files.</p>
    <p class="mt-1 text-xs text-slate-500">Up to 32 images, 12 megapixels and 32 MB each; 128 MB per batch.</p>
    <p class="status-pill mt-3" role="status" aria-live="polite">{{ status }}</p>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="rounded-2xl bg-white/70 p-4">
        <span class="mb-2 block text-sm font-semibold">Input Images</span>
        <input type="file" accept="image/*" multiple class="field-control" :disabled="resizeBusy || resizeLoading" @change="onResizeFilesChange" >
      </label>
      <fieldset class="grid gap-3 rounded-2xl bg-white/70 p-4 sm:grid-cols-2" :disabled="resizeBusy || resizeLoading">
        <label class="text-sm font-semibold">
          Width
          <input v-model.number="resizeWidth" type="number" min="1" class="field-control mt-1" >
        </label>
        <label class="text-sm font-semibold">
          Height
          <input v-model.number="resizeHeight" type="number" min="1" class="field-control mt-1" >
        </label>
        <label class="text-sm font-semibold">
          Output Format
          <select v-model="resizeFormat" class="field-control mt-1">
            <option value="original">Original</option>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
        </label>
        <label class="text-sm font-semibold">
          Quality ({{ resizeQuality }}%)
          <input v-model.number="resizeQuality" type="range" min="10" max="100" class="mt-2 w-full" >
        </label>
        <label class="text-sm font-semibold sm:col-span-2">
          Resampling filter
          <select v-model="resizeMethod" class="field-control mt-1">
            <option value="standard">Standard</option>
            <option value="lanczos">Lanczos</option>
          </select>
          <span class="mt-1 block text-xs font-normal text-slate-600">Lanczos uses a consistent filter for fine detail and may take longer.</span>
        </label>
        <label class="sm:col-span-2 inline-flex items-center gap-2 text-sm font-semibold">
          <input v-model="resizeKeepAspect" type="checkbox" >
          Keep aspect ratio
        </label>
      </fieldset>
    </div>

    <div v-if="resizePreviews.length" class="mt-5 space-y-3">
      <p class="text-sm font-semibold text-slate-700">Uploaded Previews ({{ resizePreviews.length }})</p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="image in resizePreviews"
          :key="image.id"
          class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <img :src="image.previewUrl" :alt="image.name" class="h-40 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain">
          <div class="mt-3 space-y-1 text-sm text-slate-700">
            <p class="truncate font-semibold" :title="image.name">{{ image.name }}</p>
            <p>{{ image.width }} × {{ image.height }} px</p>
            <p>{{ image.sizeKb }} KB</p>
          </div>
        </article>
      </div>
    </div>

    <button class="btn-primary mt-4 disabled:opacity-60" :disabled="resizeBusy || resizeLoading || !resizeFiles.length" @click="resizeImages">
      {{ resizeBusy ? 'Resizing...' : 'Resize Images' }}
    </button>
    <button v-if="resizeBusy" class="btn-secondary ml-2" @click="cancelResize">Cancel resize</button>
  </section>
</template>
