<script setup lang="ts">
import JSZip from 'jszip'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, PDFPageProxy } from 'pdfjs-dist'
import { pdfPixelsToRgba, validatePdfRegion } from '../utils/pdf-images'
import type { PdfImagePixels, PdfImageRegion } from '../utils/pdf-images'
import { validateDimensions } from '../utils/processing'

let extractionGeneration = 0
let activeTask: PDFDocumentLoadingTask | null = null
let disposed = false

type ExtractedPdfImage = {
  id: string
  name: string
  blob: Blob
  previewUrl: string
  selected: boolean
}

const status = ref('Ready')
const pdfFile = ref<File | null>(null)
const pdfFormat = ref<'png' | 'jpg'>('png')
const pdfQuality = ref(90)
const pdfBusy = ref(false)
const pdfDownloading = ref(false)
const pdfProgress = ref(0)
const pdfExtractedImages = ref<ExtractedPdfImage[]>([])

const pdfSelectedCount = computed(() => pdfExtractedImages.value.filter((image) => image.selected).length)
const pdfHasImages = computed(() => pdfExtractedImages.value.length > 0)

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

function imageDataToCanvas(imageData: PdfImagePixels) {
  validateDimensions(imageData.width, imageData.height)
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create the image canvas.')
  if (imageData.bitmap) context.drawImage(imageData.bitmap, 0, 0)
  else context.putImageData(new ImageData(pdfPixelsToRgba(imageData), imageData.width, imageData.height), 0, 0)
  return canvas
}

async function pdfCanvasToBlob(canvas: HTMLCanvasElement, format: 'png' | 'jpg', qualityPercent: number, region?: PdfImageRegion) {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const quality = format === 'jpg' ? qualityPercent / 100 : 1
  if (!region) return await canvasToBlob(canvas, mime, quality)
  validatePdfRegion(region, canvas.width, canvas.height)
  const cropped = document.createElement('canvas')
  cropped.width = region.w
  cropped.height = region.h
  const cropContext = cropped.getContext('2d')
  if (!cropContext) throw new Error('Could not crop the grouped PDF image.')
  cropContext.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h)
  try { return await canvasToBlob(cropped, mime, quality) }
  finally { cropped.width = cropped.height = 0 }
}

function getPdfObject(page: PDFPageProxy, objId: string): Promise<PdfImagePixels | null> {
  const objects = objId.startsWith('g_') ? page.commonObjs : page.objs
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out reading a PDF image.')), 15000)
    const finish = (value: PdfImagePixels | null) => { clearTimeout(timer); resolve(value) }
    try {
      if (objects.has(objId)) finish(objects.get(objId))
      else objects.get(objId, finish)
    } catch (error) { clearTimeout(timer); reject(error) }
  })
}

function clearPdfExtractedImages() {
  for (const image of pdfExtractedImages.value) {
    URL.revokeObjectURL(image.previewUrl)
  }
  pdfExtractedImages.value = []
}

function onPdfFileChange(event: Event) {
  if (pdfBusy.value || pdfDownloading.value) return
  const target = event.target as HTMLInputElement
  pdfFile.value = target.files?.[0] ?? null
  clearPdfExtractedImages()
  pdfProgress.value = 0
}

function toggleSelectAllPdfImages() {
  const shouldSelectAll = pdfSelectedCount.value !== pdfExtractedImages.value.length
  pdfExtractedImages.value = pdfExtractedImages.value.map((image) => ({ ...image, selected: shouldSelectAll }))
}

async function downloadSinglePdfImage(image: ExtractedPdfImage) {
  pdfDownloading.value = true
  try {
    downloadBlob(image.blob, image.name)
    setStatus(`Downloaded ${image.name}.`)
  } finally {
    pdfDownloading.value = false
  }
}

async function downloadSelectedPdfImages() {
  const selectedImages = pdfExtractedImages.value.filter((image) => image.selected)
  if (!selectedImages.length) {
    setStatus('Select at least one extracted image to download.')
    return
  }

  pdfDownloading.value = true
  setStatus(`Preparing ${selectedImages.length} selected image(s) for download...`)

  try {
    if (selectedImages.length === 1) {
      downloadBlob(selectedImages[0]!.blob, selectedImages[0]!.name)
    } else {
      await toZipAndDownload(
        selectedImages.map((image) => ({ name: image.name, blob: image.blob })),
        'selected-pdf-images.zip'
      )
    }
    setStatus(`Downloaded ${selectedImages.length} selected image(s).`)
  } catch (error) {
    console.error(error)
    setStatus('Selected download failed. Please try again.')
  } finally {
    pdfDownloading.value = false
  }
}

async function extractPdfImages() {
  if (pdfBusy.value || pdfDownloading.value) return
  const file = pdfFile.value
  if (!file) { setStatus('Select a PDF first.'); return }
  const generation = ++extractionGeneration
  const format = pdfFormat.value, quality = pdfQuality.value
  const files: ExtractedPdfImage[] = []
  let task: PDFDocumentLoadingTask | null = null
  let published = false
  const isCurrent = () => !disposed && generation === extractionGeneration
  pdfBusy.value = true
  pdfProgress.value = 0
  clearPdfExtractedImages()
  setStatus('Extracting embedded images from PDF...')
  try {
    if (file.size > 64 * 1024 * 1024) throw new Error('Choose a PDF smaller than 64 MB.')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const data = await file.arrayBuffer()
    if (!isCurrent()) return
    task = pdfjs.getDocument({ data })
    activeTask = task
    const pdfDocument = await task.promise
    const seenObjectIds = new Set<string>()
    let totalBytes = 0
    async function appendCanvas(canvas: HTMLCanvasElement, region?: PdfImageRegion) {
      if (!isCurrent()) return
      if (files.length >= 500) throw new Error('This PDF contains too many images. Split it into smaller documents.')
      const blob = await pdfCanvasToBlob(canvas, format, quality, region)
      if (!isCurrent()) return
      totalBytes += blob.size
      if (totalBytes > 128 * 1024 * 1024) throw new Error('Extracted images exceed 128 MB. Split this PDF into smaller documents.')
      const index = files.length + 1
      files.push({ id: String(index), name: 'image-' + index + '.' + format, blob, previewUrl: URL.createObjectURL(blob), selected: true })
    }
    async function append(image: PdfImagePixels | null) {
      if (!image || !isCurrent()) return
      const canvas = imageDataToCanvas(image)
      try { await appendCanvas(canvas) }
      finally { canvas.width = canvas.height = 0 }
    }
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      if (!isCurrent()) return
      const page = await pdfDocument.getPage(pageNumber)
      try {
        const operators = await page.getOperatorList()
        for (let op = 0; op < operators.fnArray.length; op++) {
          if (!isCurrent()) return
          const fn = operators.fnArray[op], args = operators.argsArray[op] || []
          if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
            const id = String(args[0] || '')
            // Page-local IDs may repeat; shared objects use the common pool.
            const key = id.startsWith('g_') ? id : pageNumber + ':' + id
            if (!id || seenObjectIds.has(key)) continue
            await append(await getPdfObject(page, id))
            seenObjectIds.add(key)
          } else if (fn === pdfjs.OPS.paintInlineImageXObject) {
            await append(args[0] as PdfImagePixels)
          } else if (fn === pdfjs.OPS.paintInlineImageXObjectGroup) {
            const regions = args[1] as PdfImageRegion[]
            if (!Array.isArray(regions)) throw new Error('PDF contains an invalid grouped image map.')
            // The first argument is an atlas. Export each original region,
            // rather than treating the atlas as a single embedded image.
            const atlas = imageDataToCanvas(args[0] as PdfImagePixels)
            try { for (const region of regions) await appendCanvas(atlas, region) }
            finally { atlas.width = atlas.height = 0 }
          }
        }
      } finally { page.cleanup() }
      pdfProgress.value = Math.round(pageNumber / pdfDocument.numPages * 100)
    }
    if (!isCurrent()) return
    pdfExtractedImages.value = files
    published = true
    setStatus(files.length ? 'Done. Extracted ' + files.length + ' embedded image(s).' : 'No embedded images were found in this PDF.')
  } catch (error) {
    if (isCurrent()) setStatus(error instanceof Error ? error.message : 'Extraction failed. Try another PDF.')
  } finally {
    if (!published) for (const image of files) URL.revokeObjectURL(image.previewUrl)
    if (activeTask === task) activeTask = null
    await task?.destroy().catch(() => {})
    if (isCurrent()) pdfBusy.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
  extractionGeneration++
  void activeTask?.destroy().catch(() => {})
  activeTask = null
  clearPdfExtractedImages()
})
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Extract Images</h2>
    <p class="mt-2 text-sm text-slate-600">Upload a PDF, extract embedded images, preview, and download one or many.</p>
    <p class="status-pill mt-3" role="status" aria-live="polite">{{ status }}</p>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="block rounded-2xl bg-white/70 p-4">
        <span class="mb-2 block text-sm font-semibold">Upload PDF</span>
        <input type="file" accept="application/pdf" class="field-control" :disabled="pdfBusy || pdfDownloading" @change="onPdfFileChange" >
      </label>

      <div class="grid gap-3 rounded-2xl bg-white/70 p-4 sm:grid-cols-2">
        <label class="text-sm font-semibold">
          Output Format
          <select v-model="pdfFormat" class="field-control mt-1" :disabled="pdfBusy">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <label class="text-sm font-semibold sm:col-span-2" v-if="pdfFormat === 'jpg'">
          JPG Quality ({{ pdfQuality }}%)
          <input v-model.number="pdfQuality" :disabled="pdfBusy" type="range" min="10" max="100" class="mt-2 w-full" >
        </label>
      </div>
    </div>

    <div v-if="pdfBusy" class="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <p class="text-sm font-semibold text-teal-800">Processing PDF... {{ pdfProgress }}%</p>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-teal-100">
        <div class="h-full rounded-full bg-gradient-to-r from-teal-600 to-cyan-500 transition-all duration-300" :style="{ width: `${pdfProgress}%` }" />
      </div>
    </div>

    <div v-if="pdfDownloading" class="mt-4 rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm font-semibold text-slate-700">
      Downloading images...
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <button class="btn-primary disabled:opacity-60" :disabled="pdfBusy || pdfDownloading" @click="extractPdfImages">
        {{ pdfBusy ? 'Extracting...' : 'Extract Images' }}
      </button>
      <button
        class="btn-secondary disabled:opacity-60"
        :disabled="!pdfHasImages || pdfBusy || pdfDownloading"
        @click="toggleSelectAllPdfImages"
      >
        {{ pdfSelectedCount === pdfExtractedImages.length && pdfExtractedImages.length ? 'Unselect All' : 'Select All' }}
      </button>
      <button
        class="btn-warn disabled:opacity-60"
        :disabled="pdfSelectedCount === 0 || pdfBusy || pdfDownloading"
        @click="downloadSelectedPdfImages"
      >
        Download Selected ({{ pdfSelectedCount }})
      </button>
    </div>

    <div v-if="pdfHasImages" class="mt-5 space-y-3">
      <p class="text-sm font-semibold text-slate-700">Extracted Images ({{ pdfExtractedImages.length }})</p>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="image in pdfExtractedImages"
          :key="image.id"
          class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <img :src="image.previewUrl" :alt="image.name" class="h-40 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain">
          <div class="mt-3 space-y-2">
            <p class="truncate text-sm font-semibold" :title="image.name">{{ image.name }}</p>
            <label class="inline-flex items-center gap-2 text-sm">
              <input v-model="image.selected" type="checkbox" >
              Select
            </label>
            <button
              class="btn-secondary w-full disabled:opacity-60"
              :disabled="pdfBusy || pdfDownloading"
              @click="downloadSinglePdfImage(image)"
            >
              Download
            </button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
