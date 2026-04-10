<script setup lang="ts">
import { PDFDocument } from 'pdf-lib'
import type { ProfileSettings } from '~/composables/useAuth'

const status = ref('Ready')
const generating = ref(false)
const auth = useAuth()

const form = reactive({
  referenceNo: '',
  ownerName: '',
  ownerPassportEid: '',
  ownerIdExpiry: '',
  ownerEmail: '',
  propertyType: '' as '' | 'villa' | 'apartment' | 'penthouse' | 'commercial' | 'fullBuilding' | 'duplex',
  propertyStatus: '' as '' | 'vacant' | 'tenanted',
  propertyFurnishing: '' as '' | 'furnished' | 'unfurnished',
  propertyBuilding: '',
  propertyUnit: '',
  propertyCommunity: '',
  propertyBua: '',
  propertyPlot: '',
  propertyBedroom: '',
  propertyBathroom: '',
  propertyParking: '',
  propertyRental: '',
  termsExclusive: '' as '' | 'exclusive' | 'nonexclusive',
  termsDuration: '' as '' | '1' | '2' | '3' | 'until',
  termsDurationDate: '',
  ownerSignatureName: ''
})

const uploads = reactive({
  logo: null as File | null,
  signature: null as File | null
})

const storedAssets = reactive({
  logoDataUrl: null as string | null
})

const previews = reactive({
  logo: null as string | null
})

const themeColor = ref('#1e293b')

const presetColors = [
  { name: 'Slate', hex: '#1e293b' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Navy', hex: '#1e3a5f' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Crimson', hex: '#dc2626' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Forest', hex: '#15803d' },
  { name: 'Gold', hex: '#b45309' }
]

const logoPreviewUrl = computed(() => previews.logo ?? storedAssets.logoDataUrl)

function setStatus(message: string) {
  status.value = message
}

async function onFileInputChange(event: Event, key: 'logo' | 'signature') {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  uploads[key] = file
  if (key === 'logo') {
    previews.logo = file ? await fileToDataUrl(file) : null
  }
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

function openBlobInNewTab(blob: Blob) {
  const previewUrl = URL.createObjectURL(blob)
  window.open(previewUrl, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(previewUrl), 60000)
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

async function loadImageElementFromFile(file: File) {
  const dataUrl = await fileToDataUrl(file)
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image file.'))
    image.src = dataUrl
  })
}

async function loadImageElementFromDataUrl(dataUrl: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load stored image data.'))
    image.src = dataUrl
  })
}

async function loadOptionalImage(source: File | string | null): Promise<HTMLImageElement | null> {
  if (!source) return null
  return typeof source === 'string'
    ? await loadImageElementFromDataUrl(source)
    : await loadImageElementFromFile(source)
}

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m
    ? { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
    : { r: 30, g: 41, b: 59 }
}

function lightenColor(hex: string, factor: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`
}

function applyProfileDefaults(profile: ProfileSettings) {
  storedAssets.logoDataUrl = profile.logoDataUrl
}

onMounted(() => {
  auth.hydrate()
  if (auth.currentUser.value?.profile) {
    applyProfileDefaults(auth.currentUser.value.profile)
  }
})

watch(
  () => auth.currentUser.value?.profile,
  (profile) => {
    if (profile) applyProfileDefaults(profile)
  }
)

const MM_TO_PT = 72 / 25.4

function mmToPt(valueMm: number) {
  return valueMm * MM_TO_PT
}

function fitTextToWidth(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) return value
  let trimmed = value
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed}...`
}

function toDdMmYyyy(raw: string) {
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}

async function generateListingPdf() {
  generating.value = true
  setStatus('Generating Listing Agreement layout...')

  try {
    const W = 210, H = 297, M = 10
    const CW = W - 2 * M

    const renderScale = 3
    const s = (mm: number) => mmToPt(mm) * renderScale
    const width = mmToPt(W)
    const height = mmToPt(H)

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(s(W))
    canvas.height = Math.floor(s(H))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not initialize canvas context.')

    const theme = themeColor.value
    const { r, g, b } = hexToRgb(theme)
    const themeStr = `rgb(${r}, ${g}, ${b})`

    // --- Drawing helpers ---
    function sectionBar(text: string, y: number) {
      ctx!.fillStyle = themeStr
      ctx!.fillRect(s(M), s(y), s(CW), s(8.5))
      ctx!.fillStyle = '#ffffff'
      ctx!.font = `700 ${s(3.2)}px Arial`
      ctx!.textAlign = 'left'
      ctx!.fillText(text.toUpperCase(), s(M + 3), s(y + 5.8))
    }

    function labelValue(label: string, value: string, x: number, y: number, w: number) {
      ctx!.font = `600 ${s(2.5)}px Arial`
      ctx!.fillStyle = '#475569'
      ctx!.textAlign = 'left'
      ctx!.fillText(label.toUpperCase(), s(x), s(y))
      ctx!.strokeStyle = '#e2e8f0'
      ctx!.lineWidth = s(0.1)
      ctx!.setLineDash([s(0.5), s(0.5)])
      ctx!.beginPath()
      ctx!.moveTo(s(x), s(y + 4.5))
      ctx!.lineTo(s(x + w), s(y + 4.5))
      ctx!.stroke()
      ctx!.setLineDash([])
      if (value.trim()) {
        ctx!.font = `400 ${s(2.8)}px Arial`
        ctx!.fillStyle = '#1e293b'
        const display = fitTextToWidth(ctx!, value.trim(), s(w))
        ctx!.fillText(display, s(x), s(y + 3.8))
      }
    }

    function drawCheck(x: number, y: number, checked: boolean, label: string) {
      const bs = 3.8
      ctx!.strokeStyle = '#cbd5e1'
      ctx!.lineWidth = s(0.15)
      ctx!.strokeRect(s(x), s(y), s(bs), s(bs))
      if (checked) {
        ctx!.fillStyle = themeStr
        ctx!.fillRect(s(x + 0.2), s(y + 0.2), s(bs - 0.4), s(bs - 0.4))
        ctx!.fillStyle = '#ffffff'
        ctx!.font = `bold ${s(2.8)}px Arial`
        ctx!.textAlign = 'center'
        ctx!.fillText('\u2713', s(x + bs / 2), s(y + 2.9))
        ctx!.textAlign = 'left'
      }
      ctx!.font = `400 ${s(2.5)}px Arial`
      ctx!.fillStyle = '#334155'
      ctx!.textAlign = 'left'
      ctx!.fillText(label, s(x + bs + 1.5), s(y + 2.9))
    }

    function groupHeader(text: string, x: number, y: number) {
      ctx!.font = `800 ${s(2)}px Arial`
      ctx!.fillStyle = '#94a3b8'
      ctx!.textAlign = 'left'
      ctx!.fillText(text.toUpperCase(), s(x), s(y))
    }

    // === DRAW LAYOUT ===
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, s(W), s(H))

    // ========== HEADER ==========
    const logoSource = uploads.logo ?? storedAssets.logoDataUrl
    const logoImg = await loadOptionalImage(logoSource)
    if (logoImg) {
      ctx.drawImage(logoImg, s(M), s(7), s(38), s(22))
    } else {
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = s(0.15)
      ctx.setLineDash([s(1), s(1)])
      ctx.strokeRect(s(M), s(7), s(38), s(22))
      ctx.setLineDash([])
      ctx.fillStyle = '#cbd5e1'
      ctx.font = `italic ${s(2.2)}px Arial`
      ctx.textAlign = 'center'
      ctx.fillText('Company Logo', s(M + 19), s(19))
      ctx.textAlign = 'left'
    }

    // Title
    ctx.fillStyle = themeStr
    ctx.font = `900 ${s(7.5)}px Arial`
    ctx.textAlign = 'right'
    ctx.fillText('LISTING AGREEMENT', s(W - M), s(15))
    ctx.font = `bold ${s(3.5)}px Arial`
    ctx.fillStyle = '#64748b'
    ctx.fillText('RENT', s(W - M), s(20))
    const rentW = ctx.measureText('RENT').width
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.4)
    ctx.beginPath()
    ctx.moveTo(s(W - M) - rentW, s(21))
    ctx.lineTo(s(W - M), s(21))
    ctx.stroke()

    // Date & Ref
    ctx.textAlign = 'left'
    ctx.font = `600 ${s(2.3)}px Arial`
    ctx.fillStyle = '#475569'
    const rhX = W - M - 50
    ctx.textAlign = 'right'
    ctx.fillText('DATE:', s(rhX + 16), s(24.5))
    ctx.fillText('REF #:', s(rhX + 16), s(29))
    ctx.textAlign = 'left'
    ctx.font = `400 ${s(2.5)}px Arial`
    ctx.fillStyle = '#1e293b'
    const today = new Date()
    const headerDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    ctx.fillText(headerDate, s(rhX + 17), s(24.5))
    ctx.fillText(form.referenceNo, s(rhX + 17), s(29))

    // Header bottom border
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.5)
    ctx.beginPath()
    ctx.moveTo(s(M), s(32))
    ctx.lineTo(s(W - M), s(32))
    ctx.stroke()

    // ========== SECTION 1: LANDLORD DETAILS ==========
    let curY = 34
    sectionBar('1 - Landlord Details', curY)
    curY += 12

    const halfW = (CW - 8) / 2
    labelValue('Full Name / Establishment:', form.ownerName, M, curY, halfW)
    labelValue('Passport / Emirates ID Number:', form.ownerPassportEid, M + halfW + 8, curY, halfW)
    curY += 10
    labelValue('ID Expiry Date:', toDdMmYyyy(form.ownerIdExpiry), M, curY, halfW)
    labelValue('Email Address:', form.ownerEmail, M + halfW + 8, curY, halfW)
    curY += 12

    // ========== SECTION 2: PROPERTY DETAILS ==========
    sectionBar('2 - Property Details', curY)
    curY += 11

    // Checkbox group container
    const cbBoxY = curY
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(s(M), s(cbBoxY), s(CW), s(38))
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = s(0.15)
    ctx.strokeRect(s(M), s(cbBoxY), s(CW), s(38))

    // Property Type row
    groupHeader('Property Type', M + 2, curY + 3.5)
    curY += 7
    const ptTypes: [string, string][] = [
      ['villa', 'Villa/Townhouse'], ['apartment', 'Apartment'], ['penthouse', 'Penthouse'],
      ['commercial', 'Commercial'], ['fullBuilding', 'Full Building'], ['duplex', 'Duplex']
    ]
    let cbX = M + 2
    for (const [val, label] of ptTypes) {
      drawCheck(cbX, curY, form.propertyType === val, label)
      cbX += 30
    }
    curY += 7

    // Divider inside checkbox box
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = s(0.15)
    ctx.beginPath()
    ctx.moveTo(s(M + 2), s(curY))
    ctx.lineTo(s(M + CW - 2), s(curY))
    ctx.stroke()
    curY += 2.5

    // Status & Furnishing side by side
    const statusX = M + 2
    const furnishX = M + CW / 2
    groupHeader('Current Status', statusX, curY + 2.5)
    groupHeader('Furnishing', furnishX, curY + 2.5)
    curY += 6
    drawCheck(statusX, curY, form.propertyStatus === 'vacant', 'Vacant')
    drawCheck(statusX + 30, curY, form.propertyStatus === 'tenanted', 'Tenanted')
    drawCheck(furnishX, curY, form.propertyFurnishing === 'furnished', 'Furnished')
    drawCheck(furnishX + 30, curY, form.propertyFurnishing === 'unfurnished', 'Unfurnished')
    curY = cbBoxY + 38 + 8

    // Property fields grid (3 columns)
    const col3W = (CW - 12) / 3
    labelValue('Building / Project Name:', form.propertyBuilding, M, curY, col3W * 2 + 6)
    labelValue('Unit No.:', form.propertyUnit, M + col3W * 2 + 12, curY, col3W)
    curY += 9
    labelValue('Community / Area:', form.propertyCommunity, M, curY, col3W)
    labelValue('BUA (SqFt):', form.propertyBua, M + col3W + 6, curY, col3W)
    labelValue('Plot Size (SqFt):', form.propertyPlot, M + (col3W + 6) * 2, curY, col3W)
    curY += 9
    labelValue('Bedrooms:', form.propertyBedroom, M, curY, col3W)
    labelValue('Bathrooms:', form.propertyBathroom, M + col3W + 6, curY, col3W)
    labelValue('Parking Spaces:', form.propertyParking, M + (col3W + 6) * 2, curY, col3W)
    curY += 10

    // Rental amount highlight box
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(s(M), s(curY), s(CW), s(12))
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = s(0.15)
    ctx.strokeRect(s(M), s(curY), s(CW), s(12))
    ctx.font = `bold ${s(2.5)}px Arial`
    ctx.fillStyle = themeStr
    ctx.fillText('ASKING RENTAL AMOUNT (AED)', s(M + 3), s(curY + 4))
    if (form.propertyRental.trim()) {
      ctx.font = `bold ${s(4.5)}px Arial`
      ctx.fillStyle = '#1e293b'
      ctx.fillText(form.propertyRental, s(M + 3), s(curY + 9.5))
    }
    curY += 16

    // ========== SECTION 3: TERMS & CONDITIONS ==========
    sectionBar('3 - Terms & Conditions', curY)
    curY += 11

    // Term 1: Appointment of Broker
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(s(M), s(curY), s(CW), s(35))
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.6)
    ctx.beginPath()
    ctx.moveTo(s(M), s(curY))
    ctx.lineTo(s(M), s(curY + 35))
    ctx.stroke()

    ctx.font = `bold ${s(2.8)}px Arial`
    ctx.fillStyle = themeStr
    ctx.fillText('1. Appointment of Broker', s(M + 3), s(curY + 5))
    ctx.font = `400 ${s(2.5)}px Arial`
    ctx.fillStyle = '#334155'
    ctx.fillText('The Landlord / legal representative has agreed to appoint the Broker to list and', s(M + 3), s(curY + 10))
    ctx.fillText('advertise the above property. Please select listing type:', s(M + 3), s(curY + 14))

    drawCheck(M + 3, curY + 17, form.termsExclusive === 'exclusive', 'EXCLUSIVE')
    drawCheck(M + 40, curY + 17, form.termsExclusive === 'nonexclusive', 'NON-EXCLUSIVE')

    ctx.font = `italic 400 ${s(2.5)}px Arial`
    ctx.fillStyle = '#334155'
    ctx.fillText('Period of listing:', s(M + 3), s(curY + 24.5))

    drawCheck(M + 3, curY + 27, form.termsDuration === '1', '1 Month')
    drawCheck(M + 30, curY + 27, form.termsDuration === '2', '2 Months')
    drawCheck(M + 57, curY + 27, form.termsDuration === '3', '3 Months')
    drawCheck(M + 84, curY + 27, form.termsDuration === 'until', 'Until:')
    if (form.termsDurationDate.trim()) {
      ctx.font = `400 ${s(2.5)}px Arial`
      ctx.fillStyle = '#1e293b'
      ctx.fillText(toDdMmYyyy(form.termsDurationDate), s(M + 102), s(curY + 29.5))
    }
    curY += 38

    // Term 2: Ownership Declaration
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(s(M), s(curY), s(CW), s(20))
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.6)
    ctx.beginPath()
    ctx.moveTo(s(M), s(curY))
    ctx.lineTo(s(M), s(curY + 20))
    ctx.stroke()

    ctx.font = `bold ${s(2.8)}px Arial`
    ctx.fillStyle = themeStr
    ctx.fillText('2. Ownership Declaration', s(M + 3), s(curY + 5))
    ctx.font = `400 ${s(2.5)}px Arial`
    ctx.fillStyle = '#334155'
    ctx.fillText('I, the undersigned confirm that I am the owner of the above property and / or have the legal', s(M + 3), s(curY + 10))
    ctx.fillText('authority to sign on behalf of the named owner(s) as per the power of attorney or relevant', s(M + 3), s(curY + 14))
    ctx.fillText('legal documents provided.', s(M + 3), s(curY + 18))
    curY += 23

    // Term 3: Termination
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(s(M), s(curY), s(CW), s(16))
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.6)
    ctx.beginPath()
    ctx.moveTo(s(M), s(curY))
    ctx.lineTo(s(M), s(curY + 16))
    ctx.stroke()

    ctx.font = `bold ${s(2.8)}px Arial`
    ctx.fillStyle = themeStr
    ctx.fillText('3. Termination', s(M + 3), s(curY + 5))
    ctx.font = `400 ${s(2.5)}px Arial`
    ctx.fillStyle = '#334155'
    ctx.fillText('This Agreement may be terminated by either party at any time upon seven (7) days written', s(M + 3), s(curY + 10))
    ctx.fillText('notice to the other party via registered email or hand-delivered notice.', s(M + 3), s(curY + 14))
    curY += 19

    // ========== SIGNATURE SECTION ==========
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = s(0.4)
    ctx.beginPath()
    ctx.moveTo(s(M), s(curY))
    ctx.lineTo(s(W - M), s(curY))
    ctx.stroke()
    curY += 2

    const sigBoxW = 75
    const sigBoxH = 18
    const sigX = (W - sigBoxW) / 2

    const sigImg = await loadOptionalImage(uploads.signature)
    if (sigImg) {
      ctx.drawImage(sigImg, s(sigX), s(curY), s(sigBoxW), s(sigBoxH))
    }

    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = s(0.4)
    ctx.beginPath()
    ctx.moveTo(s(sigX), s(curY + sigBoxH))
    ctx.lineTo(s(sigX + sigBoxW), s(curY + sigBoxH))
    ctx.stroke()

    ctx.font = `bold ${s(2.8)}px Arial`
    ctx.fillStyle = themeStr
    ctx.textAlign = 'center'
    ctx.fillText("Landlord's Name & Signature", s(W / 2), s(curY + sigBoxH + 5))

    if (form.ownerSignatureName.trim()) {
      ctx.font = `400 ${s(2.5)}px Arial`
      ctx.fillStyle = '#1e293b'
      ctx.fillText(form.ownerSignatureName, s(W / 2), s(curY + sigBoxH + 9.5))
    }

    ctx.font = `italic ${s(2.4)}px Arial`
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('I hereby confirm all information provided is accurate and grant the broker permission to list the property.', s(W / 2), s(curY + sigBoxH + 10))
    ctx.textAlign = 'left'

    // === OUTPUT PDF ===
    setStatus('Creating PDF...')

    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Failed to convert canvas to image.')); return }
        resolve(blob)
      }, 'image/png')
    })

    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer())
    const outDoc = await PDFDocument.create()
    const outPage = outDoc.addPage([width, height])
    const embedded = await outDoc.embedPng(imageBytes)
    outPage.drawImage(embedded, { x: 0, y: 0, width, height })

    const output = await outDoc.save({ useObjectStreams: false })
    const outBlob = new Blob([Uint8Array.from(output)], { type: 'application/pdf' })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    openBlobInNewTab(outBlob)
    downloadBlob(outBlob, `listing-agreement-${stamp}.pdf`)
    setStatus('Done. PDF generated and downloaded.')
  } catch (error) {
    console.error(error)
    setStatus('PDF generation failed. Check inputs and try again.')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Listing Agreement (NOC) Rent</h2>
    <p class="mt-2 text-sm text-slate-600">
      Fill the form details and generate a branded PDF. Choose a theme color to match your company's brand.
    </p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <!-- Landlord Details -->
      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Landlord Details</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Full Name / Establishment
            <input v-model="form.ownerName" type="text" class="field-control mt-1" placeholder="As per Title Deed">
          </label>
          <label class="text-sm font-semibold">
            Passport / Emirates ID
            <input v-model="form.ownerPassportEid" type="text" class="field-control mt-1" placeholder="000-0000-0000000-0">
          </label>
          <label class="text-sm font-semibold">
            ID Expiry Date
            <input v-model="form.ownerIdExpiry" type="date" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Email Address
            <input v-model="form.ownerEmail" type="email" class="field-control mt-1" placeholder="landlord@example.com">
          </label>
          <label class="text-sm font-semibold">
            Reference No
            <input v-model="form.referenceNo" type="text" class="field-control mt-1" placeholder="REF-0000">
          </label>
        </div>
      </div>

      <!-- Property Details -->
      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Property Details</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">
            Property Type
            <select v-model="form.propertyType" class="field-control mt-1">
              <option value="">Select</option>
              <option value="villa">Villa/Townhouse</option>
              <option value="apartment">Apartment</option>
              <option value="penthouse">Penthouse</option>
              <option value="commercial">Commercial</option>
              <option value="fullBuilding">Full Building</option>
              <option value="duplex">Duplex</option>
            </select>
          </label>
          <label class="text-sm font-semibold">
            Current Status
            <select v-model="form.propertyStatus" class="field-control mt-1">
              <option value="">Select</option>
              <option value="vacant">Vacant</option>
              <option value="tenanted">Tenanted</option>
            </select>
          </label>
          <label class="text-sm font-semibold">
            Furnishing
            <select v-model="form.propertyFurnishing" class="field-control mt-1">
              <option value="">Select</option>
              <option value="furnished">Furnished</option>
              <option value="unfurnished">Unfurnished</option>
            </select>
          </label>
          <label class="text-sm font-semibold">
            Building / Project Name
            <input v-model="form.propertyBuilding" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Unit No.
            <input v-model="form.propertyUnit" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Community / Area
            <input v-model="form.propertyCommunity" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            BUA (SqFt)
            <input v-model="form.propertyBua" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Plot Size (SqFt)
            <input v-model="form.propertyPlot" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Bedrooms
            <input v-model="form.propertyBedroom" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Bathrooms
            <input v-model="form.propertyBathroom" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Parking Spaces
            <input v-model="form.propertyParking" type="text" class="field-control mt-1">
          </label>
          <label class="text-sm font-semibold">
            Asking Rental Amount (AED)
            <input v-model="form.propertyRental" type="text" class="field-control mt-1" placeholder="0.00">
          </label>
        </div>
      </div>

      <!-- Agreement Terms -->
      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Agreement Terms</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">
            Listing Type
            <select v-model="form.termsExclusive" class="field-control mt-1">
              <option value="">Select</option>
              <option value="exclusive">Exclusive</option>
              <option value="nonexclusive">Non-Exclusive</option>
            </select>
          </label>
          <label class="text-sm font-semibold">
            Listing Duration
            <select v-model="form.termsDuration" class="field-control mt-1">
              <option value="">Select</option>
              <option value="1">1 Month</option>
              <option value="2">2 Months</option>
              <option value="3">3 Months</option>
              <option value="until">Until specific date</option>
            </select>
          </label>
          <label v-if="form.termsDuration === 'until'" class="text-sm font-semibold sm:col-span-2">
            Until Date
            <input v-model="form.termsDurationDate" type="date" class="field-control mt-1">
          </label>
        </div>
      </div>

      <!-- Signature & Files -->
      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Signature & Files</h3>
        <div class="mt-3 space-y-3">
          <label class="text-sm font-semibold">
            Landlord's Name (for signature)
            <input v-model="form.ownerSignatureName" type="text" class="field-control mt-1" placeholder="Full name">
          </label>

          <label class="block text-sm font-semibold">
            Logo (optional)
            <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(e) => onFileInputChange(e, 'logo')">
            <span class="mt-1 block text-xs text-slate-500">{{ uploads.logo?.name || 'No file selected' }}</span>
            <img
              v-if="logoPreviewUrl"
              :src="logoPreviewUrl"
              alt="Logo preview"
              class="mt-2 h-20 w-auto rounded-md border border-slate-200 object-contain bg-gray-700 p-2"
            >
          </label>

          <label class="block text-sm font-semibold">
            Signature (optional)
            <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(e) => onFileInputChange(e, 'signature')">
            <span class="mt-1 block text-xs text-slate-500">{{ uploads.signature?.name || 'No file selected' }}</span>
          </label>
        </div>

        <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h4 class="text-sm font-bold text-slate-700">Theme Color</h4>
          <p class="mt-1 text-xs text-slate-500">Pick a brand color for headers, accents, and borders.</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              v-for="preset in presetColors"
              :key="preset.hex"
              :title="preset.name"
              class="h-8 w-8 rounded-full border-2 transition-all hover:scale-110"
              :class="themeColor === preset.hex ? 'border-slate-900 ring-2 ring-offset-2' : 'border-white/60'"
              :style="{ backgroundColor: preset.hex }"
              @click="themeColor = preset.hex"
            />
            <label class="ml-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
              Custom
              <input v-model="themeColor" type="color" class="h-8 w-8 cursor-pointer rounded border-0 p-0">
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-5">
      <button type="button" class="btn-primary disabled:opacity-60" :disabled="generating" @click.prevent="generateListingPdf">
        {{ generating ? 'Generating PDF...' : 'Generate PDF' }}
      </button>
    </div>
  </section>
</template>
