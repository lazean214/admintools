<script setup lang="ts">
import { PDFDocument } from 'pdf-lib'
import type { ProfileSettings } from '~/composables/useAuth'

type RoleType = 'buyer' | 'seller'

const status = ref('Ready')
const generating = ref(false)

const form = reactive({
  role: 'buyer' as RoleType,
  establishmentName: '',
  officeAddress: '',
  officePhone: '',
  officeEmail: '',
  orn: '',
  dedLicense: '',
  poBox: '',
  agentName: '',
  brn: '',
  dateIssue: '',
  agentMobile: '',
  agentEmail: '',
  propertyAddress: '',
  propertyDeveloper: '',
  projectName: '',
  buildingName: '',
  price: '',
  description: '',
  isMou: '',
  isTenanted: '',
  maintenanceFee: '',
  commissionBuyer: '',
  commissionSeller: '',
  clientName: '',
  budget: '',
  isPreFinanced: '',
  isBuyerAgent: ''
})

const uploads = reactive({
  logo: null as File | null,
  signature: null as File | null,
  stamp: null as File | null
})

const auth = useAuth()

const storedAssets = reactive({
  logoDataUrl: null as string | null,
  stampDataUrl: null as string | null
})

const previews = reactive({
  logo: null as string | null,
  stamp: null as string | null
})

const logoPreviewUrl = computed(() => previews.logo ?? storedAssets.logoDataUrl)
const stampPreviewUrl = computed(() => previews.stamp ?? storedAssets.stampDataUrl)

function setStatus(message: string) {
  status.value = message
}

async function onFileInputChange(event: Event, key: 'logo' | 'signature' | 'stamp') {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  uploads[key] = file

  if (key === 'logo' || key === 'stamp') {
    previews[key] = file ? await fileToDataUrl(file) : null
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

async function drawOptionalImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  source: File | string | null,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  canvasHeight: number
) {
  if (!source) {
    return
  }

  const image = typeof source === 'string'
    ? await loadImageElementFromDataUrl(source)
    : await loadImageElementFromFile(source)
  const canvasX = x * scale
  const canvasY = canvasHeight - (y + height) * scale
  ctx.drawImage(image, canvasX, canvasY, width * scale, height * scale)
}

function applyProfileDefaults(profile: ProfileSettings) {
  if (!form.establishmentName) form.establishmentName = profile.establishmentName
  if (!form.officeAddress) form.officeAddress = profile.officeAddress
  if (!form.officePhone) form.officePhone = profile.officePhone
  if (!form.officeEmail) form.officeEmail = profile.officeEmail
  if (!form.orn) form.orn = profile.orn
  if (!form.dedLicense) form.dedLicense = profile.dedLicense
  if (!form.poBox) form.poBox = profile.poBox

  storedAssets.logoDataUrl = profile.logoDataUrl
  storedAssets.stampDataUrl = profile.stampDataUrl
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
    if (profile) {
      applyProfileDefaults(profile)
    }
  }
)

type FormFieldKey =
  | 'establishmentName'
  | 'officeAddress'
  | 'officePhone'
  | 'officeEmail'
  | 'orn'
  | 'dedLicense'
  | 'poBox'
  | 'agentName'
  | 'brn'
  | 'dateIssue'
  | 'agentMobile'
  | 'agentEmail'
  | 'propertyAddress'
  | 'propertyDeveloper'
  | 'projectName'
  | 'buildingName'
  | 'price'
  | 'description'
  | 'isMou'
  | 'isTenanted'
  | 'maintenanceFee'
  | 'commissionBuyer'
  | 'commissionSeller'
  | 'clientName'
  | 'budget'
  | 'isPreFinanced'
  | 'isBuyerAgent'

type FieldPlacement = {
  xMm: number
  yMm: number
  fontSize?: number
  maxWidthMm?: number
}

const sellerFieldPlacements: Record<FormFieldKey, FieldPlacement> = {
  establishmentName: { xMm: 12, yMm: 45.5, maxWidthMm: 65 },
  officeAddress: { xMm: 12, yMm: 59, maxWidthMm: 65 },
  officePhone: { xMm: 18, yMm: 77.5, maxWidthMm: 40 },
  officeEmail: { xMm: 67, yMm: 82.5, maxWidthMm: 35 },
  orn: { xMm: 18, yMm: 87, maxWidthMm: 28 },
  dedLicense: { xMm: 75, yMm: 87, maxWidthMm: 25 },
  poBox: { xMm: 22, yMm: 82.5, maxWidthMm: 35 },
  agentName: { xMm: 20, yMm: 100, maxWidthMm: 60 },
  brn: { xMm: 20, yMm: 105, maxWidthMm: 28 },
  dateIssue: { xMm: 75, yMm: 105, maxWidthMm: 25 },
  agentMobile: { xMm: 20, yMm: 110, maxWidthMm: 45 },
  agentEmail: { xMm: 20, yMm: 114.5, maxWidthMm: 75 },
  propertyAddress: { xMm: 35, yMm: 161.5, fontSize: 8, maxWidthMm: 75 },
  propertyDeveloper: { xMm: 35, yMm: 172, fontSize: 8, maxWidthMm: 75 },
  projectName: { xMm: 37, yMm: 176, fontSize: 8, maxWidthMm: 73 },
  buildingName: { xMm: 30, yMm: 187, fontSize: 8, maxWidthMm: 80 },
  price: { xMm: 30, yMm: 191.5, fontSize: 8, maxWidthMm: 80 },
  description: { xMm: 30, yMm: 196.5, fontSize: 8, maxWidthMm: 80 },
  isMou: { xMm: 80, yMm: 202.5, fontSize: 8, maxWidthMm: 25 },
  isTenanted: { xMm: 58.5, yMm: 207.5, fontSize: 9, maxWidthMm: 6 },
  maintenanceFee: { xMm: 30, yMm: 202.5, fontSize: 8, maxWidthMm: 90 },
  commissionBuyer: { xMm: 180, yMm: 181, fontSize: 8, maxWidthMm: 22 },
  commissionSeller: { xMm: 135, yMm: 181, fontSize: 8, maxWidthMm: 22 },
  clientName: { xMm: 148, yMm: 192, fontSize: 8, maxWidthMm: 52 },
  budget: { xMm: 115, yMm: 196.5, fontSize: 8, maxWidthMm: 35 },
  isPreFinanced: { xMm: 117.5, yMm: 192, fontSize: 9, maxWidthMm: 6 },
  isBuyerAgent: { xMm: 168.5, yMm: 207.5, fontSize: 9, maxWidthMm: 6 }
}

const fieldPlacementsByRole: Record<RoleType, Record<FormFieldKey, FieldPlacement>> = {
  seller: {
    ...sellerFieldPlacements
  },
  buyer: {
    ...sellerFieldPlacements,
    establishmentName: { xMm: 107, yMm: 45.5, maxWidthMm: 65 },
    officeAddress: { xMm: 107, yMm: 59, maxWidthMm: 65 },
    officePhone: { xMm: 112, yMm: 77.5, maxWidthMm: 40 },
    officeEmail: { xMm: 161, yMm: 82.5, maxWidthMm: 35 },
    orn: { xMm: 112, yMm: 87.5, maxWidthMm: 28 },
    dedLicense: { xMm: 167, yMm: 87.5, maxWidthMm: 25 },
    poBox: { xMm: 116, yMm: 82.5, maxWidthMm: 35 },
    agentName: { xMm: 112, yMm: 100, maxWidthMm: 60 },
    brn: { xMm: 112, yMm: 105, maxWidthMm: 28 },
    dateIssue: { xMm: 168, yMm: 105, maxWidthMm: 25 },
    agentMobile: { xMm: 114, yMm: 110, maxWidthMm: 45 },
    agentEmail: { xMm: 114, yMm: 114.5, maxWidthMm: 75 }
  }
}

const MM_TO_PT = 72 / 25.4

function mmToPt(valueMm: number) {
  return valueMm * MM_TO_PT
}

function fitTextToWidth(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) {
    return value
  }

  let trimmed = value
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }
  return `${trimmed}...`
}

function drawPlacedValue(
  ctx: CanvasRenderingContext2D,
  value: string,
  placement: FieldPlacement,
  scale: number,
  _canvasHeight: number
) {
  const cleanValue = value.trim()
  if (!cleanValue) {
    return
  }

  const fontSize = (placement.fontSize ?? 7) * scale
  ctx.font = `600 ${fontSize}px Arial`
  ctx.fillStyle = '#0f172a'
  const maxWidth = placement.maxWidthMm ? mmToPt(placement.maxWidthMm) * scale : 0
  const outputText = maxWidth > 0 ? fitTextToWidth(ctx, cleanValue, maxWidth) : cleanValue

  const canvasX = mmToPt(placement.xMm) * scale
  const canvasY = mmToPt(placement.yMm) * scale
  ctx.fillText(outputText, canvasX, canvasY)
}

function isYes(value: string) {
  return value.trim().toLowerCase() === 'yes'
}

function isNo(value: string) {
  return value.trim().toLowerCase() === 'no'
}

async function generateAgentToAgentPdf() {
  generating.value = true
  setStatus('Preparing Form I from template...')

  try {
    const templateBytes = await fetch('/agent-to-agent.pdf').then(async (response) => {
      if (!response.ok) {
        throw new Error('Template file not found in public/agent-to-agent.pdf')
      }
      return new Uint8Array(await response.arrayBuffer())
    })

    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

    const loadingTask = pdfjs.getDocument({ data: templateBytes })
    const templateDoc = await loadingTask.promise
    const templatePage = await templateDoc.getPage(1)
    const baseViewport = templatePage.getViewport({ scale: 1 })
    const width = baseViewport.width
    const height = baseViewport.height

    const renderScale = 2
    const viewport = templatePage.getViewport({ scale: renderScale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not initialize canvas context.')
    }

    await templatePage.render({ canvasContext: ctx, viewport, canvas }).promise

    const signatureTopMm = form.role === 'seller' ? 223 : 235
    const signatureWidthPt = mmToPt(40)
    const signatureHeightPt = mmToPt(20)
    const signatureY = height - mmToPt(signatureTopMm) - signatureHeightPt

    const stampTopMm = form.role === 'seller' ? 223 : 235
    const stampWidthPt = mmToPt(60)
    const stampHeightPt = mmToPt(40)
    const stampY = height - mmToPt(stampTopMm) - stampHeightPt

    const rolePlacements = fieldPlacementsByRole[form.role]
    const drawField = (fieldKey: FormFieldKey) => {
      drawPlacedValue(ctx, form[fieldKey], rolePlacements[fieldKey], renderScale, canvas.height)
    }

    drawField('establishmentName')
    drawField('officeAddress')
    drawField('officePhone')
    drawField('officeEmail')
    drawField('orn')
    drawField('dedLicense')
    drawField('poBox')
    drawField('agentName')
    drawField('brn')
    drawField('dateIssue')
    drawField('agentMobile')
    drawField('agentEmail')
    drawField('propertyAddress')
    drawField('propertyDeveloper')
    drawField('projectName')
    drawField('buildingName')
    drawField('price')
    drawField('description')
    if (isYes(form.isMou)) {
      drawPlacedValue(ctx, 'w/ MOU', rolePlacements.isMou, renderScale, canvas.height)
    }
    drawPlacedValue(ctx, `Maintenance Fee P/A: ${form.maintenanceFee}`.trim(), rolePlacements.maintenanceFee, renderScale, canvas.height)
    drawField('commissionBuyer')
    drawField('commissionSeller')
    drawField('clientName')
    drawField('budget')

    drawPlacedValue(
      ctx,
      isYes(form.isTenanted) ? 'X' : isNo(form.isTenanted) ? '' : form.isTenanted,
      isYes(form.isTenanted) ? rolePlacements.isTenanted : { ...rolePlacements.isTenanted, xMm: 74 },
      renderScale,
      canvas.height
    )

    if (isYes(form.isPreFinanced)) {
      drawPlacedValue(ctx, 'X', rolePlacements.isPreFinanced, renderScale, canvas.height)
    }

    drawPlacedValue(
      ctx,
      isYes(form.isBuyerAgent) ? 'X' : isNo(form.isBuyerAgent) ? 'X' : form.isBuyerAgent,
      isYes(form.isBuyerAgent) ? rolePlacements.isBuyerAgent : { ...rolePlacements.isBuyerAgent, xMm: 184 },
      renderScale,
      canvas.height
    )

    const logoSource = uploads.logo ?? storedAssets.logoDataUrl
    const stampSource = uploads.stamp ?? storedAssets.stampDataUrl

    await drawOptionalImageOnCanvas(ctx, logoSource, 25, height - 55, 80, 40, renderScale, canvas.height)
    await drawOptionalImageOnCanvas(ctx, uploads.signature, mmToPt(110), signatureY, signatureWidthPt, signatureHeightPt, renderScale, canvas.height)
    await drawOptionalImageOnCanvas(ctx, stampSource, mmToPt(140), stampY, stampWidthPt, stampHeightPt, renderScale, canvas.height)

    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to image.'))
          return
        }
        resolve(blob)
      }, 'image/png')
    })

    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer())
    const outDoc = await PDFDocument.create()
    const outPage = outDoc.addPage([width, height])
    const embedded = await outDoc.embedPng(imageBytes)
    outPage.drawImage(embedded, { x: 0, y: 0, width, height })

    const output = await outDoc.save({ useObjectStreams: false })
    const outputBytes = Uint8Array.from(output)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outBlob = new Blob([outputBytes], { type: 'application/pdf' })
    openBlobInNewTab(outBlob)
    downloadBlob(outBlob, `agent-to-agent-filled-${stamp}.pdf`)
    setStatus('Done. PDF generated and downloaded.')
  } catch (error) {
    console.error(error)
    setStatus('PDF generation failed. Check template and file inputs.')
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Form I / Agent To Agent</h2>
    <p class="mt-2 text-sm text-slate-600">
      Fill the form details and generate a PDF based on the agent-to-agent template. Logo, signature, and stamp are optional.
    </p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Company Details</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Role
            <select v-model="form.role" class="field-control mt-1">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Business Name
            <input v-model="form.establishmentName" type="text" class="field-control mt-1" placeholder="Establishment name" >
          </label>

          <label class="text-sm font-semibold">
            Office Address
            <input v-model="form.officeAddress" type="text" class="field-control mt-1" placeholder="Office address" >
          </label>

          <label class="text-sm font-semibold">
            Office Phone
            <input v-model="form.officePhone" type="text" class="field-control mt-1" placeholder="Office phone" >
          </label>

          <label class="text-sm font-semibold">
            Office Email
            <input v-model="form.officeEmail" type="email" class="field-control mt-1" placeholder="office@email.com" >
          </label>

          <label class="text-sm font-semibold">
            ORN
            <input v-model="form.orn" type="text" class="field-control mt-1" placeholder="ORN" >
          </label>

          <label class="text-sm font-semibold">
            DED License
            <input v-model="form.dedLicense" type="text" class="field-control mt-1" placeholder="DED License" >
          </label>

          <label class="text-sm font-semibold">
            PO Box
            <input v-model="form.poBox" type="text" class="field-control mt-1" placeholder="PO Box" >
          </label>

          <label class="text-sm font-semibold">
            Agent Name
            <input v-model="form.agentName" type="text" class="field-control mt-1" placeholder="Agent name" >
          </label>

          <label class="text-sm font-semibold">
            BRN
            <input v-model="form.brn" type="text" class="field-control mt-1" placeholder="BRN" >
          </label>

          <label class="text-sm font-semibold">
            Date of Issue
            <input v-model="form.dateIssue" type="date" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Agent Mobile
            <input v-model="form.agentMobile" type="text" class="field-control mt-1" placeholder="Agent mobile" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Agent Email
            <input v-model="form.agentEmail" type="email" class="field-control mt-1" placeholder="agent@email.com" >
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Property Details</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Property Address
            <input v-model="form.propertyAddress" type="text" class="field-control mt-1" placeholder="Property address" >
          </label>

          <label class="text-sm font-semibold">
            Property Developer
            <input v-model="form.propertyDeveloper" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Project Name
            <input v-model="form.projectName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Building Name
            <input v-model="form.buildingName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Price
            <input v-model="form.price" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Description
            <input v-model="form.description" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Does an MOU exist on this property?
            <select v-model="form.isMou" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            Is this property being tenanted?
            <select v-model="form.isTenanted" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            Maintenance Fee P.A
            <input v-model="form.maintenanceFee" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Commission Buyer
            <input v-model="form.commissionBuyer" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Commission Seller
            <input v-model="form.commissionSeller" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Client Name
            <input v-model="form.clientName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Budget
            <input v-model="form.budget" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Has the Buyer had Pre-Finance Approval?
            <select v-model="form.isPreFinanced" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            Has the Buyer contacted the Listing Agent?
            <select v-model="form.isBuyerAgent" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Optional File Inputs</h3>
        <div class="mt-3 space-y-3">
          <label class="block text-sm font-semibold">
            Logo (optional)
            <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(event) => onFileInputChange(event, 'logo')" >
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
            <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(event) => onFileInputChange(event, 'signature')" >
            <span class="mt-1 block text-xs text-slate-500">{{ uploads.signature?.name || 'No file selected' }}</span>
          </label>

          <label class="block text-sm font-semibold">
            Stamp (optional)
            <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="(event) => onFileInputChange(event, 'stamp')" >
            <span class="mt-1 block text-xs text-slate-500">{{ uploads.stamp?.name || 'No file selected' }}</span>
            <img
              v-if="stampPreviewUrl"
              :src="stampPreviewUrl"
              alt="Stamp preview"
              class="mt-2 h-20 w-auto rounded-md border border-slate-200 object-contain bg-white p-1"
            >
          </label>
        </div>

        <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Template source: public/agent-to-agent.pdf
        </div>
      </div>
    </div>

    <div class="mt-5">
      <button class="btn-primary disabled:opacity-60" :disabled="generating" @click="generateAgentToAgentPdf">
        {{ generating ? 'Generating PDF...' : 'Generate PDF' }}
      </button>
    </div>
  </section>
</template>
