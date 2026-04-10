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
  officeFax: '',
  officeEmail: '',
  orn: '',
  dedLicense: '',
  poBox: '',
  agentName: '',
  brn: '',
  strNo: '',
  dateIssue: '',
  agentMobile: '',
  agentEmail: '',
  formRefNo: '',
  propertyAddress: '',
  propertyAddressLine2: '',
  propertyDeveloper: '',
  projectName: '',
  buildingName: '',
  price: '',
  description: '',
  descriptionLine2: '',
  isMou: '',
  isTenanted: '',
  maintenanceFee: '',
  commissionBuyer: '',
  commissionSeller: '',
  clientName: '',
  budget: '',
  isPreFinanced: '',
  isBuyerAgent: '',
  agencyFeePaidBy: '' as '' | 'Seller' | 'Buyer' | 'Negotiable'
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

const themeColor = ref('#0f766e')

const presetColors = [
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Navy', hex: '#1e3a5f' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Crimson', hex: '#dc2626' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Forest', hex: '#15803d' },
  { name: 'Gold', hex: '#b45309' },
  { name: 'Charcoal', hex: '#334155' }
]

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
    : { r: 15, g: 118, b: 110 }
}

function lightenColor(hex: string, factor: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`
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

function isYes(value: string) {
  return value.trim().toLowerCase() === 'yes'
}

function isNo(value: string) {
  return value.trim().toLowerCase() === 'no'
}

async function generateAgentToAgentPdf() {
  generating.value = true
  setStatus('Generating Form I layout...')

  try {
    const W = 210, H = 297, M = 12
    const CW = W - 2 * M
    const HALF = (CW - 6) / 2

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
    const lightBg = lightenColor(theme, 0.93)

    // --- Drawing helpers ---
    function sectionBar(text: string, y: number) {
      ctx!.fillStyle = themeStr
      ctx!.fillRect(s(M), s(y), s(CW), s(7))
      ctx!.fillStyle = '#ffffff'
      ctx!.font = `500 ${s(3)}px Arial`
      ctx!.textAlign = 'center'
      ctx!.fillText(text, s(W / 2), s(y + 5))
      ctx!.textAlign = 'left'
    }

    function subBox(title: string, x: number, y: number, w: number, h: number) {
      ctx!.strokeStyle = themeStr
      ctx!.lineWidth = s(0.2)
      ctx!.strokeRect(s(x), s(y), s(w), s(h))
      // Title bg
      ctx!.font = `bold ${s(2.2)}px Arial`
      const actualTw = ctx!.measureText(title).width
      ctx!.fillStyle = '#ffffff'
      ctx!.fillRect(s(x + 2) - s(0.5), s(y) - s(1.5), actualTw + s(1.5), s(3))
      ctx!.fillStyle = themeStr
      ctx!.fillText(title, s(x + 2), s(y + 0.8))
    }

    function labelValue(label: string, value: string, x: number, y: number, w: number) {
      ctx!.font = `600 ${s(2.2)}px Arial`
      ctx!.fillStyle = '#374151'
      ctx!.textAlign = 'left'
      ctx!.fillText(label, s(x), s(y))
      const labelW = ctx!.measureText(label).width / s(1)
      const valX = x + labelW + 1
      const valW = w - labelW - 1
      if (valW > 0) {
        ctx!.strokeStyle = '#9ca3af'
        ctx!.lineWidth = s(0.1)
        ctx!.setLineDash([s(0.5), s(0.5)])
        ctx!.beginPath()
        ctx!.moveTo(s(valX), s(y + 2))
        ctx!.lineTo(s(x + w), s(y + 2))
        ctx!.stroke()
        ctx!.setLineDash([])
        if (value.trim()) {
          ctx!.font = `400 ${s(2.2)}px Arial`
          ctx!.fillStyle = '#111827'
          const display = fitTextToWidth(ctx!, value.trim(), s(valW))
          ctx!.fillText(display, s(valX), s(y))
        }
      }
    }

    function labelValueFull(label: string, value: string, x: number, y: number, w: number) {
      ctx!.font = `600 ${s(2.2)}px Arial`
      ctx!.fillStyle = '#374151'
      ctx!.textAlign = 'left'
      ctx!.fillText(label, s(x), s(y))
      ctx!.strokeStyle = '#9ca3af'
      ctx!.lineWidth = s(0.1)
      ctx!.setLineDash([s(0.5), s(0.5)])
      ctx!.beginPath()
      ctx!.moveTo(s(x), s(y + 4.5))
      ctx!.lineTo(s(x + w), s(y + 4.5))
      ctx!.stroke()
      ctx!.setLineDash([])
      if (value.trim()) {
        ctx!.font = `400 ${s(2.2)}px Arial`
        ctx!.fillStyle = '#111827'
        const display = fitTextToWidth(ctx!, value.trim(), s(w))
        ctx!.fillText(display, s(x), s(y + 4))
      }
    }

    function drawCheck(x: number, y: number, checked: boolean, label: string) {
      const bs = 3
      ctx!.strokeStyle = '#9ca3af'
      ctx!.lineWidth = s(0.15)
      ctx!.strokeRect(s(x), s(y), s(bs), s(bs))
      if (checked) {
        ctx!.fillStyle = themeStr
        ctx!.fillRect(s(x + 0.2), s(y + 0.2), s(bs - 0.4), s(bs - 0.4))
        ctx!.fillStyle = '#ffffff'
        ctx!.font = `bold ${s(2.4)}px Arial`
        ctx!.textAlign = 'center'
        ctx!.fillText('\u2713', s(x + bs / 2), s(y + 2.3))
        ctx!.textAlign = 'left'
      }
      ctx!.font = `400 ${s(2.1)}px Arial`
      ctx!.fillStyle = '#374151'
      ctx!.textAlign = 'left'
      ctx!.fillText(label, s(x + bs + 1), s(y + 2.3))
    }

    // === DRAW LAYOUT ===

    // White background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, s(W), s(H))

    // ========== HEADER ==========
    // Logo area
    const logoSource = uploads.logo ?? storedAssets.logoDataUrl
    const logoImg = await loadOptionalImage(logoSource)
    if (logoImg) {
      ctx.drawImage(logoImg, s(M), s(6), s(35), s(18))
    } else {
      // Placeholder
      ctx.strokeStyle = '#d1d5db'
      ctx.lineWidth = s(0.15)
      ctx.setLineDash([s(0.8), s(0.8)])
      ctx.strokeRect(s(M), s(6), s(35), s(18))
      ctx.setLineDash([])
      ctx.fillStyle = '#d1d5db'
      ctx.font = `italic ${s(2)}px Arial`
      ctx.textAlign = 'center'
      ctx.fillText('Company Logo', s(M + 17.5), s(16))
      ctx.textAlign = 'left'
    }

    // Title
    ctx.fillStyle = themeStr
    ctx.font = `bold ${s(5.5)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('Agent to Agent Agreement', s(W / 2), s(13))
    ctx.font = `bold ${s(2)}px Arial`
    ctx.fillStyle = '#6b7280'
    ctx.fillText('As per the Real Estate Broker By-Law No. (85) of 2006', s(W / 2), s(17.5))
    ctx.textAlign = 'left'

    // Right header fields: BRN, STR, DATE
    const rhX = W - M - 40
    ctx.font = `bold ${s(2.1)}px Arial`
    ctx.fillStyle = themeStr
    ctx.textAlign = 'right'
    ctx.fillText('BRN #:', s(rhX + 14), s(8))
    ctx.fillText('STR #:', s(rhX + 14), s(12.5))
    ctx.fillText('DATE:', s(rhX + 14), s(17))
    ctx.textAlign = 'left'
    ctx.font = `400 ${s(2.1)}px Arial`
    ctx.fillStyle = '#111827'
    ctx.fillText(form.brn, s(rhX + 15), s(8))
    ctx.fillText(form.strNo, s(rhX + 15), s(12.5))
    const today = new Date()
    const headerDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    ctx.fillText(headerDate, s(rhX + 15), s(17))

    // Header bottom border
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.6)
    ctx.beginPath()
    ctx.moveTo(s(M), s(26))
    ctx.lineTo(s(W - M), s(26))
    ctx.stroke()

    // ========== SECTION 1: THE PARTIES ==========
    const s1Y = 29
    sectionBar('1 - The Parties', s1Y)

    // Sub boxes
    const boxY = s1Y + 11
    const boxH = 50
    subBox("THE AGENT/BROKER - SELLER'S AGENT (A)", M, boxY, HALF, boxH)
    subBox("THE AGENT/BROKER - BUYER'S AGENT (B)", M + HALF + 6, boxY, HALF, boxH)

    // Agent column helper
    function drawAgentCol(x: number, w: number, data: typeof form | null, formLabel: string) {
      let y = boxY + 5
      labelValue('Name of Establishment:', data?.establishmentName || '', x + 1.5, y, w - 3); y += 6
      labelValue('Address:', data?.officeAddress || '', x + 1.5, y, w - 3); y += 6
      const hw = (w - 6) / 2
      labelValue('Tel:', data?.officePhone || '', x + 1.5, y, hw)
      labelValue('Fax:', data?.officeFax || '', x + hw + 4, y, hw); y += 5
      labelValue('Email:', data?.officeEmail || '', x + 1.5, y, hw)
      labelValue('ORN:', data?.orn || '', x + hw + 4, y, hw); y += 6
      // Separator
      ctx!.strokeStyle = '#f3f4f6'
      ctx!.lineWidth = s(0.15)
      ctx!.beginPath()
      ctx!.moveTo(s(x + 1.5), s(y))
      ctx!.lineTo(s(x + w - 1.5), s(y))
      ctx!.stroke()
      y += 2.5
      labelValue('Name:', data?.agentName || '', x + 1.5, y, w - 3); y += 5
      labelValue('BRN#:', data?.brn || '', x + 1.5, y, hw)
      labelValue('Mobile:', data?.agentMobile || '', x + hw + 4, y, hw); y += 5
      labelValue('BRN Date Issued:', data?.dateIssue || '', x + 1.5, y, w - 3); y += 5
      labelValue(`${formLabel}:`, data?.formRefNo || '', x + 1.5, y, w - 3)
    }

    drawAgentCol(M, HALF, form.role === 'seller' ? form : null, "Landlord's Form A No")
    drawAgentCol(M + HALF + 6, HALF, form.role === 'buyer' ? form : null, "Buyer's Form B No")

    // Declarations
    const declY = boxY + boxH + 3
    const declW = HALF - 2
    ctx.fillStyle = themeStr
    ctx.font = `bold ${s(2.1)}px Arial`
    ctx.fillText('Declaration by Agent "A"', s(M + 1), s(declY))
    ctx.fillText('Declaration by Agent "B"', s(M + HALF + 7), s(declY))

    ctx.font = `italic ${s(2.3)}px Arial`
    ctx.fillStyle = '#374151'
    const declTextA = 'I hereby declare, I have read and understood the Real Estate Brokers Code of Ethics. I have a current signed Seller’s Agreement FORM A. I shall respond to a reasonable offer to purchase the listed property from Agent B, and shall not contact Agent B’s Buyer nor confer with their client under no circumstances unless the nominated Buyer herein has already discussed the stated listed property with our office.'
    const declTextB = 'I hereby declare, I have read and understood the Real Estate Brokers Code of Ethics. I have a current signed Buyer’s Agreement FORM B. I shall encourage my Buyer as named herein, to submit a reasonable offer for the stated property and not contact Agent A Seller nor confer with their client under no circumstances unless the Agent A has delayed our proposal on the prescribed FORM with a reasonable reply within 24 hours.'

    // Word-wrap declaration text
    function wrapText(text: string, x: number, y: number, maxW: number, lineH: number) {
      const words = text.split(' ')
      let line = ''
      let cy = y
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        if (ctx!.measureText(test).width > s(maxW)) {
          ctx!.fillText(line, s(x), s(cy))
          line = word
          cy += lineH
        } else {
          line = test
        }
      }
      if (line) ctx!.fillText(line, s(x), s(cy))
      return cy + lineH
    }

    const declEndA = wrapText(declTextA, M + 1, declY + 4, declW, 3.3)
    const declEndB = wrapText(declTextB, M + HALF + 7, declY + 4, declW, 3.3)

    // ========== SECTIONS 2 & 3: SIDE BY SIDE ==========
    const s23Y = Math.max(declEndA, declEndB) + 4
    // Horizontal divider
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = s(0.2)
    ctx.beginPath()
    ctx.moveTo(s(M), s(s23Y - 1))
    ctx.lineTo(s(W - M), s(s23Y - 1))
    ctx.stroke()

    // Section 2: The Property (left column)
    const s2X = M
    sectionBar('2 - The Property', s23Y)

    // Vertical divider between sections 2 and 3
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = s(0.2)
    ctx.beginPath()
    ctx.moveTo(s(M + HALF + 3), s(s23Y))
    ctx.lineTo(s(M + HALF + 3), s(s23Y + 72))
    ctx.stroke()

    // Section 2 header spans left half only
    ctx.fillStyle = themeStr
    ctx.fillRect(s(M), s(s23Y), s(HALF + 1), s(7))
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 ${s(2.8)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('2 - The Property', s(M + (HALF + 1) / 2), s(s23Y + 5))
    ctx.textAlign = 'left'

    // Section 3 header spans right half only
    ctx.fillStyle = themeStr
    ctx.fillRect(s(M + HALF + 5), s(s23Y), s(HALF + 1), s(7))
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 ${s(2.8)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('3 - The Commission (Split)', s(M + HALF + 5 + (HALF + 1) / 2), s(s23Y + 5))
    ctx.textAlign = 'left'

    // Clear the full-width section bar we drew
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(s(M), s(s23Y), s(CW), s(7))
    // Redraw left half header
    ctx.fillStyle = themeStr
    ctx.fillRect(s(M), s(s23Y), s(HALF + 1), s(7))
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 ${s(2.8)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('2 - The Property', s(M + (HALF + 1) / 2), s(s23Y + 5))
    ctx.textAlign = 'left'
    // Redraw right half header
    ctx.fillStyle = themeStr
    ctx.fillRect(s(M + HALF + 5), s(s23Y), s(HALF + 1), s(7))
    ctx.fillStyle = '#ffffff'
    ctx.font = `500 ${s(2.8)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('3 - The Commission (Split)', s(M + HALF + 5 + (HALF + 1) / 2), s(s23Y + 5))
    ctx.textAlign = 'left'

    // Section 2 fields
    const pw = HALF - 2
    let py = s23Y + 13
    labelValueFull('Property Address:', form.propertyAddress, s2X + 1, py, pw); py += 7
    // Second address line
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = s(0.1)
    ctx.setLineDash([s(0.5), s(0.5)])
    ctx.beginPath()
    ctx.moveTo(s(s2X + 1), s(py + 2))
    ctx.lineTo(s(s2X + 1 + pw), s(py + 2))
    ctx.stroke()
    ctx.setLineDash([])
    if (form.propertyAddressLine2.trim()) {
      ctx.font = `400 ${s(2.2)}px Arial`
      ctx.fillStyle = '#111827'
      ctx.fillText(form.propertyAddressLine2, s(s2X + 1), s(py + 1.5))
    }
    py += 5
    labelValue('Master Developer:', form.propertyDeveloper, s2X + 1, py, pw); py += 6
    labelValue('Master Project Name:', form.projectName, s2X + 1, py, pw); py += 7

    // "Listing Agent to Complete" italic label
    ctx.font = `italic 600 ${s(2)}px Arial`
    ctx.fillStyle = themeStr
    ctx.fillText('Listing Agent to Complete:', s(s2X + 1), s(py)); py += 4
    labelValue('Building Name:', form.buildingName, s2X + 1, py, pw); py += 6
    labelValue('Listed Price:', form.price, s2X + 1, py, pw); py += 6
    labelValueFull('Description:', form.description, s2X + 1, py, pw); py += 7
    // Second description line
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = s(0.1)
    ctx.setLineDash([s(0.5), s(0.5)])
    ctx.beginPath()
    ctx.moveTo(s(s2X + 1), s(py + 2))
    ctx.lineTo(s(s2X + 1 + pw), s(py + 2))
    ctx.stroke()
    ctx.setLineDash([])
    if (form.descriptionLine2.trim()) {
      ctx.font = `400 ${s(2.2)}px Arial`
      ctx.fillStyle = '#111827'
      ctx.fillText(form.descriptionLine2, s(s2X + 1), s(py + 1.5))
    }
    py += 6

    // Is this property tenanted?
    ctx.font = `600 ${s(2.2)}px Arial`
    ctx.fillStyle = '#374151'
    ctx.fillText('Is this property tenanted?', s(s2X + 1), s(py))
    drawCheck(s2X + 55, py - 1, isYes(form.isTenanted), 'Yes')
    drawCheck(s2X + 68, py - 1, isNo(form.isTenanted), 'No')

    // Section 3 fields (right column)
    const s3X = M + HALF + 6
    const s3W = HALF - 2
    let cy = s23Y + 13

    // Black commission split box
    const splitBoxH = 12
    ctx.fillStyle = '#000000'
    ctx.fillRect(s(s3X), s(cy), s(s3W), s(splitBoxH))
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${s(2)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('The following commission split is agreed between the', s(s3X + s3W / 2), s(cy + 4.5))
    ctx.fillText("Seller's / Landlord's Agent and the Buyer's / Tenant's agent", s(s3X + s3W / 2), s(cy + 8.5))
    ctx.textAlign = 'left'
    cy += splitBoxH + 4

    // Commission percentage boxes
    const pctBoxW = 18, pctBoxH = 8
    const col1X = s3X + 5
    const col2X = s3X + s3W - pctBoxW - 5

    ctx.font = `600 ${s(2)}px Arial`
    ctx.fillStyle = '#374151'
    ctx.fillText("Seller/Landlord's", s(col1X), s(cy))
    ctx.fillText('Agent', s(col1X), s(cy + 3))
    ctx.fillText("Buyer/Tenant's", s(col2X), s(cy))
    ctx.fillText('Agent', s(col2X), s(cy + 3))
    cy += 4

    // Percentage boxes
    ctx.strokeStyle = themeStr
    ctx.lineWidth = s(0.15)
    ctx.setLineDash([s(0.5), s(0.5)])
    ctx.strokeRect(s(col1X), s(cy), s(pctBoxW), s(pctBoxH))
    ctx.strokeRect(s(col2X), s(cy), s(pctBoxW), s(pctBoxH))
    ctx.setLineDash([])
    // Fill values
    if (form.commissionSeller.trim()) {
      ctx.font = `600 ${s(3.2)}px Arial`
      ctx.fillStyle = '#111827'
      ctx.textAlign = 'center'
      ctx.fillText(form.commissionSeller, s(col1X + pctBoxW / 2), s(cy + 5.5))
      ctx.textAlign = 'left'
    }
    if (form.commissionBuyer.trim()) {
      ctx.font = `600 ${s(3.2)}px Arial`
      ctx.fillStyle = '#111827'
      ctx.textAlign = 'center'
      ctx.fillText(form.commissionBuyer, s(col2X + pctBoxW / 2), s(cy + 5.5))
      ctx.textAlign = 'left'
    }
    cy += pctBoxH + 4

    labelValueFull("Tenant's Name (Family Name Only):", form.clientName, s3X + 1, cy, s3W - 2); cy += 8
    labelValue('Budget:', form.budget, s3X + 1, cy, s3W - 2); cy += 7

    // Agency fee paid by
    ctx.font = `600 ${s(2.2)}px Arial`
    ctx.fillStyle = '#374151'
    ctx.fillText('Agency fee paid by:', s(s3X + 1), s(cy))
    drawCheck(s3X + 35, cy - 1, form.agencyFeePaidBy === 'Seller', 'Seller')
    drawCheck(s3X + 50, cy - 1, form.agencyFeePaidBy === 'Buyer', 'Buyer')
    drawCheck(s3X + 63, cy - 1, form.agencyFeePaidBy === 'Negotiable', 'Neg.')
    cy += 6

    // Has buyer contacted listing agent?
    ctx.font = `600 ${s(2.1)}px Arial`
    ctx.fillStyle = '#374151'
    ctx.fillText('Has this buyer contacted the listing agent?', s(s3X + 1), s(cy))
    drawCheck(s3X + 55, cy - 1, isYes(form.isBuyerAgent), 'Yes')
    drawCheck(s3X + 68, cy - 1, isNo(form.isBuyerAgent), 'No')

    // Section border
    const s23EndY = Math.max(py + 3, cy + 3)
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = s(0.2)
    ctx.beginPath()
    ctx.moveTo(s(M), s(s23EndY))
    ctx.lineTo(s(W - M), s(s23EndY))
    ctx.stroke()

    // ========== SECTION 4: THE SIGNATURES ==========
    const s4Y = s23EndY + 2
    sectionBar('4 - The Signatures', s4Y)

    // Cooperation note
    ctx.font = `bold italic ${s(2.3)}px Arial`
    ctx.fillStyle = '#6b7280'
    ctx.textAlign = 'center'
    ctx.fillText('Both Agents are required to co-operate to fully complete this Form & retain a fully signed & stamped copy on file', s(W / 2), s(s4Y + 12))
    ctx.textAlign = 'left'

    // Signature areas
    const sigY = s4Y + 16
    const sigBoxW = HALF - 8
    const sigBoxH = 18
    const sigAX = M + 10
    const sigBX = M + HALF + 12

    // Agent A
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = s(0.2)
    ctx.beginPath()
    ctx.moveTo(s(sigAX), s(sigY + sigBoxH))
    ctx.lineTo(s(sigAX + sigBoxW), s(sigY + sigBoxH))
    ctx.stroke()
    ctx.fillStyle = themeStr
    ctx.font = `bold ${s(2.4)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('Agent A', s(sigAX + sigBoxW / 2), s(sigY + sigBoxH + 4))
    ctx.font = `italic ${s(1.8)}px Arial`
    ctx.fillStyle = '#9ca3af'
    ctx.fillText('(Signature & Company Stamp)', s(sigAX + sigBoxW / 2), s(sigY + sigBoxH + 7.5))
    ctx.textAlign = 'left'

    // Agent B
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = s(0.2)
    ctx.beginPath()
    ctx.moveTo(s(sigBX), s(sigY + sigBoxH))
    ctx.lineTo(s(sigBX + sigBoxW), s(sigY + sigBoxH))
    ctx.stroke()
    ctx.fillStyle = themeStr
    ctx.font = `bold ${s(2.4)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('Agent B', s(sigBX + sigBoxW / 2), s(sigY + sigBoxH + 4))
    ctx.font = `italic ${s(1.8)}px Arial`
    ctx.fillStyle = '#9ca3af'
    ctx.fillText('(Signature & Company Stamp)', s(sigBX + sigBoxW / 2), s(sigY + sigBoxH + 7.5))
    ctx.textAlign = 'left'

    // Draw signature & stamp images on the user's side
    const sigImg = await loadOptionalImage(uploads.signature)
    const stampSource = uploads.stamp ?? storedAssets.stampDataUrl
    const stampImg = await loadOptionalImage(stampSource)
    const userSigX = form.role === 'seller' ? sigAX : sigBX
    if (sigImg) ctx.drawImage(sigImg, s(userSigX), s(sigY), s(sigBoxW / 2 - 2), s(sigBoxH - 1))
    if (stampImg) ctx.drawImage(stampImg, s(userSigX + sigBoxW / 2 + 2), s(sigY), s(sigBoxW / 2 - 2), s(sigBoxH - 1))

    // RERA notice
    const noticeY = sigY + sigBoxH + 12
    ctx.strokeStyle = '#fecaca'
    ctx.lineWidth = s(0.2)
    ctx.fillStyle = '#fef2f2'
    ctx.fillRect(s(M + 5), s(noticeY), s(CW - 10), s(6))
    ctx.strokeRect(s(M + 5), s(noticeY), s(CW - 10), s(6))
    ctx.fillStyle = '#ef4444'
    ctx.font = `bold ${s(1.9)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('In the event Agent A does not respond within 24 hours, Agent B must contact RERA (Real Estate Regulatory Authority)', s(W / 2), s(noticeY + 4))
    ctx.textAlign = 'left'

    // Footer logos
    const footerLogosImg = await loadOptionalImage('/rera-logo.png')
    if (footerLogosImg) {
      const footerLogoH = 12
      const aspect = footerLogosImg.naturalWidth / footerLogosImg.naturalHeight
      const footerLogoW = footerLogoH * aspect
      const footerLogoX = (W - footerLogoW) / 2
      const footerLogoY = H - footerLogoH - 3
      ctx.drawImage(footerLogosImg, s(footerLogoX), s(footerLogoY), s(footerLogoW), s(footerLogoH))
    }

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
    const outputBytes = Uint8Array.from(output)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outBlob = new Blob([outputBytes], { type: 'application/pdf' })
    openBlobInNewTab(outBlob)
    downloadBlob(outBlob, `agent-to-agent-filled-${stamp}.pdf`)
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
    <h2 class="module-title text-2xl font-bold">Form I / Agent To Agent</h2>
    <p class="mt-2 text-sm text-slate-600">
      Fill the form details and generate a branded PDF. Choose a theme color to match your company's brand.
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

          <label class="text-sm font-semibold">
            STR No
            <input v-model="form.strNo" type="text" class="field-control mt-1" placeholder="STR number" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Name of Establishment
            <input v-model="form.establishmentName" type="text" class="field-control mt-1" placeholder="Establishment name" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Office Address
            <input v-model="form.officeAddress" type="text" class="field-control mt-1" placeholder="Office address" >
          </label>

          <label class="text-sm font-semibold">
            Tel
            <input v-model="form.officePhone" type="text" class="field-control mt-1" placeholder="Office phone" >
          </label>

          <label class="text-sm font-semibold">
            Fax
            <input v-model="form.officeFax" type="text" class="field-control mt-1" placeholder="Fax number" >
          </label>

          <label class="text-sm font-semibold">
            Email
            <input v-model="form.officeEmail" type="email" class="field-control mt-1" placeholder="office@email.com" >
          </label>

          <label class="text-sm font-semibold">
            ORN
            <input v-model="form.orn" type="text" class="field-control mt-1" placeholder="ORN" >
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
            BRN Date Issued
            <input v-model="form.dateIssue" type="date" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Agent Mobile
            <input v-model="form.agentMobile" type="text" class="field-control mt-1" placeholder="Agent mobile" >
          </label>

          <label class="text-sm font-semibold">
            {{ form.role === 'seller' ? "Landlord's Form A No" : "Buyer's Form B No" }}
            <input v-model="form.formRefNo" type="text" class="field-control mt-1" placeholder="Form reference number" >
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Property Details</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Property Address
            <input v-model="form.propertyAddress" type="text" class="field-control mt-1" placeholder="Property address line 1" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Property Address (line 2)
            <input v-model="form.propertyAddressLine2" type="text" class="field-control mt-1" placeholder="Address line 2 (optional)" >
          </label>

          <label class="text-sm font-semibold">
            Master Developer
            <input v-model="form.propertyDeveloper" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Master Project Name
            <input v-model="form.projectName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Building Name
            <input v-model="form.buildingName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Listed Price
            <input v-model="form.price" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Description
            <input v-model="form.description" type="text" class="field-control mt-1" placeholder="Line 1" >
          </label>

          <label class="text-sm font-semibold">
            Description (line 2)
            <input v-model="form.descriptionLine2" type="text" class="field-control mt-1" placeholder="Line 2 (optional)" >
          </label>

          <label class="text-sm font-semibold">
            Is this property tenanted?
            <select v-model="form.isTenanted" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Commission &amp; Terms</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">
            Commission — Seller/Landlord's Agent
            <input v-model="form.commissionSeller" type="text" class="field-control mt-1" placeholder="e.g. 50%" >
          </label>

          <label class="text-sm font-semibold">
            Commission — Buyer/Tenant's Agent
            <input v-model="form.commissionBuyer" type="text" class="field-control mt-1" placeholder="e.g. 50%" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Tenant's Name (Family Name Only)
            <input v-model="form.clientName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Budget
            <input v-model="form.budget" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Agency Fee Paid By
            <select v-model="form.agencyFeePaidBy" class="field-control mt-1">
              <option value="">Select</option>
              <option value="Seller">Seller</option>
              <option value="Buyer">Buyer</option>
              <option value="Negotiable">Negotiable</option>
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

        <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h4 class="text-sm font-bold text-slate-700">Theme Color</h4>
          <p class="mt-1 text-xs text-slate-500">Pick a brand color for headers, borders, and accents in the generated PDF.</p>
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
      <button type="button" class="btn-primary disabled:opacity-60" :disabled="generating" @click.prevent="generateAgentToAgentPdf">
        {{ generating ? 'Generating PDF...' : 'Generate PDF' }}
      </button>
    </div>
  </section>
</template>
