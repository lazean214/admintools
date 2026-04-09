<script setup lang="ts">
const status = ref('Ready')
const wmBaseFile = ref<File | null>(null)
const wmBasePreview = ref('')
const wmType = ref<'text' | 'image'>('text')
const wmText = ref('CONFIDENTIAL')
const wmColor = ref('#ffffff')
const wmSize = ref(40)
const wmOpacity = ref(0.35)
const wmPosition = ref<'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right'>('center')
const wmImageFile = ref<File | null>(null)
const wmImagePreview = ref('')
const wmImageScale = ref(0.25)

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

function onBaseWatermarkImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  wmBaseFile.value = target.files?.[0] ?? null
  wmBasePreview.value = ''
  if (!wmBaseFile.value) {
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    wmBasePreview.value = String(reader.result)
  }
  reader.readAsDataURL(wmBaseFile.value)
}

function onWatermarkImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  wmImageFile.value = target.files?.[0] ?? null
  wmImagePreview.value = ''
  if (!wmImageFile.value) {
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    wmImagePreview.value = String(reader.result)
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

async function addWatermark() {
  if (!wmBaseFile.value) {
    setStatus('Select a base image first.')
    return
  }

  try {
    const baseImage = await readImage(wmBaseFile.value)
    const canvas = document.createElement('canvas')
    canvas.width = baseImage.width
    canvas.height = baseImage.height
    const context = canvas.getContext('2d')
    if (!context) {
      setStatus('Could not access canvas context.')
      return
    }

    context.drawImage(baseImage, 0, 0)
    context.globalAlpha = wmOpacity.value

    if (wmType.value === 'text') {
      context.fillStyle = wmColor.value
      context.font = `700 ${wmSize.value}px \"Space Grotesk\", sans-serif`
      const metrics = context.measureText(wmText.value)
      const markWidth = metrics.width
      const markHeight = wmSize.value
      const point = getWatermarkPosition(wmPosition.value, canvas.width, canvas.height, markWidth, markHeight)
      context.fillText(wmText.value, point.x, point.y + markHeight)
    } else {
      if (!wmImageFile.value) {
        setStatus('Select watermark image before applying.')
        return
      }
      const watermarkImage = await readImage(wmImageFile.value)
      const markWidth = canvas.width * wmImageScale.value
      const markHeight = (watermarkImage.height / watermarkImage.width) * markWidth
      const point = getWatermarkPosition(wmPosition.value, canvas.width, canvas.height, markWidth, markHeight)
      context.drawImage(watermarkImage, point.x, point.y, markWidth, markHeight)
    }

    context.globalAlpha = 1
    const outputBlob = await canvasToBlob(canvas, 'image/png', 1)
    downloadBlob(outputBlob, 'watermarked.png')
    setStatus('Watermarked image downloaded.')
  } catch (error) {
    console.error(error)
    setStatus('Watermark process failed.')
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Add Watermark</h2>
    <p class="mt-2 text-sm text-slate-600">Use text or image watermarks with custom style and position.</p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="space-y-3 rounded-2xl bg-white/70 p-4">
        <label class="block text-sm font-semibold">
          Base Image
          <input type="file" accept="image/*" class="field-control mt-2" @change="onBaseWatermarkImageChange" >
        </label>
        <div class="min-h-56 rounded-xl border border-slate-300 bg-white p-3">
          <img v-if="wmBasePreview" :src="wmBasePreview" alt="Base preview" class="max-h-52 w-full object-contain">
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

        <button class="btn-primary" @click="addWatermark">Add Watermark</button>
      </div>
    </div>
  </section>
</template>
