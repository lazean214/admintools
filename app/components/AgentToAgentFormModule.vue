<script setup lang="ts">
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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

function setStatus(message: string) {
  status.value = message
}

function onFileInputChange(event: Event, key: 'logo' | 'signature' | 'stamp') {
  const target = event.target as HTMLInputElement
  uploads[key] = target.files?.[0] ?? null
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

async function fileToBytes(file: File) {
  return new Uint8Array(await file.arrayBuffer())
}

function isPng(file: File) {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
}

async function embedOptionalImage(
  pdfDoc: PDFDocument,
  page: any,
  file: File | null,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (!file) {
    return
  }

  const bytes = await fileToBytes(file)
  const image = isPng(file) ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
  page.drawImage(image, { x, y, width, height })
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

    const templateDoc = await PDFDocument.load(templateBytes)
    const templatePage = templateDoc.getPages()[0]
    const { width, height } = templatePage.getSize()

    // Flatten template into a fresh output PDF so drawn text is always above template content.
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([width, height])
    const embeddedTemplatePage = await pdfDoc.embedPage(templatePage)
    page.drawPage(embeddedTemplatePage, { x: 0, y: 0, width, height })

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Seller fields on left side, buyer fields on right side.
    const roleBlockX = form.role === 'seller' ? 52 : width - 248
    let roleBlockY = height - 118
    const fixedBlockLeftX = 175
    const fixedBlockRightX = 378
    let fixedLeftY = height - 118
    let fixedRightY = height - 118

    const signatureY = form.role === 'seller' ? height - 220 : 92
    const stampY = form.role === 'seller' ? height - 240 : 68

    const drawLine = (label: string, value: string, isBold = false) => {
      if (!value.trim()) {
        return
      }
      const text = `${label}: ${value}`
      const textFont = isBold ? boldFont : font
      const textSize = 10
      const textWidth = textFont.widthOfTextAtSize(text, textSize)
      page.drawRectangle({
        x: roleBlockX - 2,
        y: roleBlockY - 2,
        width: Math.min(textWidth + 6, width - roleBlockX - 4),
        height: 12,
        color: rgb(1, 1, 1),
        opacity: 0.92
      })
      page.drawText(text, {
        x: roleBlockX,
        y: roleBlockY,
        size: textSize,
        font: textFont,
        color: rgb(0.07, 0.11, 0.18)
      })
      roleBlockY -= 16
    }

    const drawFixedLine = (label: string, value: string, rightColumn = false) => {
      if (!value.trim()) {
        return
      }
      const x = rightColumn ? fixedBlockRightX : fixedBlockLeftX
      const y = rightColumn ? fixedRightY : fixedLeftY
      const text = `${label}: ${value}`
      const textSize = 9
      const textWidth = font.widthOfTextAtSize(text, textSize)
      page.drawRectangle({
        x: x - 2,
        y: y - 2,
        width: Math.min(textWidth + 6, width - x - 4),
        height: 11,
        color: rgb(1, 1, 1),
        opacity: 0.92
      })
      page.drawText(text, {
        x,
        y,
        size: textSize,
        font,
        color: rgb(0.07, 0.11, 0.18)
      })
      if (rightColumn) {
        fixedRightY -= 14
      } else {
        fixedLeftY -= 14
      }
    }

    page.drawText(`ROLE: ${form.role.toUpperCase()}`, {
      x: roleBlockX,
      y: roleBlockY + 18,
      size: 12,
      font: boldFont,
      color: rgb(0.06, 0.45, 0.42)
    })

    // Strong visible marker to confirm generated content is rendered on the page.
    page.drawRectangle({ x: 20, y: height - 32, width: 300, height: 16, color: rgb(1, 1, 1), opacity: 0.95 })
    page.drawText(`FORM I GENERATED - ${new Date().toLocaleString()}`, {
      x: 24,
      y: height - 28,
      size: 10,
      font: boldFont,
      color: rgb(0.12, 0.22, 0.62)
    })

    drawLine('EstablishmentName', form.establishmentName, true)
    drawLine('officeAdress', form.officeAddress)
    drawLine('officePhone', form.officePhone)
    drawLine('officeEMail', form.officeEmail)
    drawLine('orn', form.orn)
    drawLine('dedlicense', form.dedLicense)
    drawLine('pobox', form.poBox)
    drawLine('agentName', form.agentName)
    drawLine('brn', form.brn)
    drawLine('dateIssue', form.dateIssue)
    drawLine('agentMobile', form.agentMobile)
    drawLine('agentEmail', form.agentEmail)

    drawFixedLine('propertyAddress', form.propertyAddress)
    drawFixedLine('propertyDeveloper', form.propertyDeveloper)
    drawFixedLine('projectName', form.projectName)
    drawFixedLine('buildingName', form.buildingName)
    drawFixedLine('price', form.price)
    drawFixedLine('description', form.description)
    drawFixedLine('isMou', form.isMou)

    drawFixedLine('isTenanted', form.isTenanted, true)
    drawFixedLine('maintenanceFee', form.maintenanceFee, true)
    drawFixedLine('commissionBuyer', form.commissionBuyer, true)
    drawFixedLine('commissionSeller', form.commissionSeller, true)
    drawFixedLine('clientName', form.clientName, true)
    drawFixedLine('budget', form.budget, true)
    drawFixedLine('isPreFinanced', form.isPreFinanced, true)
    drawFixedLine('isBuyerAgent', form.isBuyerAgent, true)

    await embedOptionalImage(pdfDoc, page, uploads.logo, 48, height - 135, 110, 60)
    await embedOptionalImage(pdfDoc, page, uploads.signature, width - 255, signatureY, 118, 44)
    await embedOptionalImage(pdfDoc, page, uploads.stamp, width - 120, stampY, 68, 68)

    const output = await pdfDoc.save()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadBlob(new Blob([output], { type: 'application/pdf' }), `agent-to-agent-filled-${stamp}.pdf`)
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
        <h3 class="module-title text-lg font-bold">Form Details</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Role
            <select v-model="form.role" class="field-control mt-1">
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
            </select>
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            EstablishmentName
            <input v-model="form.establishmentName" type="text" class="field-control mt-1" placeholder="Establishment name" >
          </label>

          <label class="text-sm font-semibold">
            officeAdress
            <input v-model="form.officeAddress" type="text" class="field-control mt-1" placeholder="Office address" >
          </label>

          <label class="text-sm font-semibold">
            officePhone
            <input v-model="form.officePhone" type="text" class="field-control mt-1" placeholder="Office phone" >
          </label>

          <label class="text-sm font-semibold">
            officeEMail
            <input v-model="form.officeEmail" type="email" class="field-control mt-1" placeholder="office@email.com" >
          </label>

          <label class="text-sm font-semibold">
            orn
            <input v-model="form.orn" type="text" class="field-control mt-1" placeholder="ORN" >
          </label>

          <label class="text-sm font-semibold">
            dedlicense
            <input v-model="form.dedLicense" type="text" class="field-control mt-1" placeholder="DED License" >
          </label>

          <label class="text-sm font-semibold">
            pobox
            <input v-model="form.poBox" type="text" class="field-control mt-1" placeholder="PO Box" >
          </label>

          <label class="text-sm font-semibold">
            agentName
            <input v-model="form.agentName" type="text" class="field-control mt-1" placeholder="Agent name" >
          </label>

          <label class="text-sm font-semibold">
            brn
            <input v-model="form.brn" type="text" class="field-control mt-1" placeholder="BRN" >
          </label>

          <label class="text-sm font-semibold">
            dateIssue
            <input v-model="form.dateIssue" type="date" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            agentMobile
            <input v-model="form.agentMobile" type="text" class="field-control mt-1" placeholder="Agent mobile" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            agentEmail
            <input v-model="form.agentEmail" type="email" class="field-control mt-1" placeholder="agent@email.com" >
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Fixed Position Inputs</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            propertyAddress
            <input v-model="form.propertyAddress" type="text" class="field-control mt-1" placeholder="Property address" >
          </label>

          <label class="text-sm font-semibold">
            propertyDeveloper
            <input v-model="form.propertyDeveloper" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            projectName
            <input v-model="form.projectName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            buildingName
            <input v-model="form.buildingName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            price
            <input v-model="form.price" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            description
            <input v-model="form.description" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            isMou
            <select v-model="form.isMou" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            isTenanted
            <select v-model="form.isTenanted" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            maintenanceFee
            <input v-model="form.maintenanceFee" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            commissionBuyer
            <input v-model="form.commissionBuyer" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            commissionSeller
            <input v-model="form.commissionSeller" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            clientName
            <input v-model="form.clientName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            budget
            <input v-model="form.budget" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            isPreFinanced
            <select v-model="form.isPreFinanced" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            isBuyerAgent
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
