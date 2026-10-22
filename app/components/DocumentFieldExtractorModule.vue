<script setup lang="ts">
import { DocumentReader } from '../utils/document-reader'
import { documentFieldDefinitions, extractDocumentFields, reviewedDocumentFields, fieldsForEjari, detectDocumentKind, MAX_DOCUMENT_TEXT } from '../utils/document-fields'
import type { DocumentField, DocumentFieldKey, DocumentKind, IdentityRole, ReviewedEjariFields } from '../utils/document-fields'

const reader = new DocumentReader()
const file = shallowRef<File | null>(null)
const text = ref('')
const page = ref(1)
const pages = ref<number | null>(null)
const forceOcr = ref(false)
const busy = ref(false)
const status = ref('Choose a document or paste its text to begin.')
const fields = ref<DocumentField[]>([])
const searched = ref(false)
const kind = ref<DocumentKind>('auto')
const identityRole = ref<IdentityRole>('')
const manualKey = ref<DocumentFieldKey>('fullName')
const kindLabels = { passport: 'Passport', 'emirates-id': 'Emirates ID', noc: 'NOC / authorization letter', property: 'Property / tenancy document', other: 'Other document' }
const detectedKind = computed(() => kind.value === 'auto' ? detectDocumentKind(text.value) : kind.value)
const hasIdentity = computed(() => fields.value.some(field => field.key === 'fullName' || field.key === 'emiratesId'))
const pendingImport = useState<ReviewedEjariFields | null>('reviewed-ejari-import', () => null)
const reviewedCount = computed(() => fields.value.filter(field => field.selected).length)
let generation = 0

function cancel() {
  generation++; reader.cancel(); busy.value = false
  status.value = 'Reading cancelled. Your document stays on this device.'
}
function resetSuggestions() { fields.value = []; searched.value = false }
function chooseFile(event: Event) {
  cancel(); resetSuggestions(); text.value = ''; pages.value = null; page.value = 1
  identityRole.value = ''; kind.value = 'auto'
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  status.value = file.value ? 'Ready to read. Choose a page, then read the document.' : 'Choose a document or paste its text to begin.'
}
function findFields() {
  resetSuggestions()
  try {
    if (!text.value.trim()) throw new Error('Paste or read some document text first.')
    fields.value = extractDocumentFields(text.value, kind.value)
    searched.value = true
    status.value = fields.value.length ? 'Review each suggestion against its source. Select only the values you have checked.' : 'No clear details found. Check the document type, correct the text, or add a field manually.'
  } catch (error) { status.value = error instanceof Error ? error.message : 'Could not find fields.' }
}
async function readDocument() {
  if (!file.value || busy.value) return
  const current = ++generation
  busy.value = true; resetSuggestions(); text.value = ''
  try {
    const result = await reader.read(file.value, page.value, forceOcr.value, message => { if (current === generation) status.value = message })
    if (current !== generation) return
    pages.value = result.pages; text.value = result.text
    findFields()
    if (!result.text.trim()) status.value = 'No text was found. Try a clearer image or paste the text manually.'
  } catch (error) {
    if (current === generation) status.value = error instanceof Error ? error.message : 'Could not read this document. Try a clearer image or paste its text.'
  } finally { if (current === generation) busy.value = false }
}
async function transfer() {
  try {
    const values = fieldsForEjari(fields.value, identityRole.value)
    pendingImport.value = values
    await navigateTo('/ejari-form')
  } catch (error) { status.value = error instanceof Error ? error.message : 'Review the selected fields first.' }
}
function addField() {
  const definition = documentFieldDefinitions.find(field => field.key === manualKey.value)!
  fields.value.push({ key: definition.key, label: definition.label, value: '', source: '', selected: false, manual: true })
  status.value = 'Enter the value and its source text, then mark it reviewed.'
}
function download() {
  try {
    const values = reviewedDocumentFields(fields.value)
    const url = URL.createObjectURL(new Blob([JSON.stringify(values, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'reviewed-document-fields.json'; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status.value = 'Reviewed fields downloaded.'
  } catch (error) { status.value = error instanceof Error ? error.message : 'Review the selected fields first.' }
}
onBeforeUnmount(() => { generation++; reader.cancel() })
</script>

<template>
  <section class="module-surface space-y-5">
    <div>
      <h2 class="module-title text-2xl font-bold">Read, review, then fill</h2>
      <p class="mt-2 max-w-3xl text-sm text-slate-600">Read passports, Emirates IDs, NOCs, tenancy papers and other documents. Review names, identity details and property information against the original before using them. Your documents stay on this device.</p>
    </div>
    <p class="status-pill" role="status" aria-live="polite">{{ status }}</p>
    <div class="grid gap-5 lg:grid-cols-2">
      <div class="space-y-4 min-w-0">
        <label class="block text-sm font-semibold">Document
          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" class="field-control mt-2" :disabled="busy" @change="chooseFile">
          <span class="mt-1 block text-xs font-normal text-slate-600">PDF, PNG, JPG or WebP · Up to 32 MB · PDFs up to 100 pages · One page at a time</span>
        </label>
        <label class="block text-sm font-semibold">Document type
          <select v-model="kind" class="field-control mt-1" :disabled="busy" @change="resetSuggestions">
            <option value="auto">Recognize from text</option>
            <option v-for="(label, value) in kindLabels" :key="value" :value="value">{{ label }}</option>
          </select>
        </label>
        <div v-if="file" class="flex flex-wrap items-end gap-4">
          <label class="block text-sm font-semibold">Page {{ pages ? `of ${pages}` : '' }}
            <input v-model.number="page" type="number" min="1" :max="pages ?? 100" class="field-control mt-1 w-24" :disabled="busy">
          </label>
          <label class="flex items-center gap-2 text-sm"><input v-model="forceOcr" type="checkbox" :disabled="busy">Read as a scan</label>
          <button class="btn-primary" :disabled="busy" @click="readDocument">Read document</button>
        </div>
        <button v-if="busy" class="btn-secondary" @click="cancel">Cancel reading</button>
        <label class="block text-sm font-semibold">Document text
          <textarea v-model="text" :maxlength="MAX_DOCUMENT_TEXT" rows="13" class="field-control mt-2 w-full" :disabled="busy" placeholder="Paste labeled details, for example: Tenant name: Jane Example" @input="resetSuggestions" />
        </label>
        <p class="text-xs text-slate-600">Use a clear, upright image of the passport details page or either side of an ID. Printed English and the machine-readable lines work best. Arabic-only text needs manual entry. Read one document/page at a time; choosing another file clears these suggestions.</p>
        <button class="btn-secondary" :disabled="busy || !text.trim()" @click="findFields">Find fields in text</button>
      </div>
      <div class="min-w-0">
        <h3 class="text-lg font-bold text-slate-900">Suggested fields</h3>
        <p v-if="text.trim()" class="mt-2 text-sm font-semibold text-teal-800">{{ kind === 'auto' ? 'Recognized as' : 'Reading as' }}: {{ kindLabels[detectedKind] }}. You can change the document type.</p>
        <p class="mt-1 text-sm text-slate-600">Compare each value with its source, correct it, then mark it reviewed. Dates must use YYYY-MM-DD. Enter amounts without currency or commas before transferring.</p>
        <div v-if="!fields.length" class="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
          {{ searched ? 'No clear details found. Try another document type, correct the text or add a field below.' : 'Read a document or paste its text to see suggestions. You can also add a field manually.' }}
        </div>
        <div v-else class="mt-4 space-y-5">
          <div v-for="(field, index) in fields" :key="`${field.key}-${index}`" class="border-b border-slate-200 pb-4">
            <label class="block text-sm font-semibold">{{ field.label }}
              <input v-model="field.value" maxlength="300" class="field-control mt-1" @input="field.selected = false">
            </label>
            <p class="mt-2 text-xs font-semibold text-slate-600">Source text</p>
            <blockquote class="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{{ field.source }}</blockquote>
            <label v-if="field.manual" class="mt-2 block text-xs font-semibold text-slate-600">Source excerpt
              <input v-model="field.source" class="field-control mt-1" maxlength="500" placeholder="Copy the matching text from the document" @input="field.selected = false">
            </label>
            <p v-if="field.warning" class="mt-2 text-xs text-amber-900">{{ field.warning }}</p>
            <label class="mt-3 flex items-center gap-2 text-sm font-semibold"><input v-model="field.selected" type="checkbox">Reviewed and ready to use</label>
          </div>
        </div>
        <div class="mt-5 flex flex-wrap items-end gap-2">
          <label class="min-w-0 flex-1 text-sm font-semibold">Add a missing field
            <select v-model="manualKey" class="field-control mt-1" :disabled="busy">
              <option v-for="definition in documentFieldDefinitions" :key="definition.key" :value="definition.key">{{ definition.label }}</option>
            </select>
          </label>
          <button class="btn-secondary" :disabled="busy" @click="addField">Add field</button>
        </div>
        <label v-if="hasIdentity" class="mt-5 block text-sm font-semibold">This person is the
          <select v-model="identityRole" class="field-control mt-1" :disabled="busy">
            <option value="">Choose a role for EJARI</option>
            <option value="tenant">Tenant</option>
            <option value="lessor">Lessor</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <div v-if="fields.length" class="mt-5 flex flex-wrap gap-2">
          <button class="btn-primary" :disabled="busy || !reviewedCount" @click="transfer">Use matching fields in EJARI</button>
          <button class="btn-secondary" :disabled="busy || !reviewedCount" @click="download">Download reviewed fields</button>
        </div>
        <p v-if="fields.length" class="mt-2 text-xs text-slate-600">Only matching form fields transfer to EJARI. Passport numbers, birth dates, nationality and other unmatched details remain available in the reviewed download. An owner's ID has no separate field in EJARI. Existing form values are kept.</p>
      </div>
    </div>
  </section>
</template>
