<script setup lang="ts">
import JSZip from 'jszip'
import { PHOTO_ACCEPT, isRawPhoto } from '../utils/photo-formats'
import { decodePhoto } from '../utils/photo-decode'
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'
import { imageResizeRegion, validateDimensions } from '../utils/processing'
import { encodeImageWithinSize, imageUpscaleFactor, orientedImageSize, rotateImageOrientation, parseImageResizePresets, validateImageResizeSettings, IMAGE_PRESET_STORAGE_KEY, type ImageResizeSettings, type SavedImagePreset } from '../utils/image-resize'

type ResizePreviewImage = { id: string; name: string; previewUrl: string; width: number; height: number; sizeKb: number; cropX: number; cropY: number; cropScale: number; originalWidth: number; originalHeight: number; rotation: number; flipX: boolean; flipY: boolean }
const status = ref('Ready')
const resizeFiles = ref<File[]>([])
let decodedFiles: Blob[] = []
let cancelDecode: (() => void) | undefined
const resizeWidth = ref(1920)
const resizeHeight = ref(1080)
const resolutionPresets = [
  { name: 'Full HD', width: 1920, height: 1080 },
  { name: 'Square', width: 1080, height: 1080 },
  { name: 'Portrait', width: 1080, height: 1350 },
  { name: 'Story', width: 1080, height: 1920 },
  { name: 'HD', width: 1280, height: 720 },
]
const selectedPreset = computed(() => resolutionPresets.find((p) => p.width === resizeWidth.value && p.height === resizeHeight.value)?.name || '')
function applyPreset(event: Event) {
  const preset = resolutionPresets.find((p) => p.name === (event.target as HTMLSelectElement).value)
  if (preset) { resizeWidth.value = preset.width; resizeHeight.value = preset.height }
}
function resetCrop(image: ResizePreviewImage) { image.cropX = 50; image.cropY = 50; image.cropScale = 1 }
const cropCorners = ['nw', 'ne', 'sw', 'se'] as const
const resizeMode = ref<'crop' | 'fit'>('crop')
const validOutput = computed(() => {
  try { validateDimensions(resizeWidth.value, resizeHeight.value); return true } catch { return false }
})
function outputSize(image: ResizePreviewImage) {
  if (!validOutput.value) return 'Enter valid output dimensions'
  const { targetWidth, targetHeight } = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, resizeMode.value)
  return targetWidth + ' × ' + targetHeight + ' px'
}
const resizeFormat = ref<'original' | 'png' | 'jpg' | 'webp'>('original')
const resizeMethod = ref<'standard' | 'lanczos'>('lanczos')
const resizeQuality = ref(90)
const targetSizeKb = ref(0)
const savedPresets = ref<SavedImagePreset[]>([])
const presetName = ref('')
const selectedSavedPreset = ref('')
const settingsError = computed(() => {
  try { validateImageResizeSettings(currentSettings()); return '' } catch (error) { return error instanceof Error ? error.message : 'Check output settings.' }
})
function currentSettings(): ImageResizeSettings {
  return { width: resizeWidth.value, height: resizeHeight.value, mode: resizeMode.value, format: resizeFormat.value, quality: resizeQuality.value, method: resizeMethod.value, targetKb: Number(targetSizeKb.value) }
}
function persistPresets(next: SavedImagePreset[]) {
  try { localStorage.setItem(IMAGE_PRESET_STORAGE_KEY, JSON.stringify(next)); savedPresets.value = next; return true }
  catch { setStatus('Could not save presets. Browser storage may be unavailable or full.'); return false }
}
function savePreset() {
  const name = presetName.value.trim()
  if (!name || name.length > 60) { setStatus('Enter a preset name from 1 to 60 characters.'); return }
  if (settingsError.value) { setStatus(settingsError.value); return }
  if (savedPresets.value.length >= 20 && !savedPresets.value.some((p) => p.name === name)) { setStatus('You can save up to 20 presets. Remove one first.'); return }
  const next = [...savedPresets.value.filter((p) => p.name !== name), { ...currentSettings(), name }]
  if (persistPresets(next)) { selectedSavedPreset.value = name; setStatus('Saved preset “' + name + '” on this browser.'); }
}
function loadPreset() {
  const p = savedPresets.value.find((p) => p.name === selectedSavedPreset.value)
  if (!p) return
  resizeWidth.value = p.width; resizeHeight.value = p.height; resizeMode.value = p.mode
  resizeFormat.value = p.format; resizeQuality.value = p.quality; resizeMethod.value = p.method; targetSizeKb.value = p.targetKb
  presetName.value = p.name
  setStatus('Loaded preset “' + p.name + '”.')
}
function deletePreset() {
  const name = selectedSavedPreset.value
  if (persistPresets(savedPresets.value.filter((p) => p.name !== name))) { selectedSavedPreset.value = ''; setStatus('Removed preset “' + name + '”.') }
}
onMounted(() => {
  try { savedPresets.value = parseImageResizePresets(localStorage.getItem(IMAGE_PRESET_STORAGE_KEY) || '[]') }
  catch { setStatus('Saved presets could not be read. You can still resize images.'); }
})
const resizeBusy = ref(false)
const resizeLoading = ref(false)
const resizePreviews = ref<ResizePreviewImage[]>([])
const processor = new ProcessingClient(() => new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' }))
const previewProcessor = new ProcessingClient(() => new Worker(new URL('../workers/processing.worker.ts', import.meta.url), { type: 'module' }))
type OutputPreview = { signature: string; url?: string; blob?: Blob; width?: number; height?: number; quality?: number; targetMet?: boolean; error?: string }
const outputPreviews = ref<Record<string, OutputPreview>>({})
const previewBusy = ref(false)
let previewGeneration = 0
let previewTimer: ReturnType<typeof setTimeout> | undefined
let previewQueue: Promise<void> = Promise.resolve()
let generation = 0
let disposed = false
let cancelled = false

function editorImageStyle(image: ResizePreviewImage) {
  const quarterTurn = image.rotation % 180 !== 0
  return {
    width: (quarterTurn ? image.height / image.width * 100 : 100) + '%',
    height: (quarterTurn ? image.width / image.height * 100 : 100) + '%',
    transform: 'translate(-50%, -50%) scale(' + (image.flipX ? -1 : 1) + ', ' + (image.flipY ? -1 : 1) + ') rotate(' + image.rotation + 'deg)',
  }
}
function orientImage(image: ResizePreviewImage, action: 'left' | 'right' | 'flipX' | 'flipY') {
  if (resizeBusy.value || resizeLoading.value) return
  if (action === 'left' || action === 'right') {
    Object.assign(image, rotateImageOrientation(image.rotation, image.flipX, image.flipY, action))
    Object.assign(image, orientedImageSize(image.originalWidth, image.originalHeight, image.rotation))
  } else image[action] = !image[action]
  resetCrop(image)
}
function upscaleWarning(image: ResizePreviewImage) {
  if (settingsError.value) return ''
  const scale = imageUpscaleFactor(image.width, image.height, currentSettings(), image.cropX, image.cropY, image.cropScale)
  return scale > 1.001 ? 'Upscaling ' + scale.toFixed(1) + '×. This crop may look soft at the requested resolution.' : ''
}
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / (1024 * 1024)).toFixed(2) + ' MB' }
function sizeDifference(image: ResizePreviewImage) {
  const blob = outputPreviews.value[image.id]?.blob
  const original = resizeFiles.value[Number(image.id)]?.size
  if (!blob || !original) return ''
  const percent = (blob.size / original - 1) * 100
  return Math.abs(percent).toFixed(1) + '% ' + (percent <= 0 ? 'smaller' : 'larger')
}
function cropBoxStyle(image: ResizePreviewImage) {
  const region = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop', image.cropX, image.cropY, image.cropScale)
  return { left: region.sourceX / image.width * 100 + '%', top: region.sourceY / image.height * 100 + '%', width: region.sourceWidth / image.width * 100 + '%', height: region.sourceHeight / image.height * 100 + '%' }
}
let cropDrag: { image: ResizePreviewImage; pointerId: number; x: number; y: number; cropX: number; cropY: number; travelX: number; travelY: number } | null = null
function startCropDrag(event: PointerEvent, image: ResizePreviewImage) {
  if (resizeBusy.value || resizeLoading.value || !validOutput.value || !event.isPrimary || event.button !== 0) return
  const box = event.currentTarget as HTMLButtonElement
  const bounds = box.parentElement!.parentElement!.getBoundingClientRect()
  const region = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop', image.cropX, image.cropY, image.cropScale)
  cropDrag = { image, pointerId: event.pointerId, x: event.clientX, y: event.clientY, cropX: image.cropX, cropY: image.cropY, travelX: bounds.width * (1 - region.sourceWidth / image.width), travelY: bounds.height * (1 - region.sourceHeight / image.height) }
  box.setPointerCapture(event.pointerId)
  box.focus({ preventScroll: true })
  event.preventDefault()
}
function moveCropDrag(event: PointerEvent) {
  const drag = cropDrag
  if (!drag || drag.pointerId !== event.pointerId || resizeBusy.value) return
  if (drag.travelX > 0.01) drag.image.cropX = Math.max(0, Math.min(100, drag.cropX + (event.clientX - drag.x) / drag.travelX * 100))
  if (drag.travelY > 0.01) drag.image.cropY = Math.max(0, Math.min(100, drag.cropY + (event.clientY - drag.y) / drag.travelY * 100))
}
function endCropDrag(event: PointerEvent) {
  if (cropDrag?.pointerId !== event.pointerId) return
  cropDrag = null
  const box = event.currentTarget as HTMLButtonElement
  if (box.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId)
}
function nudgeCrop(event: KeyboardEvent, image: ResizePreviewImage) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || resizeBusy.value) return
  event.preventDefault()
  const step = event.shiftKey ? 10 : 1
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') image.cropX = Math.max(0, Math.min(100, image.cropX + (event.key === 'ArrowRight' ? step : -step)))
  else image.cropY = Math.max(0, Math.min(100, image.cropY + (event.key === 'ArrowDown' ? step : -step)))
}
let cropResize: { image: ResizePreviewImage; pointerId: number; corner: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; startWidth: number; startHeight: number; maxWidth: number; maxHeight: number } | null = null
function startCropResize(event: PointerEvent, image: ResizePreviewImage, corner: string) {
  if (resizeBusy.value || resizeLoading.value || !event.isPrimary || event.button !== 0) return
  const handle = event.currentTarget as HTMLButtonElement
  const bounds = handle.parentElement!.parentElement!.getBoundingClientRect()
  const r = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop', image.cropX, image.cropY, image.cropScale)
  const full = imageResizeRegion(image.width, image.height, resizeWidth.value, resizeHeight.value, 'crop')
  cropResize = { image, pointerId: event.pointerId, corner, x: event.clientX, y: event.clientY, width: bounds.width, height: bounds.height, anchorX: corner.includes('w') ? r.sourceX + r.sourceWidth : r.sourceX, anchorY: corner.includes('n') ? r.sourceY + r.sourceHeight : r.sourceY, startWidth: r.sourceWidth, startHeight: r.sourceHeight, maxWidth: full.sourceWidth, maxHeight: full.sourceHeight }
  handle.setPointerCapture(event.pointerId)
  handle.focus({ preventScroll: true })
  event.preventDefault()
}
function moveCropResize(event: PointerEvent) {
  const d = cropResize
  if (!d || d.pointerId !== event.pointerId || resizeBusy.value) return
  const sx = d.corner.includes('w') ? -1 : 1, sy = d.corner.includes('n') ? -1 : 1
  const dx = (event.clientX - d.x) / d.width * d.image.width * sx
  const dy = (event.clientY - d.y) / d.height * d.image.height * sy
  const ratio = d.maxWidth / d.maxHeight
  const desiredWidth = d.startWidth + (dx + dy / ratio) / (1 + 1 / (ratio * ratio))
  const limit = Math.min(sx < 0 ? d.anchorX : d.image.width - d.anchorX, (sy < 0 ? d.anchorY : d.image.height - d.anchorY) * ratio, d.maxWidth)
  const width = Math.max(d.maxWidth * 0.1, Math.min(limit, desiredWidth)), height = width / ratio
  d.image.cropScale = Math.max(0.1, Math.min(1, width / d.maxWidth))
  const x = sx < 0 ? d.anchorX - width : d.anchorX, y = sy < 0 ? d.anchorY - height : d.anchorY
  d.image.cropX = d.image.width - width > 0.001 ? Math.max(0, Math.min(100, x / (d.image.width - width) * 100)) : 50
  d.image.cropY = d.image.height - height > 0.001 ? Math.max(0, Math.min(100, y / (d.image.height - height) * 100)) : 50
}
function endCropResize(event: PointerEvent) {
  if (cropResize?.pointerId !== event.pointerId) return
  cropResize = null
  const handle = event.currentTarget as HTMLButtonElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}
function keyboardCropResize(event: KeyboardEvent, image: ResizePreviewImage) {
  if (resizeBusy.value || resizeLoading.value) return
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
  event.preventDefault()
  const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1
  image.cropScale = Math.max(0.1, Math.min(1, image.cropScale + direction * (event.shiftKey ? 0.1 : 0.01)))
}
function setStatus(message: string) { status.value = message }
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
async function readImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not load this photo.'))
      image.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the resized image.')), mime, quality))
}
function clearResizePreviews() {
  for (const image of resizePreviews.value) URL.revokeObjectURL(image.previewUrl)
  resizePreviews.value = []
}
async function onResizeFilesChange(event: Event) {
  if (resizeBusy.value) return
  cancelDecode?.()
  const current = ++generation
  const target = event.target as HTMLInputElement
  const files = target.files ? Array.from(target.files) : []
  const previews: ResizePreviewImage[] = []
  const decoded: Blob[] = []
  let decodedBytes = 0
  let published = false
  clearResizePreviews()
  resizeFiles.value = []
  decodedFiles = []
  resizeLoading.value = true
  setStatus('Loading previews…')
  try {
    if (files.length > 32 || files.some((file) => file.size > 32 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) {
      throw new Error('Select up to 32 images, 32 MB each and 128 MB in total.')
    }
    // Decode one at a time instead of holding every full-resolution image at once.
    for (const [index, file] of files.entries()) {
      setStatus('Loading photo ' + (index + 1) + ' of ' + files.length + '…')
      let source: Blob = file
      let image: HTMLImageElement
      try {
        if (isRawPhoto(file.name)) throw new Error('RAW needs the photo decoder.')
        image = await readImage(file)
      } catch {
        if (disposed || generation !== current) return
        const task = decodePhoto(file)
        cancelDecode = task.cancel
        try { source = await task.result } finally { cancelDecode = undefined }
        if (disposed || generation !== current) return
        image = await readImage(source)
      }
      decodedBytes += source.size
      if (decodedBytes > 128 * 1024 * 1024) throw new Error('Decoded photos exceed 128 MB. Select fewer images at a time.')
      decoded.push(source)
      if (disposed || generation !== current) return
      validateDimensions(image.width, image.height)
      previews.push({ id: String(index), name: file.name, previewUrl: URL.createObjectURL(source), width: image.width, height: image.height, sizeKb: Math.max(1, Math.round(file.size / 1024)), cropX: 50, cropY: 50, cropScale: 1, originalWidth: image.width, originalHeight: image.height, rotation: 0, flipX: false, flipY: false })
    }
    resizePreviews.value = previews
    published = true
    decodedFiles = decoded
    resizeFiles.value = files
    setStatus(files.length ? 'Ready. Choose your output dimensions and filter.' : 'Ready')
  } catch (error) {
    if (disposed || generation !== current) return
    setStatus(error instanceof Error ? error.message : 'Could not load previews.')
    target.value = ''
  } finally {
    if (!published) for (const image of previews) URL.revokeObjectURL(image.previewUrl)
    if (generation === current) resizeLoading.value = false
  }
}
function assertActive() {
  if (disposed || cancelled) throw new ProcessingCancelledError()
}
function cancelResize() {
  cancelled = true
  processor.cancel()
  setStatus('Cancelling…')
}
function outputSignature(image: ResizePreviewImage, settings = currentSettings()) {
  return JSON.stringify([generation, image.id, image.cropX, image.cropY, image.cropScale, image.rotation, image.flipX, image.flipY, settings])
}
async function renderImageOutput(file: File, edit: ResizePreviewImage, settings: ImageResizeSettings, client: ProcessingClient, check: () => void) {
  validateImageResizeSettings(settings)
  check()
  const image = await readImage(decodedFiles[Number(edit.id)] || file)
  check()
  const oriented = document.createElement('canvas'), canvas = document.createElement('canvas')
  try {
    const dimensions = orientedImageSize(image.naturalWidth, image.naturalHeight, edit.rotation)
    oriented.width = dimensions.width; oriented.height = dimensions.height
    const orientation = oriented.getContext('2d')
    if (!orientation) throw new Error('Could not create the orientation canvas.')
    orientation.translate(oriented.width / 2, oriented.height / 2)
    orientation.scale(edit.flipX ? -1 : 1, edit.flipY ? -1 : 1)
    orientation.rotate(edit.rotation * Math.PI / 180)
    orientation.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
    const r = imageResizeRegion(oriented.width, oriented.height, settings.width, settings.height, settings.mode, edit.cropX, edit.cropY, edit.cropScale)
    canvas.width = r.targetWidth; canvas.height = r.targetHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not create the output canvas.')
    if (settings.method === 'lanczos') {
      const source = document.createElement('canvas')
      try {
        source.width = Math.max(1, Math.round(r.sourceWidth)); source.height = Math.max(1, Math.round(r.sourceHeight))
        const pixels = source.getContext('2d', { willReadFrequently: true })
        if (!pixels) throw new Error('Could not read the image pixels.')
        pixels.drawImage(oriented, r.sourceX, r.sourceY, r.sourceWidth, r.sourceHeight, 0, 0, source.width, source.height)
        const rgba = pixels.getImageData(0, 0, source.width, source.height).data.buffer as ArrayBuffer
        const result = await client.resize({ rgba, width: source.width, height: source.height, targetWidth: r.targetWidth, targetHeight: r.targetHeight })
        check()
        context.putImageData(new ImageData(new Uint8ClampedArray(result), r.targetWidth, r.targetHeight), 0, 0)
      } finally { source.width = source.height = 0 }
    } else context.drawImage(oriented, r.sourceX, r.sourceY, r.sourceWidth, r.sourceHeight, 0, 0, r.targetWidth, r.targetHeight)
    const extension = settings.format === 'original' ? file.name.split('.').pop()?.toLowerCase() : settings.format
    const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png'
    if (mime === 'image/jpeg') {
      context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
    }
    const result = await encodeImageWithinSize((quality) => canvasToBlob(canvas, mime, mime === 'image/png' ? 1 : quality), settings.quality / 100, settings.targetKb * 1024, check)
    return { ...result, width: r.targetWidth, height: r.targetHeight }
  } finally { oriented.width = oriented.height = canvas.width = canvas.height = 0 }
}
function stopPreviewWork() {
  previewGeneration++
  clearTimeout(previewTimer)
  previewProcessor.cancel()
  previewBusy.value = false
}
function clearOutputPreviews() {
  for (const item of Object.values(outputPreviews.value)) if (item.url) URL.revokeObjectURL(item.url)
  outputPreviews.value = {}
}
function schedulePreviews() {
  stopPreviewWork()
  if (disposed || resizeBusy.value || resizeLoading.value || settingsError.value || !resizePreviews.value.length) return
  const version = previewGeneration
  previewBusy.value = true
  previewTimer = setTimeout(() => {
    previewQueue = previewQueue.catch(() => {}).then(async () => {
      const check = () => { if (disposed || previewGeneration !== version || resizeBusy.value) throw new ProcessingCancelledError() }
      // Reserve space for every retained preview, including images later in the loop.
      let bytes = Object.values(outputPreviews.value).reduce((sum, output) => sum + (output.blob?.size || 0), 0)
      try {
        const settings = currentSettings()
        for (const image of resizePreviews.value) {
          check()
          const signature = outputSignature(image, settings)
          const existing = outputPreviews.value[image.id]
          if (existing?.blob && existing.signature === signature) continue
          try {
            const file = resizeFiles.value[Number(image.id)]!
            const result = await renderImageOutput(file, { ...image }, settings, previewProcessor, check)
            check()
            const nextBytes = bytes - (existing?.blob?.size || 0) + result.blob.size
            if (nextBytes > 128 * 1024 * 1024) throw new Error('Preview outputs exceed 128 MB. Select fewer images or reduce dimensions.')
            bytes = nextBytes
            if (existing?.url) URL.revokeObjectURL(existing.url)
            outputPreviews.value[image.id] = { ...result, signature, url: URL.createObjectURL(result.blob) }
          } catch (error) {
            check()
            outputPreviews.value[image.id] = { signature, error: error instanceof Error ? error.message : 'Preview failed.' }
          }
        }
      } catch (error) {
        if (!(error instanceof ProcessingCancelledError) && !disposed) setStatus('Could not generate output previews.')
      } finally { if (previewGeneration === version) previewBusy.value = false }
    })
  }, 350)
}
watch(() => JSON.stringify([resizeLoading.value, settingsError.value, resizePreviews.value.map((image) => outputSignature(image)), currentSettings()]), () => {
  // Preserve ready outputs for untouched images in the batch.
  for (const [id, output] of Object.entries(outputPreviews.value)) {
    const image = resizePreviews.value.find((image) => image.id === id)
    if (!image || settingsError.value || output.signature !== outputSignature(image)) {
      if (output.url) URL.revokeObjectURL(output.url)
      delete outputPreviews.value[id]
    }
  }
  schedulePreviews()
})
async function resizeImages() {
  if (resizeBusy.value || resizeLoading.value) return
  if (!resizeFiles.value.length) { setStatus('Select image files first.'); return }
  if (settingsError.value) { setStatus(settingsError.value); return }
  const options = currentSettings()
  stopPreviewWork()
  resizeBusy.value = true
  cancelled = false
  const outputs: Array<{ name: string; blob: Blob }> = []
  const usedNames = new Set<string>()
  let totalBytes = 0
  let unmetTargets = 0
  try {
    for (const [index, file] of resizeFiles.value.entries()) {
      assertActive()
      setStatus('Resizing image ' + (index + 1) + ' of ' + resizeFiles.value.length + '…')
      const preview = resizePreviews.value[index]!
      const cached = outputPreviews.value[preview.id]
      const result = cached?.blob && cached.signature === outputSignature(preview, options)
        ? { blob: cached.blob, targetMet: cached.targetMet }
        : await renderImageOutput(file, { ...preview }, options, processor, assertActive)
      const blob = result.blob
      assertActive()
      if (!result.targetMet) unmetTargets++
      totalBytes += blob.size
      if (totalBytes > 128 * 1024 * 1024) throw new Error('Outputs exceed 128 MB. Resize fewer images at a time.')
      const actualExtension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png'
      const base = file.name.replace(/\.[^/.]+$/, '') + '-resized'
      let name = base + '.' + actualExtension, suffix = 2
      while (usedNames.has(name)) name = base + '-' + suffix++ + '.' + actualExtension
      usedNames.add(name)
      outputs.push({ name, blob })
    }
    assertActive()
    if (outputs.length === 1) downloadBlob(outputs[0]!.blob, outputs[0]!.name)
    else {
      setStatus('Preparing ZIP…')
      const zip = new JSZip()
      for (const output of outputs) zip.file(output.name, output.blob)
      const blob = await zip.generateAsync({ type: 'blob' }, assertActive)
      assertActive()
      downloadBlob(blob, 'resized-images.zip')
    }
    setStatus('Done. Resized ' + outputs.length + ' image(s).' + (unmetTargets ? ' ' + unmetTargets + ' output(s) exceed the target size; lower dimensions or choose a higher size limit.' : ''))
  } catch (error) {
    if (!disposed) setStatus(error instanceof ProcessingCancelledError ? 'Resize cancelled. No files were downloaded.' : error instanceof Error ? error.message : 'Resize failed. Try a smaller batch.')
  } finally { resizeBusy.value = false; schedulePreviews() }
}
onBeforeUnmount(() => {
  disposed = true
  cancelDecode?.()
  decodedFiles = []
  stopPreviewWork()
  clearOutputPreviews()
  generation++
  cancelled = true
  processor.cancel()
  clearResizePreviews()
})
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Resize Images</h2>
    <p class="mt-2 text-sm text-slate-600">Upload one or more images, review previews, then export resized files.</p>
    <p class="mt-1 text-xs text-slate-500">Up to 32 images, 12 megapixels and 32 MB each; 128 MB per batch.</p>
    <p class="mt-1 text-xs text-slate-500">JPEG, PNG, WebP, GIF, AVIF, HEIC/HEIF, TIFF, camera RAW (DNG, CR2/CR3, NEF, ARW and more), PSD, JXL and other photo formats. Decoded locally; camera/codec support varies. Animated and multi-page inputs use the first frame. Export as PNG, JPG or WebP.</p>
    <p class="status-pill mt-3" role="status" aria-live="polite">{{ status }}</p>

    <div class="mt-5 grid gap-4 md:grid-cols-2">
      <label class="rounded-2xl bg-white/70 p-4">
        <span class="mb-2 block text-sm font-semibold">Input Images</span>
        <input type="file" :accept="PHOTO_ACCEPT" multiple class="field-control" :disabled="resizeBusy || resizeLoading" @change="onResizeFilesChange" >
      </label>
      <fieldset class="grid gap-3 rounded-2xl bg-white/70 p-4 sm:grid-cols-2" :disabled="resizeBusy || resizeLoading">
        <label class="text-sm font-semibold sm:col-span-2">
          Resolution preset
          <select :value="selectedPreset" class="field-control mt-1" @change="applyPreset">
            <option value="">Custom dimensions</option>
            <option v-for="preset in resolutionPresets" :key="preset.name" :value="preset.name">{{ preset.name }} — {{ preset.width }} × {{ preset.height }}</option>
          </select>
        </label>
        <div class="space-y-2 sm:col-span-2">
          <label class="block text-sm font-semibold">Saved presets
            <select v-model="selectedSavedPreset" class="field-control mt-1" @change="loadPreset">
              <option value="">Choose saved settings</option>
              <option v-for="preset in savedPresets" :key="preset.name" :value="preset.name">{{ preset.name }}</option>
            </select>
          </label>
          <label class="block text-sm font-semibold">Preset name
            <input v-model="presetName" type="text" maxlength="60" placeholder="e.g. Listing photos" class="field-control mt-1">
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary min-h-11" :disabled="!!settingsError || !presetName.trim()" @click="savePreset">Save settings</button>
            <button type="button" class="btn-secondary min-h-11" :disabled="!selectedSavedPreset" @click="deletePreset">Delete saved preset</button>
          </div>
          <p class="text-xs text-slate-600">Saved on this browser. Saving an existing name replaces its settings.</p>
        </div>
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
            <option value="original">Original (PNG for other formats)</option>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
        </label>
        <label class="text-sm font-semibold">
          Quality ({{ resizeQuality }}%)
          <input v-model.number="resizeQuality" :disabled="resizeFormat === 'png'" type="range" min="10" max="100" class="mt-2 w-full" >
        </label>
        <label class="text-sm font-semibold sm:col-span-2">
          Target file size per image (KB)
          <input v-model.number="targetSizeKb" type="number" min="0" max="131072" step="1" class="field-control mt-1">
          <span class="mt-1 block text-xs font-normal text-slate-600">0 disables the limit. Choose JPG or WebP. Quality is reduced up to your quality setting; dimensions stay fixed. Unreachable limits are flagged.</span>
        </label>
        <label class="text-sm font-semibold sm:col-span-2">
          Resampling filter
          <select v-model="resizeMethod" class="field-control mt-1">
            <option value="standard">Standard</option>
            <option value="lanczos">Lanczos (Rust WASM)</option>
          </select>
          <span class="mt-1 block text-xs font-normal text-slate-600">Lanczos uses a consistent filter for fine detail and may take longer.</span>
        </label>
        <label class="text-sm font-semibold sm:col-span-2">
          Resize mode
          <select v-model="resizeMode" class="field-control mt-1">
            <option value="crop">Crop to fill — exact dimensions</option>
            <option value="fit">Fit within — keep the whole image</option>
          </select>
          <span class="mt-1 block text-xs font-normal text-slate-600">{{ resizeMode === 'crop' ? 'Trims edges to match your dimensions without stretching. Adjust each crop below.' : 'Preserves the whole image. Output may be smaller than the requested width or height.' }}</span>
        </label>
        <p v-if="settingsError" class="text-sm text-red-700 sm:col-span-2" role="alert">{{ settingsError }}</p>
        <p v-if="!validOutput && !settingsError" class="text-sm text-red-700 sm:col-span-2" role="alert">Enter whole-number dimensions from 1 to 16384, up to 12 megapixels.</p>
      </fieldset>
    </div>

    <div v-if="resizePreviews.length" class="mt-5 space-y-3">
      <p class="text-sm font-semibold text-slate-700">Output Previews ({{ resizePreviews.length }})</p>
      <div class="grid gap-5 xl:grid-cols-2">
        <article
          v-for="image in resizePreviews"
          :key="image.id"
          class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div class="mb-3 flex flex-wrap gap-2">
            <button type="button" class="btn-secondary min-h-11" :disabled="resizeBusy || resizeLoading" :aria-label="'Rotate left: ' + image.name" @click="orientImage(image, 'left')">Rotate left</button>
            <button type="button" class="btn-secondary min-h-11" :disabled="resizeBusy || resizeLoading" :aria-label="'Rotate right: ' + image.name" @click="orientImage(image, 'right')">Rotate right</button>
            <button type="button" class="btn-secondary min-h-11" :disabled="resizeBusy || resizeLoading" :aria-pressed="image.flipX" @click="orientImage(image, 'flipX')">Flip horizontal</button>
            <button type="button" class="btn-secondary min-h-11" :disabled="resizeBusy || resizeLoading" :aria-pressed="image.flipY" @click="orientImage(image, 'flipY')">Flip vertical</button>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
          <div>
          <p class="mb-2 text-sm font-semibold">Crop editor</p>
          <div class="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <div class="relative isolate max-h-full max-w-full overflow-hidden" :style="{ aspectRatio: image.width + ' / ' + image.height, width: 'min(100%, ' + (256 * image.width / image.height) + 'px)' }">
              <img :src="image.previewUrl" :alt="'Original image: ' + image.name" draggable="false" class="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none" :style="editorImageStyle(image)">
              <div v-if="resizeMode === 'crop' && validOutput" class="absolute" :style="cropBoxStyle(image)">
              <button
                type="button"
                class="crop-box absolute inset-0 h-full w-full touch-none border-2 border-white bg-transparent focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-4px] focus-visible:outline-teal-400 disabled:cursor-default"
                :disabled="resizeBusy || resizeLoading"
                :aria-label="'Move crop box for ' + image.name + '. Use arrow keys; hold Shift for larger steps.'"
                @pointerdown="startCropDrag($event, image)"
                @pointermove="moveCropDrag"
                @pointerup="endCropDrag"
                @pointercancel="endCropDrag"
                @lostpointercapture="endCropDrag"
                @keydown="nudgeCrop($event, image)"
              >
                <span aria-hidden="true" class="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <span v-for="line in 9" :key="line" class="border border-white/30" />
                </span>
              </button>
              <button
                v-for="corner in cropCorners" :key="corner" type="button"
                class="crop-handle absolute z-10 h-8 w-8 touch-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                :class="[corner.includes('n') ? 'top-0' : 'bottom-0', corner.includes('w') ? 'left-0' : 'right-0']"
                :style="{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }"
                :aria-label="'Resize crop ' + corner + ' corner for ' + image.name + '. Arrow up or right enlarges; down or left shrinks.'"
                :disabled="resizeBusy || resizeLoading"
                @pointerdown.stop="startCropResize($event, image, corner)" @pointermove="moveCropResize"
                @pointerup="endCropResize" @pointercancel="endCropResize" @lostpointercapture="endCropResize"
                @keydown="keyboardCropResize($event, image)"
              ><span aria-hidden="true" class="mx-auto block h-3 w-3 border-2 border-teal-800 bg-white" /></button>
              </div>
            </div>
          </div>
          </div>
          <div>
            <p class="mb-2 text-sm font-semibold">Live output preview</p>
            <div class="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2" :aria-busy="previewBusy">
              <img v-if="outputPreviews[image.id]?.url" :src="outputPreviews[image.id]!.url" :alt="'Export preview: ' + image.name" class="max-h-full max-w-full object-contain">
              <p v-else class="p-2 text-sm text-slate-600" role="status">{{ settingsError || outputPreviews[image.id]?.error || (previewBusy ? 'Updating preview…' : 'Output preview unavailable.') }}</p>
            </div>
            <p class="mt-2 text-xs text-slate-600">Encoded at the selected resolution, format and quality.</p>
          </div>
          </div>
          <p v-if="upscaleWarning(image)" class="mt-3 text-sm text-amber-800">{{ upscaleWarning(image) }}</p>
          <p v-if="outputPreviews[image.id]?.targetMet === false" class="mt-2 text-sm text-amber-800">Target size could not be reached at these dimensions. This output will exceed your limit. Reduce dimensions or increase the limit.</p>
          <p v-if="resizeMode === 'crop' && validOutput" class="mt-2 text-xs text-slate-600">Drag to move; drag a corner to resize. Arrow keys adjust the focused box or handle.</p>
          <button v-if="resizeMode === 'crop'" type="button" class="btn-secondary mt-2 min-h-11" :disabled="resizeBusy || resizeLoading" @click="resetCrop(image)">Reset crop</button>
          <div class="mt-3 space-y-1 text-sm text-slate-700">
            <p class="truncate font-semibold" :title="image.name">{{ image.name }}</p>
            <table class="w-full text-left text-sm">
              <caption class="sr-only">Before and after for {{ image.name }}</caption>
              <thead><tr><th scope="col" class="py-1">Version</th><th scope="col" class="py-1">Dimensions</th><th scope="col" class="py-1">File size</th></tr></thead>
              <tbody>
                <tr><th scope="row" class="py-1 font-normal">Original</th><td>{{ image.originalWidth }} × {{ image.originalHeight }}</td><td>{{ formatBytes(resizeFiles[Number(image.id)]?.size || 0) }}</td></tr>
                <tr><th scope="row" class="py-1 font-normal">Output</th><td>{{ outputSize(image) }}</td><td>{{ outputPreviews[image.id]?.blob ? formatBytes(outputPreviews[image.id]!.blob!.size) : 'Pending' }}</td></tr>
              </tbody>
            </table>
            <p v-if="outputPreviews[image.id]?.blob">{{ sizeDifference(image) }} · {{ outputPreviews[image.id]!.blob!.type.replace('image/', '').toUpperCase() }}<span v-if="outputPreviews[image.id]!.blob!.type !== 'image/png'"> · Quality {{ Math.round((outputPreviews[image.id]!.quality || 1) * 100) }}%</span></p>
          </div>
        </article>
      </div>
    </div>

    <button class="btn-primary mt-4 disabled:opacity-60" :disabled="resizeBusy || resizeLoading || !resizeFiles.length || !validOutput || !!settingsError" @click="resizeImages">
      {{ resizeBusy ? 'Resizing...' : 'Resize Images' }}
    </button>
    <button v-if="resizeBusy" class="btn-secondary ml-2" @click="cancelResize">Cancel resize</button>
  </section>
</template>

<style scoped>
.crop-box {
  cursor: grab;
  box-shadow: 0 0 0 100vmax rgb(15 23 42 / 55%);
}
.crop-box:active { cursor: grabbing; }
</style>
