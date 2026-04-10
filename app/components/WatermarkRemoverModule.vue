<script setup lang="ts">
const status = ref('Ready')
const processing = ref(false)
const removeCanvas = ref<HTMLCanvasElement | null>(null)
const maskCanvas = ref<HTMLCanvasElement | null>(null)
const removePreview = ref('')
const selecting = ref(false)
const brushSize = ref(28)
const selectionMode = ref<'brush' | 'rect'>('brush')
let selectStartX = 0
let selectStartY = 0
let rectSelection: { x: number; y: number; w: number; h: number } | null = null
let removeSourceImage: HTMLImageElement | null = null
let maskCtx: CanvasRenderingContext2D | null = null
const hasSelection = ref(false)
const undoStack = ref<ImageData[]>([])
const maxUndo = 20

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
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image file.'))
    reader.readAsDataURL(file)
  })

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image.'))
    image.src = dataUrl
  })
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

function onRemoveFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  removePreview.value = ''
  rectSelection = null
  undoStack.value = []

  if (!file) return

  const reader = new FileReader()
  reader.onload = async () => {
    removePreview.value = String(reader.result)
    const image = await readImage(file)
    removeSourceImage = image
    await nextTick()
    if (!removeCanvas.value) return
    removeCanvas.value.width = image.width
    removeCanvas.value.height = image.height
    initMaskCanvas()
    redrawRemoveCanvas()
    setStatus('Paint or select the area you want to remove.')
  }
  reader.readAsDataURL(file)
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
  maskCtx.fillRect(rect.x, rect.y, rect.w, rect.h)
}

function pushUndo() {
  if (!removeCanvas.value || !removeSourceImage) return
  const c = document.createElement('canvas')
  c.width = removeCanvas.value.width
  c.height = removeCanvas.value.height
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.drawImage(removeSourceImage, 0, 0)
  const imgData = ctx.getImageData(0, 0, c.width, c.height)
  if (undoStack.value.length >= maxUndo) undoStack.value.shift()
  undoStack.value.push(imgData)
}

async function undoLast() {
  if (undoStack.value.length === 0 || !removeCanvas.value) return
  const imgData = undoStack.value.pop()!
  const c = document.createElement('canvas')
  c.width = removeCanvas.value.width
  c.height = removeCanvas.value.height
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.putImageData(imgData, 0, 0)
  const blob = await canvasToBlob(c, 'image/png', 1)
  removeSourceImage = await readImage(new File([blob], 'undo.png', { type: 'image/png' }))
  clearMask()
  redrawRemoveCanvas()
  setStatus('Undone. Select more areas or download.')
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
  removeCanvas.value.setPointerCapture(event.pointerId)

  if (selectionMode.value === 'brush') {
    if (!maskCtx) return
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

  if (selectionMode.value === 'brush') {
    paintMaskAt(point.x, point.y)
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
  removeCanvas.value.releasePointerCapture(event.pointerId)

  if (selectionMode.value === 'rect' && rectSelection) {
    stampRectToMask(rectSelection)
    rectSelection = null
    checkHasSelection()
    redrawRemoveCanvas()
  }
}

/**
 * Telea-style Fast Marching Method inpainting.
 * Fills the masked region from the boundary inward using weighted
 * pixel extrapolation that preserves edges and surrounding texture.
 */
function inpaintWithMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8ClampedArray
) {
  const total = width * height
  const KNOWN = 0
  const BAND = 1
  const UNKNOWN = 2
  const flags = new Uint8Array(total)
  const dist = new Float32Array(total)

  // Build mask: any pixel with mask alpha > 0 is UNKNOWN
  let unknownCount = 0
  for (let i = 0; i < total; i++) {
    if (mask[i * 4 + 3]! > 0) {
      flags[i] = UNKNOWN
      dist[i] = 1e6
      unknownCount++
    }
  }
  if (unknownCount === 0) return

  const nd: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

  // Find boundary pixels (UNKNOWN adjacent to KNOWN)
  let band: number[] = []
  for (let i = 0; i < total; i++) {
    if (flags[i] !== UNKNOWN) continue
    const x = i % width
    const y = (i - x) / width
    for (const [ddx, ddy] of nd) {
      const nx = x + ddx
      const ny = y + ddy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && flags[ny * width + nx] === KNOWN) {
        flags[i] = BAND
        dist[i] = 1
        band.push(i)
        break
      }
    }
  }

  // Compute adaptive radius from mask bounding box
  let minX = width, minY = height, maxX = 0, maxY = 0
  for (let i = 0; i < total; i++) {
    if (mask[i * 4 + 3]! > 0) {
      const x = i % width
      const y = (i - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const rw = maxX - minX + 1
  const rh = maxY - minY + 1
  const radius = Math.max(5, Math.min(25, Math.ceil(Math.sqrt(rw * rh) * 0.12)))

  const px = (i: number, c: number): number => data[i * 4 + c]!

  while (band.length > 0) {
    const nextBand: number[] = []

    for (const idx of band) {
      const cx = idx % width
      const cy = (idx - cx) / width
      const curDist = dist[idx]!

      const safeDist = (ni: number): number => {
        if (ni >= 0 && ni < total && dist[ni]! < 1e5) return dist[ni]!
        return curDist
      }
      const dl = cx > 0 ? safeDist(cy * width + cx - 1) : curDist
      const dr = cx < width - 1 ? safeDist(cy * width + cx + 1) : curDist
      const dt = cy > 0 ? safeDist((cy - 1) * width + cx) : curDist
      const db = cy < height - 1 ? safeDist((cy + 1) * width + cx) : curDist
      let tgx = (dr - dl) * 0.5
      let tgy = (db - dt) * 0.5
      const tgLen = Math.sqrt(tgx * tgx + tgy * tgy) + 1e-6
      tgx /= tgLen
      tgy /= tgLen

      let chR = 0
      let chG = 0
      let chB = 0
      let wSum = 0

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = cy + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx
          if (nx < 0 || nx >= width) continue
          const ni = ny * width + nx
          if (flags[ni] !== KNOWN) continue
          const d2 = dx * dx + dy * dy
          if (d2 === 0 || d2 > radius * radius) continue
          const d = Math.sqrt(d2)

          const dirW = Math.abs(-dx * tgx + -dy * tgy) / d + 0.01
          const dstW = 1 / (d * d)
          const levW = 1 / (1 + Math.abs(curDist - dist[ni]!))
          const w = dirW * dstW * levW

          const lni = ni - 1
          const rni = ni + 1
          const tni = ni - width
          const bni = ni + width
          const lKnown = nx > 0 && flags[lni] === KNOWN
          const rKnown = nx < width - 1 && flags[rni] === KNOWN
          const tKnown = ny > 0 && flags[tni] === KNOWN
          const bKnown = ny < height - 1 && flags[bni] === KNOWN

          for (let c = 0; c < 3; c++) {
            const center = px(ni, c)
            const left = lKnown ? px(lni, c) : center
            const right = rKnown ? px(rni, c) : center
            const top = tKnown ? px(tni, c) : center
            const bottom = bKnown ? px(bni, c) : center
            const igx = (right - left) * 0.5
            const igy = (bottom - top) * 0.5
            let val = center + (-dx * igx + -dy * igy) * 0.5
            if (val < 0) val = 0
            if (val > 255) val = 255
            if (c === 0) chR += w * val
            else if (c === 1) chG += w * val
            else chB += w * val
          }
          wSum += w
        }
      }

      if (wSum > 0) {
        const pi = idx * 4
        data[pi] = Math.round(chR / wSum)
        data[pi + 1] = Math.round(chG / wSum)
        data[pi + 2] = Math.round(chB / wSum)
      }

      flags[idx] = KNOWN

      for (const [ddx, ddy] of nd) {
        const nx = cx + ddx
        const ny = cy + ddy
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const ni = ny * width + nx
          if (flags[ni] === UNKNOWN) {
            flags[ni] = BAND
            dist[ni] = curDist + 1
            nextBand.push(ni)
          }
        }
      }
    }

    band = nextBand
  }
}

async function applyWatermarkRemoval() {
  if (!removeCanvas.value || !maskCanvas.value || !maskCtx) {
    setStatus('Select an area before removing.')
    return
  }

  // Check mask has content
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.value.width, maskCanvas.value.height)
  let hasMask = false
  for (let i = 3; i < maskData.data.length; i += 4) {
    if (maskData.data[i]! > 0) { hasMask = true; break }
  }
  if (!hasMask) {
    setStatus('Paint or select the area you want to remove first.')
    return
  }

  processing.value = true
  setStatus('Removing watermark\u2026')
  await nextTick()

  pushUndo()

  const w = removeCanvas.value.width
  const h = removeCanvas.value.height
  const context = removeCanvas.value.getContext('2d')
  if (!context) { processing.value = false; return }

  // Draw clean source image (without overlay) for processing
  context.clearRect(0, 0, w, h)
  if (removeSourceImage) context.drawImage(removeSourceImage, 0, 0)
  const imageData = context.getImageData(0, 0, w, h)

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      inpaintWithMask(imageData.data, w, h, maskData.data)
      resolve()
    }, 50)
  })

  context.putImageData(imageData, 0, 0)

  if (removeSourceImage) {
    removeSourceImage = await readImage(
      new File([await canvasToBlob(removeCanvas.value, 'image/png', 1)], 'updated.png', { type: 'image/png' })
    )
  }

  clearMask()
  redrawRemoveCanvas()
  processing.value = false
  setStatus('Watermark removed. Select more areas or download.')
}

async function downloadRemovedResult() {
  if (!removeCanvas.value) return
  const blob = await canvasToBlob(removeCanvas.value, 'image/png', 1)
  downloadBlob(blob, 'watermark-removed.png')
  setStatus('Processed image downloaded.')
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Remove Watermark</h2>
    <p class="mt-2 text-sm text-slate-600">
      Paint over or select the watermark/object to remove. The area will be reconstructed from surrounding pixels.
    </p>

    <!-- Status + Processing Indicator -->
    <div class="mt-3 flex items-center gap-3">
      <p class="status-pill">{{ status }}</p>
      <div v-if="processing" class="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
        <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Processing\u2026
      </div>
    </div>

    <!-- File Input -->
    <label class="mt-5 block rounded-2xl bg-white/70 p-4 text-sm font-semibold">
      Target Image
      <input type="file" accept="image/*" class="field-control mt-2" :disabled="processing" @change="onRemoveFileChange">
    </label>

    <!-- Toolbar -->
    <div v-if="removePreview" class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 px-4 py-3">
      <!-- Mode Toggle -->
      <div class="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-bold">
        <button
          class="px-3 py-1.5 transition-colors"
          :class="selectionMode === 'brush' ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'"
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
      </div>

      <!-- Brush Size Slider -->
      <div v-if="selectionMode === 'brush'" class="flex items-center gap-2 text-xs text-slate-600">
        <span class="font-semibold">Size</span>
        <input
          v-model.number="brushSize"
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
          <p class="mt-3 text-sm font-bold text-slate-700">Inpainting region\u2026</p>
          <p class="mt-1 text-xs text-slate-500">This may take a moment for large selections</p>
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
        @pointerleave="endSelect"
      />
      <div v-if="!removePreview" class="flex flex-col items-center justify-center py-20 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159M15.75 12.75l1.409-1.409a2.25 2.25 0 013.182 0l1.409 1.409M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25zM9.75 9.75a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
        <p class="text-sm font-semibold">Upload an image to begin</p>
        <p class="mt-1 text-xs">Supports PNG, JPG, WebP and more</p>
      </div>
    </div>

    <!-- Action Buttons -->
    <div v-if="removePreview" class="mt-4 flex flex-wrap gap-2">
      <button
        class="btn-primary"
        :disabled="processing || !hasSelection"
        @click="applyWatermarkRemoval"
      >
        <span v-if="processing" class="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        {{ processing ? 'Processing\u2026' : 'Remove Selection' }}
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
