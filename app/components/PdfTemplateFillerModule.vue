<script setup lang="ts">
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ProfileSettings } from '~/composables/useAuth'

const status = ref('Ready to fill the listing agreement template.')
const generating = ref(false)
const auth = useAuth()

const TEMPLATE_PATH = '/noc_listing_form.pdf'
const signatureFile = ref<File | null>(null)
const signaturePreviewUrl = ref<string | null>(null)
const headerLogoUrl = ref<string | null>(null)
const headerEstablishmentName = ref('')
const headerOrn = ref('')

const form = reactive({
  createDate: '',
  referenceNo: '',
  ownerName: '',
  ownerEid: '',
  ownerLicense: '',
  propertyBuilding: '',
  propertyUnit: '',
  propertyStreet: '',
  propertyCommunity: '',
  propertyBua: '',
  propertyPlot: '',
  propertyBedroom: '',
  propertyBathroom: '',
  propertyParking: '',
  propertyRental: '',
  propertyType: 'vt',
  propertyAvailability: 'vc',
  propertyStatus: 'fn',
  termsExclusive: 'exclusive',
  termsDuration: '1',
  termsDurationDate: '',
  name: '',
  brokerName: ''
})

const MM_TO_PT = 72 / 25.4
const OFFSET_X_MM = 10
const OFFSET_Y_MM = -5

function setStatus(message: string) {
  status.value = message
}

function mmToPt(valueMm: number) {
  return valueMm * MM_TO_PT
}

function toPageX(xMm: number) {
  return mmToPt(xMm + OFFSET_X_MM)
}

function toPageY(pageHeight: number, yMm: number, elementHeightPt = 0) {
  return pageHeight - mmToPt(yMm + OFFSET_Y_MM) - elementHeightPt
}

async function fetchTemplateBytes() {
  const response = await fetch(TEMPLATE_PATH)
  if (!response.ok) {
    throw new Error(`Template not found at ${TEMPLATE_PATH}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

function toDdMmYyyy(raw: string) {
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return raw
  }

  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
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

async function onSignatureChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] ?? null
  signatureFile.value = file

  if (!file) {
    signaturePreviewUrl.value = null
    return
  }

  signaturePreviewUrl.value = await fileToDataUrl(file)
}

async function dataUrlToBytes(dataUrl: string) {
  const response = await fetch(dataUrl)
  return new Uint8Array(await response.arrayBuffer())
}

function drawTextAtMm(
  page: ReturnType<PDFDocument['getPages']>[number],
  pageHeight: number,
  value: string,
  xMm: number,
  yMm: number,
  size = 12
) {
  const text = value.trim()
  if (!text) {
    return
  }

  const x = toPageX(xMm)
  const y = toPageY(pageHeight, yMm, size * 0.85)
  page.drawText(text, { x, y, size })
}

function drawCheckboxAtMm(
  page: ReturnType<PDFDocument['getPages']>[number],
  pageHeight: number,
  xMm: number,
  yMm: number
) {
  drawTextAtMm(page, pageHeight, 'X', xMm, yMm, 12)
}

function pickCoords(map: Record<string, [number, number]>, key: string, fallbackKey: string) {
  const normalized = key.trim().toLowerCase()
  return map[normalized] ?? map[fallbackKey] ?? [0, 0]
}

function applyBrokerNameFromProfile(profile: ProfileSettings | undefined) {
  const establishmentName = profile?.establishmentName?.trim() || ''
  if (establishmentName) {
    form.brokerName = establishmentName
  }

  headerLogoUrl.value = profile?.logoDataUrl ?? null
  headerEstablishmentName.value = establishmentName
  headerOrn.value = profile?.orn?.trim() || ''
}

async function generateFilledPdf() {

  generating.value = true
  setStatus('Generating filled PDF...')

  try {
    const bytes = await fetchTemplateBytes()
    const pdfDoc = await PDFDocument.load(bytes)
    const page = pdfDoc.getPage(0)
    const pageHeight = page.getHeight()
    const pageWidth = page.getWidth()

    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const profileEstablishmentName = headerEstablishmentName.value.trim().toUpperCase()
    const profileOrn = headerOrn.value.trim()

    if (headerLogoUrl.value) {
      try {
        const logoBytes = await dataUrlToBytes(headerLogoUrl.value)
        const isPng = headerLogoUrl.value.includes('image/png')
        const logoImage = isPng
          ? await pdfDoc.embedPng(logoBytes)
          : await pdfDoc.embedJpg(logoBytes)

        page.drawImage(logoImage, {
          x: toPageX(8),
          y: toPageY(pageHeight, 10, mmToPt(14)),
          width: mmToPt(24),
          height: mmToPt(14)
        })
      } catch (error) {
        console.error('Failed to draw header logo', error)
      }
    }

    if (profileEstablishmentName) {
      const nameSize = 26
      const estimatedNameWidth = profileEstablishmentName.length * (nameSize * 0.5)
      page.drawText(profileEstablishmentName, {
        x: Math.max(0, (pageWidth - estimatedNameWidth) / 2),
        y: toPageY(pageHeight, 12, nameSize * 0.85),
        size: nameSize,
        font: boldFont,
        color: rgb(1, 1, 1)
      })
    }

    if (profileOrn) {
      const ornText = `ORN: ${profileOrn}`
      const ornSize = 10
      const estimatedOrnWidth = ornText.length * (ornSize * 0.5)
      page.drawText(ornText, {
        x: Math.max(0, pageWidth - estimatedOrnWidth - mmToPt(8)),
        y: toPageY(pageHeight, 10, ornSize * 0.85),
        size: ornSize,
        font: regularFont,
        color: rgb(1, 1, 1)
      })
    }

    drawTextAtMm(page, pageHeight, toDdMmYyyy(form.createDate), 27, 60)
    drawTextAtMm(page, pageHeight, form.referenceNo, 155, 60)
    drawTextAtMm(page, pageHeight, form.ownerName, 50, 76)
    drawTextAtMm(page, pageHeight, form.ownerEid, 50, 87)
    drawTextAtMm(page, pageHeight, toDdMmYyyy(form.ownerLicense), 35, 96)
    drawTextAtMm(page, pageHeight, form.propertyBuilding, 35, 143)
    drawTextAtMm(page, pageHeight, form.propertyUnit, 120, 143)
    drawTextAtMm(page, pageHeight, form.propertyStreet, 30, 154)
    drawTextAtMm(page, pageHeight, form.propertyCommunity, 123, 154)
    drawTextAtMm(page, pageHeight, form.propertyBua, 30, 165)
    drawTextAtMm(page, pageHeight, form.propertyPlot, 123, 165)
    drawTextAtMm(page, pageHeight, form.propertyBedroom, 30, 173)
    drawTextAtMm(page, pageHeight, form.propertyBathroom, 77, 173)
    drawTextAtMm(page, pageHeight, form.propertyParking, 130, 173)
    drawTextAtMm(page, pageHeight, form.propertyRental, 40, 183.5)
    drawTextAtMm(page, pageHeight, form.brokerName, 100, 202)
    drawTextAtMm(page, pageHeight, toDdMmYyyy(form.termsDurationDate), 130, 216)
    drawTextAtMm(page, pageHeight, form.name, 11, 258)

    const propertyTypeMap: Record<string, [number, number]> = {
      vt: [16, 121],
      apt: [47, 121],
      ph: [70, 121],
      cm: [98, 121],
      fb: [129, 121],
      other: [158, 121]
    }
    const propertyAvailabilityMap: Record<string, [number, number]> = {
      vc: [16, 131],
      occupied: [62, 131]
    }
    const propertyStatusMap: Record<string, [number, number]> = {
      fn: [106, 131],
      rented: [142, 131]
    }
    const termsExclusiveMap: Record<string, [number, number]> = {
      exclusive: [35, 210],
      nonexclusive: [62, 210]
    }
    const termsDurationMap: Record<string, [number, number]> = {
      '1': [35, 217],
      '2': [63, 217],
      '3': [89, 217],
      other: [110, 217]
    }

    const propertyTypeCoords = pickCoords(propertyTypeMap, form.propertyType, 'other')
    const propertyAvailabilityCoords = pickCoords(propertyAvailabilityMap, form.propertyAvailability, 'occupied')
    const propertyStatusCoords = pickCoords(propertyStatusMap, form.propertyStatus, 'rented')
    const termsExclusiveCoords = pickCoords(termsExclusiveMap, form.termsExclusive, 'nonexclusive')
    const termsDurationCoords = pickCoords(termsDurationMap, form.termsDuration, 'other')

    drawCheckboxAtMm(page, pageHeight, propertyTypeCoords[0], propertyTypeCoords[1])
    drawCheckboxAtMm(page, pageHeight, propertyAvailabilityCoords[0], propertyAvailabilityCoords[1])
    drawCheckboxAtMm(page, pageHeight, propertyStatusCoords[0], propertyStatusCoords[1])
    drawCheckboxAtMm(page, pageHeight, termsExclusiveCoords[0], termsExclusiveCoords[1])
    drawCheckboxAtMm(page, pageHeight, termsDurationCoords[0], termsDurationCoords[1])

    if (signatureFile.value) {
      const signatureBytes = new Uint8Array(await signatureFile.value.arrayBuffer())
      const isPng = signatureFile.value.type.toLowerCase().includes('png')
      const signatureImage = isPng
        ? await pdfDoc.embedPng(signatureBytes)
        : await pdfDoc.embedJpg(signatureBytes)

      const x = toPageX(110)
      const y = toPageY(pageHeight, 245, mmToPt(20))
      page.drawImage(signatureImage, {
        x,
        y,
        width: mmToPt(40),
        height: mmToPt(20)
      })
    }

    const output = await pdfDoc.save({ useObjectStreams: false })
    const outBlob = new Blob([Uint8Array.from(output)], { type: 'application/pdf' })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')

    openBlobInNewTab(outBlob)
    downloadBlob(outBlob, `template-filled-${stamp}.pdf`)
    setStatus('Done. Filled PDF generated and downloaded.')
  } catch (error) {
    console.error(error)
    setStatus(error instanceof Error ? error.message : 'Failed to generate filled PDF.')
  } finally {
    generating.value = false
  }
}

onMounted(() => {
  auth.hydrate()
  applyBrokerNameFromProfile(auth.currentUser.value?.profile)
})

watch(
  () => auth.currentUser.value?.profile,
  (profile) => {
    applyBrokerNameFromProfile(profile)
  }
)

</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">Listing Agreement Template Filler</h2>
    <p class="mt-2 text-sm text-slate-600">
      Uses legacy coordinate mapping from your old controller to fill noc_listing_form.pdf.
    </p>

    <div class="mt-4 rounded-2xl bg-white/70 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <div class="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-gray-900 p-1">
            <img
              v-if="headerLogoUrl"
              :src="headerLogoUrl"
              alt="Company logo"
              class="h-full w-full object-contain"
            >
            <div v-else class="flex h-full w-full items-center justify-center text-xs text-slate-400">
              No Logo
            </div>
          </div>
          <div>
            <p class="module-title text-base font-bold text-slate-900">
              {{ headerEstablishmentName || 'Establishment Name' }}
            </p>
            <p class="text-sm text-slate-600">
              ORN: {{ headerOrn || 'Not set' }}
            </p>
          </div>
        </div>
        <p class="text-xs text-slate-500">
          Header data comes from profile settings.
        </p>
      </div>
    </div>

    <p class="status-pill mt-3">{{ status }}</p>


    <div class="mt-4 rounded-2xl bg-white/70 p-4">
      <h3 class="module-title text-lg font-bold">Field Values</h3>
      <div class="mt-4 space-y-4">
        <fieldset class="rounded-xl border border-slate-200 bg-white/60 p-4">
          <legend class="px-1 text-sm font-bold text-slate-900">General Details</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold">Create Date<input v-model="form.createDate" type="date" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Reference No<input v-model="form.referenceNo" type="text" class="field-control mt-1" ></label>
          </div>
        </fieldset>

        <fieldset class="rounded-xl border border-slate-200 bg-white/60 p-4">
          <legend class="px-1 text-sm font-bold text-slate-900">Owner Details</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold">Owner Name<input v-model="form.ownerName" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Owner EID<input v-model="form.ownerEid" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold sm:col-span-2">Owner License Date<input v-model="form.ownerLicense" type="date" class="field-control mt-1" ></label>
          </div>
        </fieldset>

        <fieldset class="rounded-xl border border-slate-200 bg-white/60 p-4">
          <legend class="px-1 text-sm font-bold text-slate-900">Property Details</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold">Property Building<input v-model="form.propertyBuilding" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Property Unit<input v-model="form.propertyUnit" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Property Street<input v-model="form.propertyStreet" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Property Community<input v-model="form.propertyCommunity" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Property BUA<input v-model="form.propertyBua" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Property Plot<input v-model="form.propertyPlot" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Bedrooms<input v-model="form.propertyBedroom" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Bathrooms<input v-model="form.propertyBathroom" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Parking<input v-model="form.propertyParking" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Amount<input v-model="form.propertyRental" type="text" class="field-control mt-1" ></label>

            <label class="text-sm font-semibold">Property Type
              <select v-model="form.propertyType" class="field-control mt-1">
                <option value="vt">Villa/Townhouse</option>
                <option value="apt">Apartment</option>
                <option value="ph">Penthouse</option>
                <option value="cm">Commercial</option>
                <option value="fb">Full Building</option>
                <option value="other">Duplex</option>
              </select>
            </label>

            <label class="text-sm font-semibold">Availability
              <select v-model="form.propertyAvailability" class="field-control mt-1">
                <option value="vc">Vacant</option>
                <option value="occupied">Occupied</option>
              </select>
            </label>

            <label class="text-sm font-semibold">Status
              <select v-model="form.propertyStatus" class="field-control mt-1">
                <option value="fn">Furnished</option>
                <option value="rented">Unfurnished</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset class="rounded-xl border border-slate-200 bg-white/60 p-4">
          <legend class="px-1 text-sm font-bold text-slate-900">Agreement Terms</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold">Broker/Business Name<input v-model="form.brokerName" type="text" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Terms End Date<input v-model="form.termsDurationDate" type="date" class="field-control mt-1" ></label>
            <label class="text-sm font-semibold">Client Name<input v-model="form.name" type="text" class="field-control mt-1" ></label>

            <label class="text-sm font-semibold">Terms Type
              <select v-model="form.termsExclusive" class="field-control mt-1">
                <option value="exclusive">Exclusive</option>
                <option value="nonexclusive">Non-Exclusive</option>
              </select>
            </label>

            <label class="text-sm font-semibold sm:col-span-2">Terms Duration
              <select v-model="form.termsDuration" class="field-control mt-1">
                <option value="1">1 Month</option>
                <option value="2">2 Months</option>
                <option value="3">3 Months</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset class="rounded-xl border border-slate-200 bg-white/60 p-4">
          <legend class="px-1 text-sm font-bold text-slate-900">Signature</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold sm:col-span-2">
              Owner Signature (optional)
              <input type="file" accept="image/png,image/jpeg,image/jpg" class="field-control mt-1" @change="onSignatureChange" >
              <img
                v-if="signaturePreviewUrl"
                :src="signaturePreviewUrl"
                alt="Signature preview"
                class="mt-2 h-20 w-auto rounded-md border border-slate-200 object-contain bg-white p-1"
              >
            </label>
          </div>
        </fieldset>
      </div>
    </div>

    <div class="mt-5">
      <button class="btn-primary disabled:opacity-60" :disabled="generating" @click="generateFilledPdf">
        {{ generating ? 'Generating PDF...' : 'Generate Filled PDF' }}
      </button>
    </div>
  </section>
</template>
