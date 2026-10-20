<script setup lang="ts">
import JSZip from 'jszip'
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'
import { imageResizeRegion, validateDimensions } from '../utils/processing'

type ResizePreviewImage = { id: string; name: string; previewUrl: string; width: number; height: number; sizeKb: number; cropX: number; cropY: number; cropScale: number }
const status = ref('Ready')
const resizeFiles = ref<File[]>([])
const resizeWidth = ref(1920)
const resizeHeight = ref(1080)
const resolutionPresets = [
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: 'Square', width: 1080, height: 1080 },
  { name: 'Portrait', width: 1080, height: 1350 },
  { name: 'Story', width: 1080, height: 1920 },
  { name: 'HD', width: 1280, height: 720 },
]
const selectedPreset = computed(() => resolutionPresets.find((p) => p.width === resizeWidth.value && p.height === resizeHeight.value)?.name || '')
function applyPreset(event: Event) {
  const preset = resolutionPresets.find((p) => p.name === (event.target as HTMLSelectElement).value)
  if (preset) { resizeWidth.value = preset.width; resizeHeight.value = preset.height }
}
function resetCrop(image: ResizePreviewImage) { image.cropX = 50; image.cropY = 50; image.cropScale = 1 }
const cropCorners = ['nw', 'ne', 'sw', 'se'] as const
const resizeMode = ref<'crop' | 'fit'>('crop')
const validOutput = computed(() => {
  try { validateDimensions(resizeWidth.value, resizeHeight.value); return true } catch { return false }
})
function outputSize(image: ResizePreviewImage) {
  if (!validOutput.value) return 'Enter valid output dimensions'
  const { targetWidth, targetHeight } = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, resizeMode.value)
  return targetWidth + ' × ' + targetHeight + ' px'
}
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

function cropBoxStyle(image: ResizePreviewImage) {
  const region = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop', image.cropX, image.cropY, image.cropScale)
  return { left: region.sourceX / image.width * 100 + '%', top: region.sourceY / image.height * 100 + '%', width: region.sourceWidth / image.width * 100 + '%', height: region.sourceHeight / image.height * 100 + '%' }
}
let cropDrag: { image: ResizePreviewImage; pointerId: number; x: number; y: number; cropX: number; cropY: number; travelX: number; travelY: number } | null = null
function startCropDrag(event: PointerEvent, image: ResizePreviewImage) {
  if (resizeBusy.value || resizeLoading.value || !validOutput.value || !event.isPrimary || event.button !== 0) return
  const box = event.currentTarget as HTMLButtonElement
  const bounds = box.parentElement!.parentElement!.getBoundingClientRect()
  const region = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop', image.cropX, image.cropY, image.cropScale)
  cropDrag = { image, pointerId: event.pointerId, x: event.clientX, y: event.clientY, cropX: image.cropX, cropY: image.cropY, travelX: bounds.width * (1 - region.sourceWidth / image.width), travelY: bounds.height * (1 - region.sourceHeight / image.height) }
  box.setPointerCapture(event.pointerId)
  box.focus({ preventScroll: true })
  event.preventDefault()
}
function moveCropDrag(event: PointerEvent) {
  const drag = cropDrag
  if (!drag || drag.pointerId !== event.pointerId || resizeBusy.value) return
  if (drag.travelX > 0.01) drag.image.cropX = Math.max(0, Math.min(100, drag.cropX + (event.clientX - drag.x) / drag.travelX * 100))
  if (drag.travelY > 0.01) drag.image.cropY = Math.max(0, Math.min(100, drag.cropY + (event.clientY - drag.y) / drag.travelY * 100))
}
function endCropDrag(event: PointerEvent) {
  if (cropDrag?.pointerId !== event.pointerId) return
  cropDrag = null
  const box = event.currentTarget as HTMLButtonElement
  if (box.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId)
}
function nudgeCrop(event: KeyboardEvent, image: ResizePreviewImage) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || resizeBusy.value) return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 1
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') image.cropX = Math.max(0, Math.min(100, image.cropX + (event.key === 'ArrowRight' ? step : -step)))
  else image.cropY = Math.max(0, Math.min(100, image.cropY + (event.key === 'ArrowDown' ? step : -step)))
}
let cropResize: { image: ResizePreviewImage; pointerId: number; corner: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; startWidth: number; startHeight: number; maxWidth: number; maxHeight: number } | null = null
function startCropResize(event: PointerEvent, image: ResizePreviewImage, corner: string) {
  if (resizeBusy.value || resizeLoading.value || !event.isPrimary || event.button !== 0) return
  const handle = event.currentTarget as HTMLButtonElement
  const bounds = handle.parentElement!.parentElement!.getBoundingClientRect()
  const r = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop', image.cropX, image.cropY, image.cropScale)
  const full = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop')
  cropResize = { image, pointerId: event.pointerId, corner, x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, anchorX: corner.includes('w') ? r.sourceX + r.sourceWidth : r.sourceX, anchorY: corner.includes('n') ? r.sourceY + r.sourceHeight : r.sourceY, startWidth: r.sourceWidth, startHeight: r.sourceHeight, maxWidth: full.sourceWidth, maxHeight: full.sourceHeight }
  handle.setPointerCapture(event.pointerId)
  handle.focus({ preventScroll: true })
  event.preventDefault()
}
function moveCropResize(event: PointerEvent) {
  const d = cropResize
  if (!d || d.pointerId !== event.pointerId || resizeBusy.value) return
  const sx = d.corner.includes('w') ? -1 : 1, sy = d.corner.includes('n') ? -1 : 1
  const dx = (event.clientX - d.x) / d.width * d.image.width * sx
  const dy = (event.clientY - d.y) / d.height * d.image.height * sy
  const ratio = d.maxWidth / d.maxHeight
  const desiredWidth = d.startWidth + (dx + dy / ratio) / (1 + 1 / (ratio * ratio))
  const limit = Math.min(sx < 0 ? d.anchorX : d.image.width - d.anchorX, (sy < 0 ? d.anchorY : d.image.height - d.anchorY) * ratio, d.maxWidth)
  const width = Math.max(d.maxWidth * 0.1, Math.min(limit, desiredWidth)), height = width / ratio
  d.image.cropScale = Math.max(0.1, Math.min(1, width / d.maxWidth))
  const x = sx < 0 ? d.anchorX - width : d.anchorX, y = sy < 0 ? d.anchorY - height : d.anchorY
  d.image.cropX = d.image.width - width > 0.001 ? Math.max(0, Math.min(100, x / (d.image.width - width) * 100)) : 50
  d.image.cropY = d.image.height - height > 0.001 ? Math.max(0, Math.min(100, y / (d.image.height - height) * 100)) : 50
}
function endCropResize(event: PointerEvent) {
  if (cropResize?.pointerId !== event.pointerId) return
  cropResize = null
  const handle = event.currentTarget as HTMLButtonElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}
function keyboardCropResize(event: KeyboardEvent, image: ResizePreviewImage) {
  if (resizeBusy.value || resizeLoading.value) return
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1
  image.cropScale = Math.max(0.1, Math.min(1, image.cropScale + direction * (event.shiftKey ? 0.1 : 0.01)))
}
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
      previews.push({ id: String(index), name: file.name, previewUrl: URL.createObjectURL(file), width: image.width, height: image.height, sizeKb: Math.max(1, Math.round(file.size / 1024)), cropX: 50, cropY: 50, cropScale: 1 })
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
  const options = { width: resizeWidth.value, height: resizeHeight.value, mode: resizeMode.value, format: resizeFormat.value, quality: resizeQuality.value, method: resizeMethod.value }
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
      const preview = resizePreviews.value[index]!
      const { targetWidth, targetHeight, sourceX, sourceY, sourceWidth, sourceHeight } = imageResizeRegion(image.width, image.height, options.width, options.height, options.mode, preview.cropX, preview.cropY, preview.cropScale)
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
            source.width = Math.max(1, Math.round(sourceWidth))
            source.height = Math.max(1, Math.round(sourceHeight))
            const sourceContext = source.getContext('2d', { willReadFrequently: true })
            if (!sourceContext) throw new Error('Could not read the image pixels.')
            sourceContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, source.width, source.height)
            rgba = sourceContext.getImageData(0, 0, source.width, source.height).data.buffer as ArrayBuffer
            const result = await processor.resize({ rgba, width: source.width, height: source.height, targetWidth, targetHeight })
            assertActive()
            context.putImageData(new ImageData(new Uint8ClampedArray(result), targetWidth, targetHeight), 0, 0)
          } finally { source.width = source.height = 0 }
        } else {
          context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
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
        <label class="text-sm font-semibold sm:col-span-2">
          Resolution preset
          <select :value="selectedPreset" class="field-control mt-1" @change="applyPreset">
            <option value="">Custom dimensions</option>
            <option v-for="preset in resolutionPresets" :key="preset.name" :value="preset.name">{{ preset.name }} — {{ preset.width }} × {{ preset.height }}</option>
          </select>
        </label>
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
        <label class="text-sm font-semibold sm:col-span-2">
          Resize mode
          <select v-model="resizeMode" class="field-control mt-1">
            <option value="crop">Crop to fill — exact dimensions</option>
            <option value="fit">Fit within — keep the whole image</option>
          </select>
          <span class="mt-1 block text-xs font-normal text-slate-600">{{ resizeMode === 'crop' ? 'Trims edges to match your dimensions without stretching. Adjust each crop below.' : 'Preserves the whole image. Output may be smaller than the requested width or height.' }}</span>
        </label>
        <p v-if="!validOutput" class="text-sm text-red-700 sm:col-span-2" role="alert">Enter whole-number dimensions from 1 to 16384, up to 12 megapixels.</p>
      </fieldset>
    </div>

    <div v-if="resizePreviews.length" class="mt-5 space-y-3">
      <p class="text-sm font-semibold text-slate-700">Output Previews ({{ resizePreviews.length }})</p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="image in resizePreviews"
          :key="image.id"
          class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div class="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <div class="relative isolate max-h-full max-w-full overflow-hidden" :style="{ aspectRatio: image.width + ' / ' + image.height, width: 'min(100%, ' + (256 * image.width / image.height) + 'px)' }">
              <img :src="image.previewUrl" :alt="'Original image: ' + image.name" draggable="false" class="pointer-events-none block h-full w-full select-none object-contain">
              <div v-if="resizeMode === 'crop' && validOutput" class="absolute" :style="cropBoxStyle(image)">
              <button
                type="button"
                class="crop-box absolute inset-0 h-full w-full touch-none border-2 border-white bg-transparent focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-teal-400 disabled:cursor-default"
                :disabled="resizeBusy || resizeLoading"
                :aria-label="'Move crop box for ' + image.name + '. Use arrow keys; hold Shift for larger steps.'"
                @pointerdown="startCropDrag($event, image)"
                @pointermove="moveCropDrag"
                @pointerup="endCropDrag"
                @pointercancel="endCropDrag"
                @lostpointercapture="endCropDrag"
                @keydown="nudgeCrop($event, image)"
              >
                <span aria-hidden="true" class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <span v-for="line in 9" :key="line" class="border border-white/30" />
                </span>
              </button>
              <button
                v-for="corner in cropCorners" :key="corner" type="button"
                class="crop-handle absolute z-10 h-8 w-8 touch-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                :class="[corner.includes('n') ? 'top-0' : 'bottom-0', corner.includes('w') ? 'left-0' : 'right-0']"
                :style="{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }"
                :aria-label="'Resize crop ' + corner + ' corner for ' + image.name + '. Arrow up or right enlarges; down or left shrinks.'"
                :disabled="resizeBusy || resizeLoading"
                @pointerdown.stop="startCropResize($event, image, corner)" @pointermove="moveCropResize"
                @pointerup="endCropResize" @pointercancel="endCropResize" @lostpointercapture="endCropResize"
                @keydown="keyboardCropResize($event, image)"
              ><span aria-hidden="true" class="mx-auto block h-3 w-3 border-2 border-teal-800 bg-white" /></button>
              </div>
            </div>
          </div>
          <p v-if="resizeMode === 'crop' && validOutput" class="mt-2 text-xs text-slate-600">Drag to move; drag a corner to resize. Arrow keys adjust the focused box or handle.</p>
          <button v-if="resizeMode === 'crop'" type="button" class="btn-secondary mt-2 min-h-11" :disabled="resizeBusy || resizeLoading" @click="resetCrop(image)">Reset crop</button>
          <div class="mt-3 space-y-1 text-sm text-slate-700">
            <p class="truncate font-semibold" :title="image.name">{{ image.name }}</p>
            <p>Original: {{ image.width }} × {{ image.height }} px</p>
            <p class="font-semibold">Output: {{ outputSize(image) }}</p>
            <p>{{ image.sizeKb }} KB</p>
          </div>
        </article>
      </div>
    </div>

    <button class="btn-primary mt-4 disabled:opacity-60" :disabled="resizeBusy || resizeLoading || !resizeFiles.length || !validOutput" @click="resizeImages">
      {{ resizeBusy ? 'Resizing...' : 'Resize Images' }}
    </button>
    <button v-if="resizeBusy" class="btn-secondary ml-2" @click="cancelResize">Cancel resize</button>
  </section>
</template>

<style scoped>
.crop-box {
  cursor: grab;
  box-shadow: 0 0 0 100vmax rgb(15 23 42 / 55%);
}
.crop-box:active { cursor: grabbing; }
</style>
