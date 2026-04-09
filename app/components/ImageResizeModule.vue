<script setup lang="ts">
import JSZip from 'jszip'

type ResizePreviewImage = {
  id: string
  name: string
  previewUrl: string
  width: number
  height: number
  sizeKb: number
}

const status = ref('Ready')
const resizeFiles = ref<File[]>([])
const resizeWidth = ref(1920)
const resizeHeight = ref(1080)
const resizeKeepAspect = ref(true)
const resizeFormat = ref<'original' | 'png' | 'jpg' | 'webp'>('original')
const resizeQuality = ref(90)
const resizeBusy = ref(false)
const resizePreviews = ref<ResizePreviewImage[]>([])

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

async function toZipAndDownload(files: Array<{ name: string; blob: Blob }>, zipName: string) {
  const zip = new JSZip()
  files.forEach((file) => zip.file(file.name, file.blob))
  const content = await zip.generateAsync({ type: 'blob' })
  downloadBlob(content, zipName)
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

function clearResizePreviews() {
  for (const image of resizePreviews.value) {
    URL.revokeObjectURL(image.previewUrl)
  }
  resizePreviews.value = []
}

async function onResizeFilesChange(event: Event) {
  const target = event.target as HTMLInputElement
  resizeFiles.value = target.files ? Array.from(target.files) : []
  clearResizePreviews()

  if (!resizeFiles.value.length) {
    return
  }

  const previews = await Promise.all(
    resizeFiles.value.map(async (file, index) => {
      const image = await readImage(file)
      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        width: image.width,
        height: image.height,
        sizeKb: Math.max(1, Math.round(file.size / 1024))
      }
    })
  )

  resizePreviews.value = previews
}

async function resizeImages() {
  if (!resizeFiles.value.length) {
    setStatus('Select image files first.')
    return
  }

  resizeBusy.value = true
  setStatus('Resizing images...')

  try {
    const outputs: Array<{ name: string; blob: Blob }> = []

    for (const file of resizeFiles.value) {
      const image = await readImage(file)
      let targetWidth = Math.max(1, Math.round(resizeWidth.value))
      let targetHeight = Math.max(1, Math.round(resizeHeight.value))

      if (resizeKeepAspect.value) {
        const ratio = Math.min(targetWidth / image.width, targetHeight / image.height)
        targetWidth = Math.max(1, Math.round(image.width * ratio))
        targetHeight = Math.max(1, Math.round(image.height * ratio))
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const context = canvas.getContext('2d')
      if (!context) {
        continue
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight)

      const extension =
        resizeFormat.value === 'original' ? file.name.split('.').pop()?.toLowerCase() || 'png' : resizeFormat.value

      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp'
      }

      const mime = mimeMap[extension] || 'image/png'
      const quality = mime === 'image/jpeg' || mime === 'image/webp' ? resizeQuality.value / 100 : 1
      const blob = await canvasToBlob(canvas, mime, quality)
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      outputs.push({ name: `${baseName}-resized.${extension === 'jpeg' ? 'jpg' : extension}`, blob })
    }

    if (outputs.length === 1) {
      downloadBlob(outputs[0].blob, outputs[0].name)
    } else {
      await toZipAndDownload(outputs, 'resized-images.zip')
    }

    setStatus(`Done. Resized ${outputs.length} image(s).`)
  } catch (error) {
    console.error(error)
    setStatus('Resize failed. Try with a different file set.')
  } finally {
    resizeBusy.value = false
  }
}

onBeforeUnmount(() => {
  clearResizePreviews()
})
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Resize Images</h2>
    <p class="mt-2 text-sm text-slate-600">Upload one or more images, review previews, then export resized files.</p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="rounded-2xl bg-white/70 p-4">
        <span class="mb-2 block text-sm font-semibold">Input Images</span>
        <input type="file" accept="image/*" multiple class="field-control" @change="onResizeFilesChange" >
      </label>
      <div class="grid gap-3 rounded-2xl bg-white/70 p-4 sm:grid-cols-2">
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
        <label class="sm:col-span-2 inline-flex items-center gap-2 text-sm font-semibold">
          <input v-model="resizeKeepAspect" type="checkbox" >
          Keep aspect ratio
        </label>
      </div>
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

    <button class="btn-primary mt-4 disabled:opacity-60" :disabled="resizeBusy" @click="resizeImages">
      {{ resizeBusy ? 'Resizing...' : 'Resize Images' }}
    </button>
  </section>
</template>
