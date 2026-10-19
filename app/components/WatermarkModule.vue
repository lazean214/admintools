<script setup lang="ts">
import JSZip from 'jszip'
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'
import { validateDimensions } from '../utils/processing'
import { createWatermarkStamp } from '../utils/watermark'
import type { WatermarkOptions, WatermarkPosition } from '../utils/watermark'

const status = ref('Ready')
const wmBaseFiles = ref<File[]>([])
const dimensions = ref<Array<{ width: number; height: number }>>([])
const wmThumbnails = ref<string[]>([])
const wmSelectedIndex = ref(0)
const wmPreviewImage = shallowRef<HTMLImageElement | null>(null)
const wmType = ref<'text' | 'image'>('text')
const wmText = ref('CONFIDENTIAL')
const wmColor = ref('#ffffff')
const wmSize = ref(40)
const wmOpacity = ref(0.35)
const wmPosition = ref<WatermarkPosition>('center')
const wmImageFile = ref<File | null>(null)
const wmImagePreview = ref('')
const wmImageScale = ref(0.25)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const wmWatermarkImage = shallowRef<HTMLImageElement | null>(null)
const busy = ref(false)
const loading = ref(false)
const exportMode = ref<'background' | 'standard'>('standard')
const processor = new ProcessingClient(() => new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' }))
let disposed = false, cancelled = false, baseGeneration = 0, markGeneration = 0, previewGeneration = 0
let frame = 0
let observer: ResizeObserver | null = null

function options(): WatermarkOptions { return { type: wmType.value, text: wmText.value, color: wmColor.value, size: wmSize.value, opacity: wmOpacity.value, position: wmPosition.value, scale: wmImageScale.value } }
function setStatus(message: string) { status.value = message }
function revokeThumbnails() { wmThumbnails.value.forEach((url) => URL.revokeObjectURL(url)); wmThumbnails.value = [] }
async function readImage(file: File): Promise<HTMLImageElement> {
  if (file.size > 32 * 1024 * 1024) throw new Error('Choose image files smaller than 32 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not load ' + file.name + '.'))
      image.src = url
    })
    validateDimensions(image.width, image.height)
    return image
  } finally { URL.revokeObjectURL(url) }
}
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not export the watermarked image.')), 'image/png'))
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name
  document.body.appendChild(anchor); anchor.click(); anchor.remove()
  URL.revokeObjectURL(url)
}
async function onBaseWatermarkImageChange(event: Event) {
  if (busy.value) return
  const generation = ++baseGeneration
  ++previewGeneration
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  const urls: string[] = [], sizes: Array<{ width: number; height: number }> = []
  let published = false
  loading.value = true
  revokeThumbnails()
  wmBaseFiles.value = []; dimensions.value = []; wmPreviewImage.value = null
  try {
    if (files.length > 32 || files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) throw new Error('Select up to 32 images and 128 MB per batch.')
    let first: HTMLImageElement | null = null
    for (const file of files) {
      const image = await readImage(file)
      if (disposed || generation !== baseGeneration) return
      first ??= image
      sizes.push({ width: image.width, height: image.height })
      urls.push(URL.createObjectURL(file))
    }
    wmBaseFiles.value = files; dimensions.value = sizes
    wmThumbnails.value = urls; published = true
    wmSelectedIndex.value = 0; wmPreviewImage.value = first
    setStatus(files.length ? 'Ready. Adjust your watermark and export.' : 'Ready')
    schedulePreview()
  } catch (error) {
    if (!disposed && generation === baseGeneration) { setStatus(error instanceof Error ? error.message : 'Could not load images.'); target.value = '' }
  } finally {
    if (!published) urls.forEach((url) => URL.revokeObjectURL(url))
    if (generation === baseGeneration) loading.value = false
  }
}
async function selectPreviewImage(index: number) {
  if (busy.value || loading.value) return
  const file = wmBaseFiles.value[index]
  if (!file) return
  const generation = ++previewGeneration
  try {
    const image = await readImage(file)
    if (disposed || generation !== previewGeneration) return
    wmSelectedIndex.value = index; wmPreviewImage.value = image
    schedulePreview()
  } catch (error) { if (!disposed) setStatus(error instanceof Error ? error.message : 'Could not load preview.') }
}
async function onWatermarkImageChange(event: Event) {
  if (busy.value) return
  const generation = ++markGeneration
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  wmImageFile.value = null; wmWatermarkImage.value = null
  if (wmImagePreview.value) URL.revokeObjectURL(wmImagePreview.value)
  wmImagePreview.value = ''
  try {
    if (!file) return
    const image = await readImage(file)
    if (disposed || generation !== markGeneration) return
    wmWatermarkImage.value = image; wmImageFile.value = file
    wmImagePreview.value = URL.createObjectURL(file)
  } catch (error) { if (!disposed) { setStatus(error instanceof Error ? error.message : 'Could not load watermark.'); target.value = '' } }
  finally { schedulePreview() }
}
function schedulePreview() {
  if (disposed || typeof requestAnimationFrame === 'undefined') return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(drawPreview)
}
function drawPreview() {
  const canvas = previewCanvas.value, base = wmPreviewImage.value
  if (!canvas || !base) return
  const scale = Math.min((canvas.clientWidth || 600) * (window.devicePixelRatio || 1) / base.width, 1)
  canvas.width = Math.max(1, Math.round(base.width * scale)); canvas.height = Math.max(1, Math.round(base.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return
  context.drawImage(base, 0, 0, canvas.width, canvas.height)
  let stamp: ReturnType<typeof createWatermarkStamp> | null = null
  try {
    stamp = createWatermarkStamp(base.width, base.height, options(), wmWatermarkImage.value, scale)
    context.globalAlpha = stamp.opacity
    context.drawImage(stamp.canvas, stamp.x * scale, stamp.y * scale)
  } catch { /* Incomplete settings leave the clean base preview visible. */ }
  finally { context.globalAlpha = 1; if (stamp) stamp.canvas.width = stamp.canvas.height = 0 }
}
watch([wmType, wmText, wmColor, wmSize, wmOpacity, wmPosition, wmImageScale, wmPreviewImage, wmWatermarkImage], schedulePreview, { flush: 'post' })
onMounted(() => {
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') exportMode.value = 'background'
  if (previewCanvas.value) { observer = new ResizeObserver(schedulePreview); observer.observe(previewCanvas.value) }
  void document.fonts.ready.then(schedulePreview)
})
function assertActive() { if (disposed || cancelled) throw new ProcessingCancelledError() }
function cancelExport() { cancelled = true; processor.cancel(); setStatus('Cancelling…') }
async function addWatermark() {
  if (busy.value || loading.value) return
  if (!wmBaseFiles.value.length) { setStatus('Select at least one base image.'); return }
  const settings = options(), mode = exportMode.value, markImage = wmWatermarkImage.value
  busy.value = true; cancelled = false
  try {
    await document.fonts.ready
    assertActive()
    const zip = new JSZip(), names = new Set<string>()
    let bytes = 0
    for (const [index, file] of wmBaseFiles.value.entries()) {
      assertActive()
      setStatus('Processing ' + (index + 1) + ' of ' + wmBaseFiles.value.length + '…')
      const { width, height } = dimensions.value[index]!
      const stamp = createWatermarkStamp(width, height, settings, markImage)
      let blob: Blob
      try {
        if (mode === 'background') {
          const context = stamp.canvas.getContext('2d')!
          const mark = context.getImageData(0, 0, stamp.canvas.width, stamp.canvas.height).data.buffer as ArrayBuffer
          blob = await processor.exportWatermark({ file, width, height, mark, markWidth: stamp.canvas.width, markHeight: stamp.canvas.height, x: stamp.x, y: stamp.y, opacity: stamp.opacity })
        } else {
          const image = await readImage(file)
          assertActive()
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          try {
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Could not create the export canvas.')
            context.drawImage(image, 0, 0)
            context.globalAlpha = stamp.opacity
            context.drawImage(stamp.canvas, stamp.x, stamp.y)
            blob = await canvasToBlob(canvas)
          } finally { canvas.width = canvas.height = 0 }
        }
      } finally { stamp.canvas.width = stamp.canvas.height = 0 }
      assertActive()
      bytes += blob.size
      if (bytes > 128 * 1024 * 1024) throw new Error('Outputs exceed 128 MB. Export fewer images at a time.')
      const base = file.name.replace(/\.[^.]+$/, '') + '_watermarked'
      let name = base + '.png', suffix = 2
      while (names.has(name)) name = base + '_' + suffix++ + '.png'
      names.add(name); zip.file(name, blob)
    }
    setStatus('Creating ZIP…')
    const blob = await zip.generateAsync({ type: 'blob' }, assertActive)
    assertActive()
    downloadBlob(blob, 'watermarked_images.zip')
    setStatus('Done. Watermarked ' + wmBaseFiles.value.length + ' image(s).')
  } catch (error) {
    if (!disposed) setStatus(error instanceof ProcessingCancelledError ? 'Export cancelled. No files were downloaded.' : error instanceof Error ? error.message : 'Watermark export failed.')
  } finally { busy.value = false }
}
onBeforeUnmount(() => {
  disposed = true; cancelled = true; baseGeneration++; markGeneration++; previewGeneration++
  processor.cancel(); cancelAnimationFrame(frame); observer?.disconnect(); revokeThumbnails()
  if (wmImagePreview.value) URL.revokeObjectURL(wmImagePreview.value)
  wmPreviewImage.value = null; wmWatermarkImage.value = null
})
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Add Watermark</h2>
    <p class="mt-2 text-sm text-slate-600">Use text or image watermarks with custom style and position. Supports batch processing.</p>
    <p class="mt-1 text-xs text-slate-500">Up to 32 images, 12 megapixels and 32 MB each; 128 MB per batch.</p>
    <p class="status-pill mt-3" role="status" aria-live="polite">{{ status }}</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="space-y-3 rounded-2xl bg-white/70 p-4">
        <label class="block text-sm font-semibold">
          Images
          <span v-if="wmBaseFiles.length > 0" class="ml-1 font-normal text-slate-500">({{ wmBaseFiles.length }} selected)</span>
          <input type="file" accept="image/*" multiple :disabled="busy || loading" class="field-control mt-2" @change="onBaseWatermarkImageChange" >
        </label>
        <div class="min-h-56 rounded-xl border border-slate-300 bg-white p-3 flex items-center justify-center">
          <canvas v-show="wmPreviewImage" ref="previewCanvas" class="max-h-[28rem] w-full object-contain" />
          <p v-if="!wmPreviewImage" class="text-sm text-slate-400">Live preview appears here</p>
        </div>
        <div v-if="wmThumbnails.length > 1" class="flex gap-2 overflow-x-auto py-1">
          <button
            v-for="(thumb, idx) in wmThumbnails"
            :key="idx"
            class="shrink-0 rounded-lg border-2 p-0.5 transition-all"
            :class="idx === wmSelectedIndex ? 'border-blue-500 ring-2 ring-blue-300' : 'border-slate-300 hover:border-slate-400'"
            :disabled="busy || loading"
            @click="selectPreviewImage(idx)"
          >
            <img :src="thumb" :alt="`Thumbnail ${idx + 1}`" class="h-16 w-16 rounded object-cover" >
          </button>
        </div>
      </div>

      <fieldset :disabled="busy || loading" class="space-y-3 rounded-2xl bg-white/70 p-4">
        <label class="text-sm font-semibold">
          Watermark Type
          <select v-model="wmType" class="field-control mt-1">
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </label>

        <template v-if="wmType === 'text'">
          <label class="text-sm font-semibold">
            Text
            <input v-model="wmText" type="text" class="field-control mt-1" >
          </label>
          <label class="text-sm font-semibold">
            Color
            <input v-model="wmColor" type="color" class="mt-1 block h-10 w-full rounded-lg border border-slate-300" >
          </label>
          <label class="text-sm font-semibold">
            Font Size
            <input v-model.number="wmSize" type="range" min="14" max="120" class="mt-2 w-full" >
          </label>
        </template>

        <template v-else>
          <label class="text-sm font-semibold">
            Watermark Image
            <input type="file" accept="image/*" class="field-control mt-1" @change="onWatermarkImageChange" >
          </label>
          <label class="text-sm font-semibold">
            Scale ({{ Math.round(wmImageScale * 100) }}%)
            <input v-model.number="wmImageScale" type="range" min="0.1" max="0.8" step="0.05" class="mt-2 w-full" >
          </label>
          <img v-if="wmImagePreview" :src="wmImagePreview" alt="Watermark preview" class="max-h-24 w-auto rounded-lg border border-slate-300 bg-white p-1">
        </template>

        <label class="text-sm font-semibold">
          Opacity ({{ Math.round(wmOpacity * 100) }}%)
          <input v-model.number="wmOpacity" type="range" min="0.05" max="1" step="0.05" class="mt-2 w-full" >
        </label>

        <label class="text-sm font-semibold">
          Position
          <select v-model="wmPosition" class="field-control mt-1">
            <option value="top-left">Top Left</option>
            <option value="top-right">Top Right</option>
            <option value="center">Center</option>
            <option value="bottom-left">Bottom Left</option>
            <option value="bottom-right">Bottom Right</option>
          </select>
        </label>

        <label class="block text-sm font-semibold">
          Export processing
          <select v-model="exportMode" class="field-control mt-1">
            <option value="background">Background</option>
            <option value="standard">Standard</option>
          </select>
          <span class="mt-1 block text-xs font-normal text-slate-600">Background keeps the page responsive during image export. Use Standard if your browser cannot export in the background.</span>
        </label>
        <button class="btn-primary" :disabled="busy || loading || !wmBaseFiles.length" @click="addWatermark">
          Add Watermark &amp; Download ZIP<span v-if="wmBaseFiles.length > 1"> ({{ wmBaseFiles.length }} images)</span>
        </button>
      </fieldset>
    </div>
    <button v-if="busy" class="btn-secondary mt-3" @click="cancelExport">Cancel export</button>
  </section>
</template>
