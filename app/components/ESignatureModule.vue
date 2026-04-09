<script setup lang="ts">
const status = ref('Ready')
const signCanvas = ref<HTMLCanvasElement | null>(null)
const signatureUpload = ref<File | null>(null)
const signaturePreview = ref('')
const drawing = ref(false)
const signatureColor = ref('#111827')
const signatureWidth = ref(3)
let lastX = 0
let lastY = 0

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

function getCanvasPoint(event: PointerEvent) {
  const canvas = signCanvas.value
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

function startDraw(event: PointerEvent) {
  const canvas = signCanvas.value
  if (!canvas) {
    return
  }
  drawing.value = true
  const point = getCanvasPoint(event)
  lastX = point.x
  lastY = point.y
  canvas.setPointerCapture(event.pointerId)
}

function moveDraw(event: PointerEvent) {
  if (!drawing.value || !signCanvas.value) {
    return
  }

  const context = signCanvas.value.getContext('2d')
  if (!context) {
    return
  }

  const point = getCanvasPoint(event)
  context.strokeStyle = signatureColor.value
  context.lineWidth = signatureWidth.value
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(lastX, lastY)
  context.lineTo(point.x, point.y)
  context.stroke()
  lastX = point.x
  lastY = point.y
}

function endDraw(event: PointerEvent) {
  if (!signCanvas.value) {
    return
  }
  drawing.value = false
  signCanvas.value.releasePointerCapture(event.pointerId)
}

function clearSignature() {
  const canvas = signCanvas.value
  if (!canvas) {
    return
  }
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }
  context.clearRect(0, 0, canvas.width, canvas.height)
  setStatus('Signature canvas cleared.')
}

async function downloadDrawnSignature() {
  if (!signCanvas.value) {
    return
  }
  const blob = await canvasToBlob(signCanvas.value, 'image/png', 1)
  downloadBlob(blob, 'signature.png')
  setStatus('Drawn signature downloaded.')
}

function onSignatureUploadChange(event: Event) {
  const target = event.target as HTMLInputElement
  signatureUpload.value = target.files?.[0] ?? null
  if (!signatureUpload.value) {
    signaturePreview.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    signaturePreview.value = String(reader.result)
    setStatus('Uploaded signature preview ready.')
  }
  reader.readAsDataURL(signatureUpload.value)
}

function downloadUploadedSignature() {
  if (!signatureUpload.value) {
    setStatus('Upload a signature image first.')
    return
  }
  downloadBlob(signatureUpload.value, signatureUpload.value.name)
  setStatus('Uploaded signature downloaded.')
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Add Signature</h2>
    <p class="mt-2 text-sm text-slate-600">Draw a signature or upload one, then export it as needed.</p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="space-y-3 rounded-2xl bg-white/70 p-4">
        <p class="text-sm font-semibold">Draw Signature</p>
        <canvas
          ref="signCanvas"
          width="900"
          height="260"
          class="w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
          @pointerdown="startDraw"
          @pointermove="moveDraw"
          @pointerup="endDraw"
          @pointerleave="endDraw"
        />
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">
            Pen Color
            <input v-model="signatureColor" type="color" class="mt-1 block h-10 w-full rounded-lg border border-slate-300" >
          </label>
          <label class="text-sm font-semibold">
            Pen Size
            <input v-model.number="signatureWidth" type="range" min="1" max="8" class="mt-3 w-full" >
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary" @click="downloadDrawnSignature">Download Signature</button>
          <button class="btn-ghost" @click="clearSignature">Clear</button>
        </div>
      </div>

      <div class="space-y-3 rounded-2xl bg-white/70 p-4">
        <p class="text-sm font-semibold">Upload Signature</p>
        <input type="file" accept="image/*" class="field-control" @change="onSignatureUploadChange" >
        <div class="flex min-h-52 items-center justify-center rounded-xl border border-slate-300 bg-white p-4">
          <img v-if="signaturePreview" :src="signaturePreview" alt="Uploaded signature" class="max-h-48 max-w-full object-contain">
          <p v-else class="text-sm text-slate-500">No uploaded signature preview yet.</p>
        </div>
        <button class="btn-secondary" @click="downloadUploadedSignature">
          Download Uploaded Signature
        </button>
      </div>
    </div>
  </section>
</template>
