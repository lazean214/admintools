<script setup lang="ts">
import JSZip from 'jszip'

const status = ref('Ready')
const wmBaseFiles = ref<File[]>([])
const wmThumbnails = ref<string[]>([])
const wmSelectedIndex = ref(0)
const wmPreviewImage = ref<HTMLImageElement | null>(null)
const wmType = ref<'text' | 'image'>('text')
const wmText = ref('CONFIDENTIAL')
const wmColor = ref('#ffffff')
const wmSize = ref(40)
const wmOpacity = ref(0.35)
const wmPosition = ref<'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right'>('center')
const wmImageFile = ref<File | null>(null)
const wmImagePreview = ref('')
const wmImageScale = ref(0.25)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const wmWatermarkImage = ref<HTMLImageElement | null>(null)

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

async function onBaseWatermarkImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) {
    wmBaseFiles.value = []
    wmThumbnails.value = []
    wmSelectedIndex.value = 0
    wmPreviewImage.value = null
    return
  }
  wmBaseFiles.value = Array.from(files)
  wmThumbnails.value = await Promise.all(
    wmBaseFiles.value.map((file) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(file)
      })
    )
  )
  wmSelectedIndex.value = 0
  wmPreviewImage.value = await readImage(wmBaseFiles.value[0]!)
  drawPreview()
}

async function selectPreviewImage(index: number) {
  wmSelectedIndex.value = index
  wmPreviewImage.value = await readImage(wmBaseFiles.value[index]!)
  drawPreview()
}

function onWatermarkImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  wmImageFile.value = target.files?.[0] ?? null
  wmImagePreview.value = ''
  wmWatermarkImage.value = null
  if (!wmImageFile.value) {
    drawPreview()
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    wmImagePreview.value = String(reader.result)
    if (wmImageFile.value) {
      wmWatermarkImage.value = await readImage(wmImageFile.value)
      drawPreview()
    }
  }
  reader.readAsDataURL(wmImageFile.value)
}

function getWatermarkPosition(
  position: 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right',
  baseWidth: number,
  baseHeight: number,
  markWidth: number,
  markHeight: number,
  padding = 24
) {
  if (position === 'top-left') {
    return { x: padding, y: padding }
  }
  if (position === 'top-right') {
    return { x: baseWidth - markWidth - padding, y: padding }
  }
  if (position === 'bottom-left') {
    return { x: padding, y: baseHeight - markHeight - padding }
  }
  if (position === 'bottom-right') {
    return { x: baseWidth - markWidth - padding, y: baseHeight - markHeight - padding }
  }
  return { x: (baseWidth - markWidth) / 2, y: (baseHeight - markHeight) / 2 }
}

function drawPreview() {
  const canvas = previewCanvas.value
  const baseImg = wmPreviewImage.value
  if (!canvas || !baseImg) return

  const maxW = canvas.clientWidth * (window.devicePixelRatio || 1)
  const scale = Math.min(maxW / baseImg.width, 1)
  canvas.width = baseImg.width * scale
  canvas.height = baseImg.height * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = wmOpacity.value

  if (wmType.value === 'text') {
    const fontSize = wmSize.value * scale
    ctx.fillStyle = wmColor.value
    ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`
    const metrics = ctx.measureText(wmText.value)
    const markW = metrics.width
    const markH = fontSize
    const padding = 24 * scale
    const pt = getWatermarkPosition(wmPosition.value, canvas.width, canvas.height, markW, markH, padding)
    ctx.fillText(wmText.value, pt.x, pt.y + markH)
  } else if (wmWatermarkImage.value) {
    const markW = canvas.width * wmImageScale.value
    const markH = (wmWatermarkImage.value.height / wmWatermarkImage.value.width) * markW
    const padding = 24 * scale
    const pt = getWatermarkPosition(wmPosition.value, canvas.width, canvas.height, markW, markH, padding)
    ctx.drawImage(wmWatermarkImage.value, pt.x, pt.y, markW, markH)
  }

  ctx.globalAlpha = 1
}

watch(
  [wmType, wmText, wmColor, wmSize, wmOpacity, wmPosition, wmImageScale, wmPreviewImage, wmWatermarkImage],
  () => drawPreview(),
  { flush: 'post' }
)

function applyWatermark(
  baseImage: HTMLImageElement,
  watermarkImage: HTMLImageElement | null,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = baseImage.width
  canvas.height = baseImage.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(baseImage, 0, 0)
  ctx.globalAlpha = wmOpacity.value

  if (wmType.value === 'text') {
    ctx.fillStyle = wmColor.value
    ctx.font = `700 ${wmSize.value}px "Space Grotesk", sans-serif`
    const metrics = ctx.measureText(wmText.value)
    const markW = metrics.width
    const markH = wmSize.value
    const pt = getWatermarkPosition(wmPosition.value, canvas.width, canvas.height, markW, markH)
    ctx.fillText(wmText.value, pt.x, pt.y + markH)
  } else if (watermarkImage) {
    const markW = canvas.width * wmImageScale.value
    const markH = (watermarkImage.height / watermarkImage.width) * markW
    const pt = getWatermarkPosition(wmPosition.value, canvas.width, canvas.height, markW, markH)
    ctx.drawImage(watermarkImage, pt.x, pt.y, markW, markH)
  }

  ctx.globalAlpha = 1
  return canvas
}

async function addWatermark() {
  if (wmBaseFiles.value.length === 0) {
    setStatus('Select at least one base image.')
    return
  }

  if (wmType.value === 'image' && !wmImageFile.value) {
    setStatus('Select watermark image before applying.')
    return
  }

  try {
    const watermarkImage = wmType.value === 'image' && wmImageFile.value
      ? await readImage(wmImageFile.value)
      : null

    const total = wmBaseFiles.value.length
    const zip = new JSZip()

    for (let i = 0; i < total; i++) {
      setStatus(`Processing ${i + 1} of ${total}...`)
      const file = wmBaseFiles.value[i]!
      const baseImage = await readImage(file)
      const canvas = applyWatermark(baseImage, watermarkImage)
      const outputBlob = await canvasToBlob(canvas, 'image/png', 1)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      zip.file(`${baseName}_watermarked.png`, outputBlob)
    }

    setStatus('Creating ZIP...')
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(zipBlob, 'watermarked_images.zip')
    setStatus(`Done — ${total} image${total > 1 ? 's' : ''} watermarked.`)
  } catch (error) {
    console.error(error)
    setStatus('Watermark process failed.')
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Add Watermark</h2>
    <p class="mt-2 text-sm text-slate-600">Use text or image watermarks with custom style and position. Supports batch processing.</p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="space-y-3 rounded-2xl bg-white/70 p-4">
        <label class="block text-sm font-semibold">
          Images
          <span v-if="wmBaseFiles.length > 0" class="ml-1 font-normal text-slate-500">({{ wmBaseFiles.length }} selected)</span>
          <input type="file" accept="image/*" multiple class="field-control mt-2" @change="onBaseWatermarkImageChange" >
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
            @click="selectPreviewImage(idx)"
          >
            <img :src="thumb" :alt="`Thumbnail ${idx + 1}`" class="h-16 w-16 rounded object-cover" >
          </button>
        </div>
      </div>

      <div class="space-y-3 rounded-2xl bg-white/70 p-4">
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

        <button class="btn-primary" @click="addWatermark">
          Add Watermark &amp; Download ZIP<span v-if="wmBaseFiles.length > 1"> ({{ wmBaseFiles.length }} images)</span>
        </button>
      </div>
    </div>
  </section>
</template>
