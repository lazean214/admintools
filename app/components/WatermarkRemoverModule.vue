<script setup lang="ts">
const status = ref('Ready')
const removeCanvas = ref<HTMLCanvasElement | null>(null)
const removePreview = ref('')
const removeSelection = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const selecting = ref(false)
let selectStartX = 0
let selectStartY = 0
let removeSourceImage: HTMLImageElement | null = null

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

function redrawRemoveCanvas() {
  if (!removeCanvas.value || !removeSourceImage) {
    return
  }

  const context = removeCanvas.value.getContext('2d')
  if (!context) {
    return
  }

  context.clearRect(0, 0, removeCanvas.value.width, removeCanvas.value.height)
  context.drawImage(removeSourceImage, 0, 0)

  if (removeSelection.value) {
    const rect = normalizeRect(removeSelection.value)
    context.strokeStyle = '#ef4444'
    context.lineWidth = 2
    context.setLineDash([8, 4])
    context.strokeRect(rect.x, rect.y, rect.w, rect.h)
    context.setLineDash([])
  }
}

function onRemoveFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  removePreview.value = ''
  removeSelection.value = null

  if (!file) {
    return
  }

  const reader = new FileReader()
  reader.onload = async () => {
    removePreview.value = String(reader.result)
    const image = await readImage(file)
    removeSourceImage = image
    await nextTick()
    if (!removeCanvas.value) {
      return
    }
    removeCanvas.value.width = image.width
    removeCanvas.value.height = image.height
    redrawRemoveCanvas()
    setStatus('Draw a selection around the watermark to remove.')
  }
  reader.readAsDataURL(file)
}

function getRemovePoint(event: PointerEvent) {
  const canvas = removeCanvas.value
  if (!canvas) {
    return { x: 0, y: 0 }
  }

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  }
}

function startSelectRemove(event: PointerEvent) {
  if (!removeCanvas.value) {
    return
  }
  selecting.value = true
  const point = getRemovePoint(event)
  selectStartX = point.x
  selectStartY = point.y
  removeSelection.value = { x: point.x, y: point.y, w: 0, h: 0 }
  removeCanvas.value.setPointerCapture(event.pointerId)
}

function moveSelectRemove(event: PointerEvent) {
  if (!selecting.value) {
    return
  }
  const point = getRemovePoint(event)
  removeSelection.value = {
    x: selectStartX,
    y: selectStartY,
    w: point.x - selectStartX,
    h: point.y - selectStartY
  }
  redrawRemoveCanvas()
}

function endSelectRemove(event: PointerEvent) {
  if (!removeCanvas.value) {
    return
  }
  selecting.value = false
  removeCanvas.value.releasePointerCapture(event.pointerId)
}

async function applyWatermarkRemoval() {
  if (!removeCanvas.value || !removeSelection.value) {
    setStatus('Select an area before removing watermark.')
    return
  }

  const context = removeCanvas.value.getContext('2d')
  if (!context) {
    return
  }

  const rect = normalizeRect(removeSelection.value)
  if (rect.w < 4 || rect.h < 4) {
    setStatus('Selection is too small.')
    return
  }

  const samplePad = 12
  const sx = Math.max(0, rect.x - samplePad)
  const sy = Math.max(0, rect.y - samplePad)
  const sw = Math.min(removeCanvas.value.width - sx, rect.w + samplePad * 2)
  const sh = Math.min(removeCanvas.value.height - sy, rect.h + samplePad * 2)

  const temp = document.createElement('canvas')
  temp.width = sw
  temp.height = sh
  const tempCtx = temp.getContext('2d')
  if (!tempCtx) {
    return
  }

  tempCtx.drawImage(removeCanvas.value, sx, sy, sw, sh, 0, 0, sw, sh)
  context.save()
  context.filter = 'blur(16px)'
  context.drawImage(temp, samplePad, samplePad, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h)
  context.restore()

  if (removeSourceImage) {
    removeSourceImage = await readImage(
      new File([await canvasToBlob(removeCanvas.value, 'image/png', 1)], 'updated.png', { type: 'image/png' })
    )
  }

  removeSelection.value = null
  redrawRemoveCanvas()
  setStatus('Watermark area softened. Download when ready.')
}

async function downloadRemovedResult() {
  if (!removeCanvas.value) {
    return
  }
  const blob = await canvasToBlob(removeCanvas.value, 'image/png', 1)
  downloadBlob(blob, 'watermark-removed.png')
  setStatus('Processed image downloaded.')
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Remove Watermark</h2>
    <p class="mt-2 text-sm text-slate-600">Select a watermark region and smooth it to restore readability.</p>
    <p class="status-pill mt-3">{{ status }}</p>

    <label class="mt-5 block rounded-2xl bg-white/70 p-4 text-sm font-semibold">
      Target Image
      <input type="file" accept="image/*" class="field-control mt-2" @change="onRemoveFileChange" >
    </label>

    <div class="mt-4 overflow-auto rounded-2xl border border-slate-300 bg-white p-3">
      <canvas
        v-show="removePreview"
        ref="removeCanvas"
        class="mx-auto max-h-[480px] max-w-full touch-none cursor-crosshair"
        @pointerdown="startSelectRemove"
        @pointermove="moveSelectRemove"
        @pointerup="endSelectRemove"
        @pointerleave="endSelectRemove"
      />
      <p v-if="!removePreview" class="py-16 text-center text-sm text-slate-500">Upload an image to begin watermark removal.</p>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button class="btn-primary" @click="applyWatermarkRemoval">Remove Watermark</button>
      <button class="btn-secondary" @click="downloadRemovedResult">Download Result</button>
    </div>
  </section>
</template>
