<script setup lang="ts">
import JSZip from 'jszip'

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

function imageDataToCanvas(imageData: {
  width: number
  height: number
  data?: Uint8Array | Uint8ClampedArray
  bitmap?: ImageBitmap
}) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  if (imageData.bitmap) {
    context.drawImage(imageData.bitmap, 0, 0, imageData.width, imageData.height)
    return canvas
  }

  if (!imageData.data) {
    return null
  }

  const source = imageData.data
  const pixels = imageData.width * imageData.height
  let rgba: Uint8ClampedArray

  if (source.length === pixels * 4) {
    rgba = source instanceof Uint8ClampedArray ? source : new Uint8ClampedArray(source)
  } else if (source.length === pixels * 3) {
    rgba = new Uint8ClampedArray(pixels * 4)
    for (let i = 0, j = 0; i < source.length; i += 3, j += 4) {
      rgba[j] = source[i]
      rgba[j + 1] = source[i + 1]
      rgba[j + 2] = source[i + 2]
      rgba[j + 3] = 255
    }
  } else if (source.length === pixels) {
    rgba = new Uint8ClampedArray(pixels * 4)
    for (let i = 0, j = 0; i < source.length; i += 1, j += 4) {
      const value = source[i]
      rgba[j] = value
      rgba[j + 1] = value
      rgba[j + 2] = value
      rgba[j + 3] = 255
    }
  } else {
    return null
  }

  const out = new ImageData(rgba, imageData.width, imageData.height)
  context.putImageData(out, 0, 0)
  return canvas
}

function getPdfObject(page: any, objId: string) {
  return new Promise<any>((resolve, reject) => {
    try {
      if (page.objs.has(objId)) {
        resolve(page.objs.get(objId))
        return
      }
      page.objs.get(objId, (data: any) => resolve(data))
    } catch (error) {
      reject(error)
    }
  })
}

async function pdfImageDataToBlob(
  imageData: { width: number; height: number; data?: Uint8Array | Uint8ClampedArray; bitmap?: ImageBitmap },
  format: 'png' | 'jpg',
  qualityPercent: number
) {
  const canvas = imageDataToCanvas(imageData)
  if (!canvas) {
    return null
  }
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const quality = format === 'jpg' ? qualityPercent / 100 : 1
  return await canvasToBlob(canvas, mime, quality)
}

function clearPdfExtractedImages() {
  for (const image of pdfExtractedImages.value) {
    URL.revokeObjectURL(image.previewUrl)
  }
  pdfExtractedImages.value = []
}

function onPdfFileChange(event: Event) {
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
      downloadBlob(selectedImages[0].blob, selectedImages[0].name)
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
  if (!pdfFile.value) {
    setStatus('Select a PDF first.')
    return
  }

  pdfBusy.value = true
  pdfProgress.value = 0
  clearPdfExtractedImages()
  setStatus('Extracting embedded images from PDF...')

  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

    const data = await pdfFile.value.arrayBuffer()
    const pdfDocument = await pdfjs.getDocument({ data }).promise
    const files: ExtractedPdfImage[] = []
    const seenObjectIds = new Set<string>()
    let index = 1

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const operatorList = await page.getOperatorList()

      for (let opIndex = 0; opIndex < operatorList.fnArray.length; opIndex += 1) {
        const fn = operatorList.fnArray[opIndex]
        const args = operatorList.argsArray[opIndex] || []

        if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
          const objId = String(args[0])
          if (!objId || seenObjectIds.has(objId)) {
            continue
          }

          const imageObj = await getPdfObject(page, objId)
          const blob = await pdfImageDataToBlob(imageObj, pdfFormat.value, pdfQuality.value)
          if (!blob) {
            continue
          }

          seenObjectIds.add(objId)
          files.push({
            id: `${pageNumber}-${index}-${objId}`,
            name: `image-${index}.${pdfFormat.value}`,
            blob,
            previewUrl: URL.createObjectURL(blob),
            selected: true
          })
          index += 1
          continue
        }

        if (fn === pdfjs.OPS.paintInlineImageXObject || fn === pdfjs.OPS.paintInlineImageXObjectGroup) {
          const inlineImage = args[0]
          const blob = await pdfImageDataToBlob(inlineImage, pdfFormat.value, pdfQuality.value)
          if (!blob) {
            continue
          }

          files.push({
            id: `${pageNumber}-${index}-inline`,
            name: `image-${index}.${pdfFormat.value}`,
            blob,
            previewUrl: URL.createObjectURL(blob),
            selected: true
          })
          index += 1
        }
      }

      pdfProgress.value = Math.round((pageNumber / pdfDocument.numPages) * 100)
    }

    if (!files.length) {
      setStatus('No embedded images were found in this PDF.')
      return
    }

    pdfExtractedImages.value = files
    setStatus(`Done. Extracted ${files.length} embedded image(s).`)
  } catch (error) {
    console.error(error)
    setStatus('Extraction failed. Try another PDF.')
  } finally {
    pdfBusy.value = false
  }
}

onBeforeUnmount(() => {
  clearPdfExtractedImages()
})
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Extract Images</h2>
    <p class="mt-2 text-sm text-slate-600">Upload a PDF, extract embedded images, preview, and download one or many.</p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="block rounded-2xl bg-white/70 p-4">
        <span class="mb-2 block text-sm font-semibold">Upload PDF</span>
        <input type="file" accept="application/pdf" class="field-control" @change="onPdfFileChange" >
      </label>

      <div class="grid gap-3 rounded-2xl bg-white/70 p-4 sm:grid-cols-2">
        <label class="text-sm font-semibold">
          Output Format
          <select v-model="pdfFormat" class="field-control mt-1">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <label class="text-sm font-semibold sm:col-span-2" v-if="pdfFormat === 'jpg'">
          JPG Quality ({{ pdfQuality }}%)
          <input v-model.number="pdfQuality" type="range" min="10" max="100" class="mt-2 w-full" >
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
