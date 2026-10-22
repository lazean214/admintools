<script setup lang="ts">
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'
import { retainUndo, validateDimensions, validateRemoval } from '../utils/processing'

const processor = new ProcessingClient(() => new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' }))
let loadGeneration = 0
let disposed = false
const loading = ref(false)
const status = ref('Ready')
const processing = ref(false)
const removeCanvas = ref<HTMLCanvasElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)
const removePreview = ref('')
const selecting = ref(false)
const brushSize = ref(28)
const engine = ref<'ai' | 'texture'>('ai')
const selectionMode = ref<'brush' | 'rect' | 'erase'>('brush')
let selectStartX = 0
let selectStartY = 0
let rectSelection: { x: number; y: number; w: number; h: number } | null = null
let removeSourceImage: HTMLImageElement | HTMLCanvasElement | null = null
let maskCtx: CanvasRenderingContext2D | null = null
const hasSelection = ref(false)
const undoStack = ref<ImageData[]>([])
let lastPoint: { x: number; y: number } | null = null

function setStatus(message: string) {
  status.value = message
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
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
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not load image.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality = 0.92): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not create image blob.'))
        return
      }
      resolve(blob)
    }, mime, quality)
  })
}

function normalizeRect(rect: { x: number; y: number; w: number; h: number }) {
  const x = rect.w < 0 ? rect.x + rect.w : rect.x
  const y = rect.h < 0 ? rect.y + rect.h : rect.y
  return { x, y, w: Math.abs(rect.w), h: Math.abs(rect.h) }
}

function checkHasSelection() {
  if (!maskCanvas.value || !maskCtx) {
    hasSelection.value = false
    return
  }
  const d = maskCtx.getImageData(0, 0, maskCanvas.value.width, maskCanvas.value.height).data
  for (let i = 3; i < d.length; i += 4) {
    if (d[i]! > 0) {
      hasSelection.value = true
      return
    }
  }
  hasSelection.value = false
}

function redrawRemoveCanvas() {
  if (!removeCanvas.value || !removeSourceImage) return
  const context = removeCanvas.value.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, removeCanvas.value.width, removeCanvas.value.height)
  context.drawImage(removeSourceImage, 0, 0)

  // overlay mask with semi-transparent red tint
  if (maskCanvas.value) {
    context.save()
    context.globalCompositeOperation = 'source-over'
    // draw a red-tinted version of the mask
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = removeCanvas.value.width
    tempCanvas.height = removeCanvas.value.height
    const tCtx = tempCanvas.getContext('2d')
    if (tCtx) {
      tCtx.drawImage(maskCanvas.value, 0, 0)
      tCtx.globalCompositeOperation = 'source-in'
      tCtx.fillStyle = 'rgba(239, 68, 68, 0.35)'
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
      context.drawImage(tempCanvas, 0, 0)
    }
    context.restore()
  }

  // draw rect selection overlay
  if (rectSelection && selectionMode.value === 'rect') {
    const rect = normalizeRect(rectSelection)
    context.save()
    context.fillStyle = 'rgba(239, 68, 68, 0.25)'
    context.fillRect(rect.x, rect.y, rect.w, rect.h)
    context.strokeStyle = '#ef4444'
    context.lineWidth = 2
    context.setLineDash([8, 4])
    context.strokeRect(rect.x, rect.y, rect.w, rect.h)
    context.setLineDash([])
    context.restore()
  }
}

function initMaskCanvas() {
  if (!removeCanvas.value) return
  if (!maskCanvas.value) {
    const mc = document.createElement('canvas')
    mc.width = removeCanvas.value.width
    mc.height = removeCanvas.value.height
    maskCanvas.value = mc
  } else {
    maskCanvas.value.width = removeCanvas.value.width
    maskCanvas.value.height = removeCanvas.value.height
  }
  maskCtx = maskCanvas.value.getContext('2d')
  hasSelection.value = false
}

async function onRemoveFileChange(event: Event) {
  const generation = ++loadGeneration
  processor.cancel()
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  removePreview.value = ''
  removeSourceImage = null
  rectSelection = null
  selecting.value = false
  hasSelection.value = false
  undoStack.value = []
  maskCanvas.value = null
  maskCtx = null
  if (removeCanvas.value) {
    removeCanvas.value.width = 0
    removeCanvas.value.height = 0
  }
  if (!file) { loading.value = false; setStatus('Ready'); return }
  loading.value = true
  setStatus('Loading image…')
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose an image file smaller than 32 MB.')
    const image = await readImage(file)
    if (disposed || generation !== loadGeneration) return
    validateDimensions(image.width, image.height)
    removeSourceImage = image
    removePreview.value = file.name
    await nextTick()
    if (!removeCanvas.value || disposed || generation !== loadGeneration) return
    removeCanvas.value.width = image.width
    removeCanvas.value.height = image.height
    initMaskCanvas()
    redrawRemoveCanvas()
    setStatus('Paint or select the area you want to remove.')
  } catch (error) {
    if (disposed || generation !== loadGeneration) return
    removePreview.value = ''
    removeSourceImage = null
    setStatus(error instanceof Error ? error.message : 'Could not load image.')
    target.value = ''
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

function getCanvasPoint(event: PointerEvent) {
  const canvas = removeCanvas.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  }
}

function getScaledBrushSize() {
  const canvas = removeCanvas.value
  if (!canvas) return brushSize.value
  const rect = canvas.getBoundingClientRect()
  return brushSize.value * (canvas.width / rect.width)
}

function paintMaskAt(x: number, y: number) {
  if (!maskCtx) return
  maskCtx.beginPath()
  maskCtx.arc(x, y, getScaledBrushSize() / 2, 0, Math.PI * 2)
  maskCtx.fill()
}

function stampRectToMask(r: { x: number; y: number; w: number; h: number }) {
  if (!maskCtx) return
  const rect = normalizeRect(r)
  maskCtx.globalCompositeOperation = 'source-over'
  maskCtx.fillRect(rect.x, rect.y, rect.w, rect.h)
}

async function undoLast() {
  if (processing.value || undoStack.value.length === 0 || !removeCanvas.value) return
  const imgData = undoStack.value[undoStack.value.length - 1]!
  try {
    const source = document.createElement('canvas')
    source.width = imgData.width
    source.height = imgData.height
    const ctx = source.getContext('2d')
    if (!ctx) throw new Error('Could not restore the image.')
    ctx.putImageData(imgData, 0, 0)
    removeSourceImage = source
    undoStack.value.pop()
    clearMask()
    setStatus('Undone. Select more areas or download.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not undo the last change.')
  }
}

function clearMask() {
  if (!maskCtx || !maskCanvas.value) return
  maskCtx.clearRect(0, 0, maskCanvas.value.width, maskCanvas.value.height)
  rectSelection = null
  hasSelection.value = false
  redrawRemoveCanvas()
}

function startSelect(event: PointerEvent) {
  if (!removeCanvas.value || processing.value) return
  selecting.value = true
  const point = getCanvasPoint(event)
  lastPoint = point
  removeCanvas.value.setPointerCapture(event.pointerId)

  if (selectionMode.value !== 'rect') {
    if (!maskCtx) return
    maskCtx.globalCompositeOperation = selectionMode.value === 'erase' ? 'destination-out' : 'source-over'
    maskCtx.fillStyle = '#ffffff'
    paintMaskAt(point.x, point.y)
    hasSelection.value = true
    redrawRemoveCanvas()
  } else {
    selectStartX = point.x
    selectStartY = point.y
    rectSelection = { x: point.x, y: point.y, w: 0, h: 0 }
  }
}

function moveSelect(event: PointerEvent) {
  if (!selecting.value || processing.value) return
  const point = getCanvasPoint(event)

  if (selectionMode.value !== 'rect') {
    if (maskCtx && lastPoint) {
      maskCtx.strokeStyle = '#ffffff'
      maskCtx.lineWidth = getScaledBrushSize()
      maskCtx.lineCap = 'round'
      maskCtx.beginPath()
      maskCtx.moveTo(lastPoint.x, lastPoint.y)
      maskCtx.lineTo(point.x, point.y)
      maskCtx.stroke()
    }
    paintMaskAt(point.x, point.y)
    lastPoint = point
    hasSelection.value = true
  } else {
    rectSelection = {
      x: selectStartX,
      y: selectStartY,
      w: point.x - selectStartX,
      h: point.y - selectStartY
    }
  }
  redrawRemoveCanvas()
}

function endSelect(event: PointerEvent) {
  if (!removeCanvas.value) return
  selecting.value = false
  lastPoint = null
  if (removeCanvas.value.hasPointerCapture(event.pointerId)) removeCanvas.value.releasePointerCapture(event.pointerId)

  checkHasSelection()
  if (selectionMode.value === 'rect' && rectSelection) {
    stampRectToMask(rectSelection)
    rectSelection = null
    checkHasSelection()
    redrawRemoveCanvas()
  }
}

async function applyObjectRemoval() {
  if (processing.value || loading.value || !removeCanvas.value || !maskCanvas.value || !maskCtx || !removeSourceImage) return
  processing.value = true
  selecting.value = false
  try {
    const canvas = removeCanvas.value
    const { width, height } = canvas
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not read the image.')
    const maskData = maskCtx.getImageData(0, 0, width, height)
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i++) mask[i] = maskData.data[i * 4 + 3]! > 0 ? 1 : 0
    context.clearRect(0, 0, width, height)
    context.drawImage(removeSourceImage, 0, 0)
    const before = context.getImageData(0, 0, width, height)
    validateRemoval(new Uint8Array(before.data.buffer), mask, width, height)
    setStatus('Preparing image…')
    // Keep the original snapshot owned by the UI for undo/cancel. Only the
    // processing copy and compact one-byte mask are transferred to the worker.
    const rgba = before.data.slice().buffer as ArrayBuffer
    const result = await processor.run({ width, height, rgba, mask: mask.buffer, seed: 0x9e3779b9, engine: engine.value }, (phase) => {
      setStatus(phase.startsWith('Downloading')
        ? 'Getting ready. First use may take a few minutes…'
        : 'Removing your selection…')
    })
    if (disposed) return
    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    const sourceContext = source.getContext('2d')
    if (!sourceContext) throw new Error('Could not display the processed image.')
    sourceContext.putImageData(new ImageData(new Uint8ClampedArray(result), width, height), 0, 0)
    retainUndo(undoStack.value, before)
    removeSourceImage = source
    clearMask()
    setStatus('Area reconstructed. Select more areas or download.')
  } catch (error) {
    if (disposed) return
    redrawRemoveCanvas()
    setStatus(error instanceof ProcessingCancelledError
      ? 'Processing cancelled. Your image and selection are unchanged.'
      : error instanceof Error ? error.message : 'Removal failed. Try a smaller selection.')
  } finally {
    processing.value = false
  }
}

function cancelRemoval() {
  processor.cancel()
}

onBeforeUnmount(() => {
  disposed = true
  loadGeneration++
  processor.cancel()
  undoStack.value = []
  removeSourceImage = null
  maskCanvas.value = null
  maskCtx = null
})

async function downloadRemovedResult() {
  if (!removeCanvas.value || !removeSourceImage || processing.value) return
  try {
    const output = document.createElement('canvas')
    output.width = removeCanvas.value.width
    output.height = removeCanvas.value.height
    const context = output.getContext('2d')
    if (!context) throw new Error('Could not export the image.')
    // Export the clean source, never the red selection overlay.
    context.drawImage(removeSourceImage, 0, 0)
    downloadBlob(await canvasToBlob(output, 'image/png', 1), 'objects-removed.png')
    setStatus('Processed image downloaded.')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not download the image.')
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Remove unwanted objects</h2>
    <p class="mt-2 text-sm text-slate-600">
      Paint over the whole object, including its shadow, or select a rectangle. AI reconstructs the background inside your selection.
    </p>

    <!-- Status + Processing Indicator -->
    <div class="mt-3 flex items-center gap-3">
      <p class="status-pill" role="status" aria-live="polite">{{ status }}</p>
      <div v-if="processing" class="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Processing…
      </div>
    </div>

    <label class="mt-5 block text-sm font-semibold text-slate-700">
      Editing method
      <select v-model="engine" class="field-control mt-2" :disabled="processing">
        <option value="ai">Smart removal · AI</option>
        <option value="texture">Texture repair · quick cleanup</option>
      </select>
    </label>
    <p class="mt-2 text-xs text-slate-600">For best results, remove one object at a time. Smart removal may take a few minutes to get ready on first use.</p>

    <!-- File Input -->
    <label class="mt-5 block rounded-2xl bg-white/70 p-4 text-sm font-semibold">
      Target Image
      <input type="file" accept="image/*" class="field-control mt-2" :disabled="processing || loading" @change="onRemoveFileChange">
    </label>

    <!-- Toolbar -->
    <div v-if="removePreview" class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 px-4 py-3">
      <!-- Mode Toggle -->
      <div class="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-bold">
        <button
          class="px-3 py-1.5 transition-colors"
          :class="selectionMode === 'brush' ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'"
          :aria-pressed="selectionMode === 'brush'"
          :disabled="processing"
          @click="selectionMode = 'brush'"
        >
          <span class="mr-1">&#x1f58c;&#xfe0f;</span> Brush
        </button>
        <button
          class="px-3 py-1.5 transition-colors"
          :class="selectionMode === 'rect' ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'"
          :disabled="processing"
          @click="selectionMode = 'rect'"
        >
          <span class="mr-1">&#x25a1;</span> Rectangle
        </button>
        <button
          class="px-3 py-1.5 transition-colors"
          :class="selectionMode === 'erase' ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'"
          :aria-pressed="selectionMode === 'erase'"
          :disabled="processing"
          @click="selectionMode = 'erase'"
        >Erase selection</button>
      </div>

      <!-- Brush Size Slider -->
      <div v-if="selectionMode !== 'rect'" class="flex items-center gap-2 text-xs text-slate-600">
        <span class="font-semibold">Size</span>
        <input
          v-model.number="brushSize"
          aria-label="Brush size"
          type="range"
          min="4"
          max="80"
          class="h-1.5 w-24 cursor-pointer accent-teal-700"
          :disabled="processing"
        >
        <span class="w-6 text-center font-bold text-slate-800">{{ brushSize }}</span>
      </div>

      <div class="ml-auto flex gap-2">
        <button
          class="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-300"
          :disabled="processing || !hasSelection"
          @click="clearMask"
        >
          Clear Mask
        </button>
        <button
          class="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-300"
          :disabled="processing || undoStack.length === 0"
          @click="undoLast"
        >
          Undo
        </button>
      </div>
    </div>

    <!-- Canvas Area -->
    <div class="relative mt-4 overflow-auto rounded-2xl border border-slate-300 bg-slate-50 p-3">
      <!-- Processing overlay -->
      <Transition name="fade">
        <div
          v-if="processing"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm"
        >
          <svg class="h-10 w-10 animate-spin text-teal-700" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p class="mt-3 text-sm font-bold text-slate-700">{{ status }}</p>
          <p class="mt-1 text-xs text-slate-500">Your photo stays on this device. You can cancel at any time.</p>
          <button type="button" class="btn-secondary mt-4" @click="cancelRemoval">Cancel processing</button>
        </div>
      </Transition>

      <canvas
        v-show="removePreview"
        ref="removeCanvas"
        class="mx-auto max-h-[520px] max-w-full touch-none"
        :class="[
          processing ? 'pointer-events-none opacity-50' : '',
          selectionMode === 'brush' ? 'cursor-[url(\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22none%22 stroke=%22%23ef4444%22 stroke-width=%222%22/></svg>\')_12_12,_crosshair]' : 'cursor-crosshair'
        ]"
        @pointerdown="startSelect"
        @pointermove="moveSelect"
        @pointerup="endSelect"
        @pointercancel="endSelect"
      />
      <div v-if="!removePreview" class="flex flex-col items-center justify-center py-20 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159M15.75 12.75l1.409-1.409a2.25 2.25 0 013.182 0l1.409 1.409M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25zM9.75 9.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
        <p class="text-sm font-semibold">Upload an image to begin</p>
        <p class="mt-1 text-xs">PNG, JPG, WebP · Up to 12 megapixels and 32 MB</p>
      </div>
    </div>

    <!-- Action Buttons -->
    <div v-if="removePreview" class="mt-4 flex flex-wrap gap-2">
      <button
        class="btn-primary"
        :disabled="processing || !hasSelection"
        @click="applyObjectRemoval"
      >
        <span v-if="processing" class="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        {{ processing ? 'Processing…' : 'Remove object' }}
      </button>
      <button class="btn-secondary" :disabled="processing" @click="downloadRemovedResult">
        Download Result
      </button>
    </div>
  </section>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
