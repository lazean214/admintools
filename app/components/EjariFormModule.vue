<script setup lang="ts">
import { ejariFields } from '../utils/ejari'
import { renderEjariPages } from '../utils/ejari-render'
import { loadEjariTemplate } from '../utils/ejari-template'
import { ProcessingClient, ProcessingCancelledError } from '../utils/processing-client'

const exporter = new ProcessingClient(() => new Worker(new URL('../workers/ejari.worker.ts', import.meta.url), { type:'module' }))
let exportGeneration = 0
let templateAbort: AbortController | null = null
function cancelExport() {
  exportGeneration++
  templateAbort?.abort()
  templateAbort = null
  exporter.cancel()
  generating.value = false
  setStatus('EJARI export cancelled.')
}
onBeforeUnmount(() => {
  cancelExport()
  if (completedPdf.value) URL.revokeObjectURL(completedPdf.value.url)
})

type PropertyUsage = 'Residential' | 'Commercial' | 'Industrial'
type PaymentMode = 'Cash' | 'Cheque' | 'Bank Transfer' | 'Other'

const status = ref('Ready')
const generating = ref(false)
const validationErrors = ref<string[]>([])
const completedPdf = ref<{ url: string; fileName: string } | null>(null)

const licensingAuthorities = ['DLD', 'RERA', 'DED', 'Other']
const propertyTypeOptions = ['Apartment', 'Villa', 'Townhouse', 'Office', 'Shop', 'Warehouse', 'Other']
const paymentModes: PaymentMode[] = ['Cash', 'Cheque', 'Bank Transfer', 'Other']

const form = reactive({
  ownerName: '',
  lessorName: '',
  lessorEmiratesId: '',
  lessorLicensingAuthority: '',
  lessorLicenseNo: '',
  lessorEmail: '',
  lessorPhone: '',

  tenantName: '',
  tenantEmiratesId: '',
  tenantLicensingAuthority: '',
  tenantLicenseNo: '',
  tenantEmail: '',
  tenantPhone: '',

  propertyUsage: '' as '' | PropertyUsage,
  plotOrMakaniNo: '',
  buildingName: '',
  propertyNo: '',
  propertyType: '',
  propertyAreaSqm: 1,
  location: '',
  premisesNoDewa: '',

  contractStartDate: '',
  contractEndDate: '',
  contractValueAed: '',
  annualRentAed: '',
  securityDepositAed: '',
  modeOfPayment: '' as '' | PaymentMode,

  additionalTerm1: '',
  additionalTerm2: '',
  additionalTerm3: '',
  additionalTerm4: '',
  additionalTerm5: ''
})

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const contractPeriod = computed(() => {
  if (!form.contractStartDate || !form.contractEndDate) return ''
  const start = new Date(form.contractStartDate)
  const end = new Date(form.contractEndDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return ''

  const diffMs = end.getTime() - start.getTime()
  const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  const years = Math.floor(totalDays / 365)
  const daysAfterYears = totalDays % 365
  const months = Math.floor(daysAfterYears / 30)
  const days = daysAfterYears % 30

  const parts: string[] = []
  if (years) parts.push(`${years} year${years > 1 ? 's' : ''}`)
  if (months) parts.push(`${months} month${months > 1 ? 's' : ''}`)
  if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`)
  return parts.length ? parts.join(', ') : `${totalDays} day${totalDays > 1 ? 's' : ''}`
})

function setStatus(message: string) {
  status.value = message
}

function downloadCompletedPdf(url: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function validateForm() {
  const issues: string[] = []

  if (!form.ownerName.trim()) issues.push("Owner's Name is required.")
  if (!form.lessorName.trim()) issues.push("Lessor's Name is required.")
  if (!form.lessorLicensingAuthority) issues.push("Lessor Licensing Authority is required.")
  if (!form.lessorLicenseNo.trim()) issues.push("Lessor License No. is required.")
  if (!emailPattern.test(form.lessorEmail.trim())) issues.push("Lessor Email must be valid.")

  if (!form.tenantName.trim()) issues.push("Tenant's Name is required.")
  if (!form.tenantLicensingAuthority) issues.push('Tenant Licensing Authority is required.')
  if (!form.tenantLicenseNo.trim()) issues.push('Tenant License No. is required.')
  if (!emailPattern.test(form.tenantEmail.trim())) issues.push('Tenant Email must be valid.')

  if (!form.propertyUsage) issues.push('Property Usage is required.')
  if (!form.plotOrMakaniNo.trim()) issues.push('Plot No. / Makani No. is required.')
  if (!form.propertyNo.trim()) issues.push('Property No. is required.')
  if (!Number.isFinite(form.propertyAreaSqm) || Number(form.propertyAreaSqm) < 1) {
    issues.push('Property Area must be at least 1 s.m.')
  }

  if (!form.contractStartDate) issues.push('Contract Start Date is required.')
  if (!form.contractEndDate) issues.push('Contract End Date is required.')
  if (form.contractStartDate && form.contractEndDate) {
    const start = new Date(form.contractStartDate)
    const end = new Date(form.contractEndDate)
    if (end <= start) issues.push('Contract End Date must be after Start Date.')
  }
  if (!contractPeriod.value) issues.push('Contract Period could not be calculated.')

  if (!form.contractValueAed || Number(form.contractValueAed) <= 0) {
    issues.push('Contract Value is required and must be greater than 0.')
  }
  if (!form.annualRentAed || Number(form.annualRentAed) <= 0) {
    issues.push('Annual Rent is required and must be greater than 0.')
  }
  if (!form.securityDepositAed || Number(form.securityDepositAed) < 0) {
    issues.push('Security Deposit Amount is required.')
  }
  if (!form.modeOfPayment) issues.push('Mode of Payment is required.')

  validationErrors.value = issues
  return issues.length === 0
}

async function generateEjariPdf() {
  if (generating.value) return
  if (!validateForm()) {
    setStatus('Please fix form errors before exporting.')
    return
  }
  const snapshot = { ...form }
  const generation = ++exportGeneration
  const controller = new AbortController()
  templateAbort = controller
  generating.value = true
  setStatus('Preparing EJARI export...')
  try {
    const fields = ejariFields(snapshot)
    const template = await loadEjariTemplate(controller.signal)
    if (generation !== exportGeneration) return
    setStatus('Rendering filled EJARI pages...')
    const assertActive = () => {
      if (generation !== exportGeneration) throw new ProcessingCancelledError()
    }
    const rgba = await renderEjariPages(template, fields, controller.signal, assertActive)
    assertActive()
    setStatus('Packaging filled EJARI PDF...')
    const outBlob = await exporter.ejariRasterPdf(rgba)
    if (generation !== exportGeneration) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const previous = completedPdf.value
    const result = { url: URL.createObjectURL(outBlob), fileName: `ejari-filled-${stamp}.pdf` }
    completedPdf.value = result
    if (previous) URL.revokeObjectURL(previous.url)
    downloadCompletedPdf(result.url, result.fileName)
    setStatus('Filled PDF ready. Use the preview or download link below to open this export.')
  } catch (error) {
    if (generation !== exportGeneration || error instanceof ProcessingCancelledError) return
    setStatus(error instanceof Error ? error.message : String(error))
  } finally {
    if (generation === exportGeneration) {
      generating.value = false
      templateAbort = null
    }
  }
}
</script>

<template>
  <section class="module-surface">
    <h2 class="module-title text-2xl font-bold">EJARI Form</h2>
    <p class="mt-2 text-sm text-slate-600">
      Complete the EJARI fields and export using the official template.
    </p>
    <p class="status-pill mt-3">{{ status }}</p>

    <div v-if="validationErrors.length" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p class="text-sm font-bold text-amber-800">Please fix the following:</p>
      <ul class="mt-2 list-disc pl-5 text-sm text-amber-900">
        <li v-for="issue in validationErrors" :key="issue">{{ issue }}</li>
      </ul>
    </div>

    <div class="mt-5 grid gap-4 lg:grid-cols-2">
      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Section 1: Owner/Lessor Information</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Owner's Name *
            <input v-model="form.ownerName" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Lessor's Name *
            <input v-model="form.lessorName" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Lessor's Emirates ID *
            <input
              v-model="form.lessorEmiratesId"
              type="text"
              class="field-control mt-1"
              placeholder="123-4567-1234567"
              required
            >
          </label>

          <label class="text-sm font-semibold">
            Licensing Authority *
            <select v-model="form.lessorLicensingAuthority" class="field-control mt-1" required>
              <option value="">Select</option>
              <option v-for="authority in licensingAuthorities" :key="`lessor-${authority}`" :value="authority">{{ authority }}</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            License No. *
            <input v-model="form.lessorLicenseNo" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Lessor's Email *
            <input v-model="form.lessorEmail" type="email" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Lessor's Phone *
            <input v-model="form.lessorPhone" type="tel" class="field-control mt-1" placeholder="+971 501234567" required >
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Section 2: Tenant Information</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold sm:col-span-2">
            Tenant's Name *
            <input v-model="form.tenantName" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Tenant's Emirates ID *
            <input
              v-model="form.tenantEmiratesId"
              type="text"
              class="field-control mt-1"
              placeholder="123-4567-1234567"
              required
            >
          </label>

          <label class="text-sm font-semibold">
            Licensing Authority *
            <select v-model="form.tenantLicensingAuthority" class="field-control mt-1" required>
              <option value="">Select</option>
              <option v-for="authority in licensingAuthorities" :key="`tenant-${authority}`" :value="authority">{{ authority }}</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            License No. *
            <input v-model="form.tenantLicenseNo" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Tenant's Email *
            <input v-model="form.tenantEmail" type="email" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Tenant's Phone *
            <input v-model="form.tenantPhone" type="tel" class="field-control mt-1" placeholder="+971 501234567" required >
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Section 3: Property Information</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <fieldset class="sm:col-span-2">
            <legend class="text-sm font-semibold">Property Usage *</legend>
            <div class="mt-2 flex flex-wrap gap-4">
              <label class="inline-flex items-center gap-2 text-sm">
                <input v-model="form.propertyUsage" type="radio" value="Residential" >
                Residential
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input v-model="form.propertyUsage" type="radio" value="Commercial" >
                Commercial
              </label>
              <label class="inline-flex items-center gap-2 text-sm">
                <input v-model="form.propertyUsage" type="radio" value="Industrial" >
                Industrial
              </label>
            </div>
          </fieldset>

          <label class="text-sm font-semibold">
            Plot No. / Makani No. *
            <input v-model="form.plotOrMakaniNo" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Property No. *
            <input v-model="form.propertyNo" type="text" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Building Name
            <input v-model="form.buildingName" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold">
            Property Type
            <select v-model="form.propertyType" class="field-control mt-1">
              <option value="">Select</option>
              <option v-for="type in propertyTypeOptions" :key="type" :value="type">{{ type }}</option>
            </select>
          </label>

          <label class="text-sm font-semibold">
            Property Area (s.m) *
            <input v-model.number="form.propertyAreaSqm" type="number" min="1" step="1" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Location
            <input v-model="form.location" type="text" class="field-control mt-1" >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Premises No. (DEWA)
            <input v-model="form.premisesNoDewa" type="text" class="field-control mt-1" >
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4">
        <h3 class="module-title text-lg font-bold">Section 4: Contract Information</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">
            Contract Start Date *
            <input v-model="form.contractStartDate" type="date" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Contract End Date *
            <input v-model="form.contractEndDate" type="date" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold sm:col-span-2">
            Contract Period (auto-calculated)
            <input :value="contractPeriod || 'Pending valid dates'" type="text" class="field-control mt-1 bg-slate-100" readonly >
          </label>

          <label class="text-sm font-semibold">
            Contract Value (AED) *
            <input v-model="form.contractValueAed" type="number" min="0" step="0.01" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Annual Rent (AED) *
            <input v-model="form.annualRentAed" type="number" min="0" step="0.01" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Security Deposit Amount (AED) *
            <input v-model="form.securityDepositAed" type="number" min="0" step="0.01" class="field-control mt-1" required >
          </label>

          <label class="text-sm font-semibold">
            Mode of Payment *
            <select v-model="form.modeOfPayment" class="field-control mt-1" required>
              <option value="">Select</option>
              <option v-for="mode in paymentModes" :key="mode" :value="mode">{{ mode }}</option>
            </select>
          </label>
        </div>
      </div>

      <div class="rounded-2xl bg-white/70 p-4 lg:col-span-2">
        <h3 class="module-title text-lg font-bold">Section 5: Additional Terms (Page 3)</h3>
        <p class="mt-1 text-xs text-slate-500">These five lines are exported to the Additional Terms area on page 3.</p>
        <div class="mt-3 grid gap-3">
          <label class="text-sm font-semibold">
            Additional Term 1
            <input v-model="form.additionalTerm1" type="text" class="field-control mt-1" >
          </label>
          <label class="text-sm font-semibold">
            Additional Term 2
            <input v-model="form.additionalTerm2" type="text" class="field-control mt-1" >
          </label>
          <label class="text-sm font-semibold">
            Additional Term 3
            <input v-model="form.additionalTerm3" type="text" class="field-control mt-1" >
          </label>
          <label class="text-sm font-semibold">
            Additional Term 4
            <input v-model="form.additionalTerm4" type="text" class="field-control mt-1" >
          </label>
          <label class="text-sm font-semibold">
            Additional Term 5
            <input v-model="form.additionalTerm5" type="text" class="field-control mt-1" >
          </label>
        </div>
      </div>

    </div>

    <div class="mt-6 flex flex-wrap gap-3">
      <button type="button" class="btn-primary" :disabled="generating" @click="generateEjariPdf">
        {{ generating ? 'Generating PDF...' : 'Generate + Download Filled EJARI PDF' }}
      </button>
      <button v-if="generating" type="button" class="btn-secondary" @click="cancelExport">Cancel export</button>
    </div>
    <p class="mt-2 text-sm text-slate-600">Compatibility export: values are rendered into the three PDF pages. Text in the exported file is not selectable.</p>
    <div v-if="completedPdf" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="status">
      <p class="font-semibold text-emerald-900">Your filled EJARI PDF</p>
      <p class="mt-1 break-all text-sm text-emerald-900">{{ completedPdf.fileName }}</p>
      <div class="mt-3 flex flex-wrap gap-3">
        <a :href="completedPdf.url" target="_blank" rel="noopener noreferrer" class="btn-secondary">Open filled PDF preview</a>
        <a :href="completedPdf.url" :download="completedPdf.fileName" class="btn-primary">Download filled PDF</a>
      </div>
      <p class="mt-2 text-sm text-emerald-900">This file contains the values captured when you generated it. Generate again after editing the form.</p>
    </div>
  </section>
</template>
