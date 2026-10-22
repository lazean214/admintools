import { parseDocumentMrz } from './document-mrz'
import { englishDocumentLine, isDocumentPlaceholder } from './document-text'

export const ejariFieldDefinitions = [
  { key: 'ownerName', label: 'Owner name', aliases: ['owner name', 'name of owner', 'landlord name'] },
  { key: 'lessorName', label: 'Lessor name', aliases: ['lessor name', 'name of lessor'] },
  { key: 'tenantName', label: 'Tenant name', aliases: ['tenant name', 'name of tenant', 'tenant full name'] },
  { key: 'buildingName', label: 'Building name', aliases: ['building name', 'building'] },
  { key: 'propertyNo', label: 'Property number', aliases: ['property number', 'property no', 'unit number', 'unit no', 'unit'] },
  { key: 'location', label: 'Property location', aliases: ['property location', 'property address', 'location', 'community'] },
  { key: 'plotOrMakaniNo', label: 'Plot / Makani number', aliases: ['plot number', 'plot no', 'makani number', 'makani no'] },
  { key: 'premisesNoDewa', label: 'DEWA premises number', aliases: ['dewa premises number', 'premises number', 'dewa number', 'premises no. (dewa)', 'premises no (dewa)'] },
  { key: 'propertyType', label: 'Property type', aliases: ['property type'] },
  { key: 'contractStartDate', label: 'Contract start date', aliases: ['contract start date', 'commencement date', 'start date'] },
  { key: 'contractEndDate', label: 'Contract end date', aliases: ['contract end date', 'contract expiry date', 'end date'] },
  { key: 'annualRentAed', label: 'Annual rent (AED)', aliases: ['annual rent aed', 'annual rent', 'annual rental amount'] },
  { key: 'contractValueAed', label: 'Contract value (AED)', aliases: ['contract value aed', 'contract value', 'contract amount'] },
  { key: 'securityDepositAed', label: 'Security deposit (AED)', aliases: ['security deposit aed', 'security deposit amount', 'security deposit', 'deposit amount'] },
  { key: 'tenantEmail', label: 'Tenant email', aliases: ['tenant email', 'tenant email address'] },
  { key: 'tenantPhone', label: 'Tenant phone', aliases: ['tenant phone', 'tenant mobile', 'tenant telephone'] },
  { key: 'lessorEmail', label: 'Lessor email', aliases: ['lessor email', 'landlord email'] },
  { key: 'lessorPhone', label: 'Lessor phone', aliases: ['lessor phone', 'landlord phone', 'landlord mobile'] },
  { key: 'tenantEmiratesId', label: 'Tenant Emirates ID', aliases: ['tenant emirates id', 'tenant id number'] },
  { key: 'lessorEmiratesId', label: 'Lessor Emirates ID', aliases: ['lessor emirates id', 'landlord emirates id'] },
] as const

export const documentFieldDefinitions = [...ejariFieldDefinitions,
  { key: 'fullName', label: 'Full name', aliases: ['full name', 'name in english', 'holder name', 'name'] },
  { key: 'surname', label: 'Surname', aliases: ['surname', 'family name', 'last name'] },
  { key: 'givenNames', label: 'Given names', aliases: ['given names', 'given name', 'first name'] },
  { key: 'passportNumber', label: 'Passport number', aliases: ['passport number', 'passport no', 'passport no.', 'passport #'] },
  { key: 'emiratesId', label: 'Emirates ID number', aliases: ['emirates id number', 'emirates id no', 'emirates id'] },
  { key: 'cardNumber', label: 'Card / document number', aliases: ['card number', 'card no', 'document number', 'document no', 'id number', 'id no', 'passport or emirates id'] },
  { key: 'nationality', label: 'Nationality', aliases: ['nationality'] },
  { key: 'issuingCountry', label: 'Issuing country', aliases: ['issuing country', 'issuing state', 'country code'] },
  { key: 'birthDate', label: 'Date of birth', aliases: ['date of birth', 'birth date', 'dob'] },
  { key: 'identityExpiryDate', label: 'Document expiry date', aliases: ['date of expiry', 'expiration date', 'expiry date', 'valid until', 'valid to'] },
  { key: 'issueDate', label: 'Document issue date', aliases: ['date of issue', 'issue date', 'issuing date', 'issued on'] },
  { key: 'issuingPlace', label: 'Issuing place', aliases: ['issuing place', 'place of issue'] },
  { key: 'occupation', label: 'Occupation', aliases: ['occupation'] },
  { key: 'sex', label: 'Sex', aliases: ['sex', 'gender'] },
  { key: 'referenceNumber', label: 'Reference number', aliases: ['reference number', 'reference no', 'ref no', 'noc number', 'noc no'] },
  { key: 'documentDate', label: 'Document date', aliases: ['date'] },
  { key: 'companyName', label: 'Company name', aliases: ['company name', 'establishment name'] },
  { key: 'subject', label: 'Subject / purpose', aliases: ['subject', 'purpose'] },
  { key: 'email', label: 'Email', aliases: ['email address', 'e-mail', 'email'] },
  { key: 'phone', label: 'Phone', aliases: ['mobile number', 'telephone', 'phone number', 'phone', 'mobile'] },
  { key: 'buildingNumber', label: 'Building number', aliases: ['building number', 'building no'] },
  { key: 'floorNumber', label: 'Floor number', aliases: ['floor number', 'floor no'] },
  { key: 'municipalityNumber', label: 'Municipality number', aliases: ['municipality number', 'municipality no'] },
  { key: 'parking', label: 'Parking', aliases: ['parkings', 'parking'] },
  { key: 'suiteAreaSqm', label: 'Suite area (sq m)', aliases: ['suite area'] },
  { key: 'balconyAreaSqm', label: 'Balcony area (sq m)', aliases: ['balcony area'] },
  { key: 'totalAreaSqm', label: 'Total area (sq m)', aliases: ['area sq meter', 'area sq metre'] },
  { key: 'totalAreaSqft', label: 'Total area (sq ft)', aliases: ['area sq feet', 'area sq foot'] },
  { key: 'mortgageStatus', label: 'Mortgage status', aliases: ['mortgage status'] },
  { key: 'titleDeedNumber', label: 'Title deed number', aliases: ['title deed number', 'title deed no', 'certificate number'] },
  { key: 'ownerRegistrationNumber', label: 'Owner registration number', aliases: ['owner registration number'] },
  { key: 'streetName', label: 'Street name', aliases: ['street name'] },
  { key: 'propertyBuaSqft', label: 'Built-up area (sq ft)', aliases: ['bua (sqft)', 'bua (sq ft)'] },
  { key: 'propertyPlotSqft', label: 'Plot area (sq ft)', aliases: ['plot (sqft)', 'plot (sq ft)'] },
  { key: 'bedrooms', label: 'Bedrooms', aliases: ['bedrooms', 'bedroom'] },
  { key: 'bathrooms', label: 'Bathrooms', aliases: ['bathrooms', 'bathroom'] },
  { key: 'rentalAmountAed', label: 'Rental amount (AED)', aliases: ['rental amount'] },
] as const

export type DocumentKind = 'auto' | 'passport' | 'emirates-id' | 'noc' | 'property' | 'title-deed' | 'other'
export type IdentityRole = '' | 'tenant' | 'lessor' | 'owner'
export type EjariFieldKey = typeof ejariFieldDefinitions[number]['key']
export type ReviewedEjariFields = Partial<Record<EjariFieldKey, string>>

export type DocumentFieldKey = typeof documentFieldDefinitions[number]['key']
export type DocumentField = { key: DocumentFieldKey; label: string; value: string; source: string; selected: boolean; warning?: string; manual?: boolean }
export type ReviewedDocumentFields = Partial<Record<DocumentFieldKey, string>>
export const MAX_DOCUMENT_TEXT = 100_000

export function detectDocumentKind(text: string): Exclude<DocumentKind, 'auto'> {
  if (text.split(/\r?\n/).some(line => /^P[A-Z<][A-Z<]{3}[A-Z<]{39}$/.test(line.replace(/\s/g, '')) && line.includes('<'))) return 'passport'
  if (/title\s+deed/i.test(text)) return 'title-deed'
  if (/no[-\s]+objection|\bNOC\b|listing\s+agreement|landlord\s+details/i.test(text)) return 'noc'
  if (/tenancy\s+contract|tenant\s+information|contract\s+information/i.test(text)) return 'property'
  if (text.split(/\r?\n/).some(line => /^I[A-Z<]ARE[A-Z0-9<]{25}$/.test(line.replace(/\s/g, '')))) return 'emirates-id'
  if (/emirates\s*id|identity\s*card|(?<!\d)784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d(?!\d)/i.test(text)) return 'emirates-id'
  if (/passport/i.test(text)) return 'passport'
  if (/\b(tenancy|tenant|annual rent|ejari)\b/i.test(text)) return 'property'
  return 'other'
}

const definitions = documentFieldDefinitions.flatMap(field => field.aliases.map(alias => ({ ...field, alias })))
  .sort((a, b) => b.alias.length - a.alias.length)
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const labelPattern = (alias: string) => alias.split(/\s+/).map(escape).join('\\s+')
const patterns = definitions.map(field => ({ ...field, pattern: new RegExp(`(^|\\t+| {2,}| (?=${labelPattern(field.alias)}[.]?\\s*:))(${labelPattern(field.alias)})[.]?(?=\\s*[:=|/]|\\t| {2,}|\\s+\\d|$)`, 'gi') }))
function lineLabels(line: string) {
  const matches = patterns.flatMap(field => [...line.matchAll(field.pattern)].map(match => ({ field, index: match.index! + match[1]!.length, end: match.index! + match[0].length })))
    .sort((a, b) => a.index - b.index || b.end - a.end)
  const labels: typeof matches = []
  for (const match of matches) if (!labels.length || match.index >= labels[labels.length - 1]!.end) labels.push(match)
  return labels
}
const templateHeading = /^(?:owner\s*\/\s*lessor information|owner information|tenant information|landlord details|property (?:information|details)|contract information|terms (?:and|&) conditions|signatures?|approved signature|license no\.?|licensing authority|incase of a company|in case of a company|passport number\s*\/\s*emirates id|tenant signature|lessor signature|landlord signature)$/i
const cleanValue = (value: string) => value.replace(/^[\s:=|/]+|[\s:=|/]+$/g, '').replace(/[_·.\-]{3,}/g, ' ').replace(/\s+/g, ' ').trim()
const boundary = (value: string) => !value || templateHeading.test(value) || lineLabels(value).length > 0
  || /^(?:license no\.?|licensing authority|property area|landlord details|property details|terms and conditions)(?:\s|[:/]|$)/i.test(value)
  || /^(?:from|to)(?:\s|$)/i.test(value)
  || definitions.some(field => field.alias.includes(' ') && new RegExp(`^${labelPattern(field.alias)}[.]?(?=\\s|[:/]|$)`, 'i').test(value))

const formatEmiratesId = (value: string) => {
  const digits = value.replace(/[-\s]/g, '')
  return /^784\d{12}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}` : value
}

/** Conservative label matching after OCR: preserve source text and conflicting values for review. */
export function extractDocumentFields(text: string, kind: DocumentKind = 'auto'): DocumentField[] {
  if (text.length > MAX_DOCUMENT_TEXT) throw new Error('Use a shorter document excerpt (up to 100,000 characters).')
  const sourceLines = text.replace(/\r/g, '').split('\n').map(line => line.trim())
  const lines = sourceLines.map(englishDocumentLine)
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^passport number\s*\/$/i.test(lines[i]!) && /^emirates id$/i.test(lines[i + 1]!)) {
      lines[i] = 'Passport or Emirates ID'; sourceLines[i] += '\n' + sourceLines[i + 1]
      lines.splice(i + 1, 1); sourceLines.splice(i + 1, 1)
    }
  }
  const results: DocumentField[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, labels = lineLabels(line)
    // PDF word runs can resemble labels inside terms/paragraphs. Start only at
    // a field label (optionally numbered), then read subsequent explicit columns.
    if (labels.length && !/^(?:\d+[.)]?\s*)?$/.test(line.slice(0, labels[0]!.index).trim())) continue
    for (let n = 0; n < labels.length; n++) {
      const current = labels[n]!, field = current.field
      let value = cleanValue(line.slice(current.end, labels[n + 1]?.index ?? line.length))
      let source = sourceLines[i]!
      if (!value && labels.length === 1) {
        // Skip at most one adjacent Arabic translation line, never another field.
        let next = i + 1
        if (next < lines.length && !lines[next] && /[\u0600-\u06ff\ufb50-\ufeff]/.test(sourceLines[next]!)) next++
        if (next < lines.length && !boundary(lines[next]!)) {
          value = cleanValue(lines[next]!)
          source = sourceLines.slice(i, next + 1).join('\n')
        }
      }
      if (/Date$/.test(field.key)) {
        const dates = [...value.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})\b/g)]
        if (dates.length === 1) value = dates[0]![0]
      }
      if (field.key === 'cardNumber') {
        const number = value.match(/^784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d(?!\d)/) ?? value.match(/^\d{6,12}\b/)
        if (number) value = number[0]
      }
      if (isDocumentPlaceholder(value, /Aed$/.test(field.key)) || value.length > 300 || /[:=|]/.test(value) || boundary(value)) continue
      // A known label appearing in a value without a clear column boundary is ambiguous.
      if (definitions.some(other => new RegExp(`\\b${labelPattern(other.alias)}[.]?(?:\\s*[:=|]|\\s{2,}|$)`, 'i').test(value))) continue
      if (!results.some(item => item.key === field.key && item.value === value)) results.push({ key: field.key, label: field.label, value, source, selected: false })
    }
  }
  const identityContext = ['passport', 'emirates-id', 'noc'].includes(kind === 'auto' ? detectDocumentKind(text) : kind)
  if (identityContext) for (const field of results) {
    if (field.key === 'cardNumber' && /^784\d{12}$/.test(field.value.replace(/[-\s]/g, ''))) {
      field.key = 'emiratesId'; field.label = 'Emirates ID number'
    }
  }
  for (const field of results) if (['emiratesId', 'tenantEmiratesId', 'lessorEmiratesId'].includes(field.key)) field.value = formatEmiratesId(field.value)
  const add = (key: DocumentFieldKey, value: string, source: string, warning?: string) => {
    if (key === 'emiratesId') value = formatEmiratesId(value)
    if (!value || results.some(field => field.key === key && field.value === value)) return
    results.push({ key, label: documentFieldDefinitions.find(field => field.key === key)!.label, value, source, selected: false, warning })
  }
  if (kind === 'auto' || kind === 'passport' || kind === 'emirates-id') {
    for (const value of parseDocumentMrz(text)) add(value.key, value.value, value.source, value.warning)
  }
  if ((kind === 'auto' ? detectDocumentKind(text) : kind) === 'title-deed') {
    let owners = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.replace(/\s+/g, ' ').trim()
      if (/owners? numbers? and their|owners? and their shares/i.test(line)) { owners = true; continue }
      if (/approved signature|dubai land department|purchased from/i.test(line)) owners = false
      if (!owners) continue
      const match = line.replace(/\s+\(\d+\).*$/, '').match(/^\((\d{4,12})\)\s+([A-Z][A-Z .'-]+?)(?:\s+\d+(?:\.\d+)?\s*)?$/)
      if (!match) continue
      let name = match[2]!.trim(), end = i
      let next = i + 1
      if (/^\(?\d{4,12}\)?$/.test((lines[next] ?? '').trim())) next++
      const continuation = (lines[next] ?? '').replace(/\s+/g, ' ').trim()
      if (next < lines.length && /^[A-Z][A-Z .'-]{3,}$/.test(continuation) && !/SIGNATURE|DEPARTMENT|CERTIFICATE/.test(continuation)) { name += ' ' + continuation; end = next }
      const source = sourceLines.slice(i, end + 1).join('\n')
      add('ownerName', name, source, 'Read from the ownership table. Review all listed owners before using this name.')
      add('ownerRegistrationNumber', match[1]!, source)
    }
  }
  if (identityContext) {
    for (const line of lines) {
      // Do not infer birth dates from the digits of an ID number.
      for (const match of line.matchAll(/(?<!\d)784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d(?!\d)/g)) add('emiratesId', match[0].replace(/\s/g, ''), line, 'Check all 15 digits against the document.')
      const author = line.match(/^\s*(?:I|We),\s+([A-Za-z][A-Za-z .'-]{1,100}),\s*(?:holder of|holding)\s+(?:passport|Emirates\s+ID)/i)
      if ((kind === 'auto' || kind === 'noc') && author) add('fullName', author[1]!.trim(), line, 'The letter names this person; choose their role before transferring.')
      for (const match of line.matchAll(/\bpassport(?:\s+(?:number|no\.?))?\s*[:#]?\s+([A-Z0-9]{5,15})\b/gi)) {
        if (/\d/.test(match[1]!)) add('passportNumber', match[1]!, line)
      }
    }
  }
  const given = results.filter(field => field.key === 'givenNames'), family = results.filter(field => field.key === 'surname')
  if (!results.some(field => field.key === 'fullName') && given.length === 1 && family.length === 1) {
    add('fullName', `${given[0]!.value} ${family[0]!.value}`, `${given[0]!.source}\n${family[0]!.source}`, 'Combined from given names and surname. Confirm the name order against the document.')
  }
  return results
}

/** Accept only explicitly reviewed, known values; conflicting selections must be resolved. */
export function reviewedDocumentFields(fields: DocumentField[]): ReviewedDocumentFields {
  const result: ReviewedDocumentFields = {}
  for (const field of fields) {
    if (!field.selected) continue
    if (!documentFieldDefinitions.some(item => item.key === field.key)) throw new Error('Unknown document field.')
    const value = field.value.trim()
    if (!value || value.length > 300) throw new Error(`Review the value for ${field.label}.`)
    if (field.manual && !field.source.trim()) throw new Error(`Add a source excerpt for ${field.label}.`)
    if (result[field.key] && result[field.key] !== value) throw new Error(`Choose one value for ${field.label}.`)
    if (/Date$/.test(field.key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`Enter ${field.label} as a valid date in YYYY-MM-DD format before transferring.`)
    if (/Aed$/.test(field.key) && !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`Enter ${field.label} as a number without currency or commas.`)
    if (['emiratesId', 'tenantEmiratesId', 'lessorEmiratesId'].includes(field.key) && !/^784\d{12}$/.test(value.replace(/[-\s]/g, ''))) throw new Error(`Check ${field.label}: enter all 15 digits starting with 784.`)
    result[field.key] = value
  }
  if (!Object.keys(result).length) throw new Error('Select at least one reviewed field.')
  return result
}

export function fieldsForEjari(fields: DocumentField[], role: IdentityRole): ReviewedEjariFields {
  const values = reviewedDocumentFields(fields)
  const result: ReviewedEjariFields = {}
  const assign = (key: EjariFieldKey, value: string) => {
    if (result[key] && result[key] !== value) throw new Error(`Conflicting values for ${ejariFieldDefinitions.find(field => field.key === key)!.label}. Review the selected fields.`)
    result[key] = value
  }
  for (const field of ejariFieldDefinitions) if (values[field.key]) assign(field.key, values[field.key]!)
  if ((values.fullName || values.emiratesId) && !role) throw new Error('Choose whether this person is the tenant, lessor or owner before transferring.')
  if (values.fullName && role) assign(role === 'tenant' ? 'tenantName' : role === 'lessor' ? 'lessorName' : 'ownerName', values.fullName)
  if (values.emiratesId && (role === 'tenant' || role === 'lessor')) assign(role === 'tenant' ? 'tenantEmiratesId' : 'lessorEmiratesId', values.emiratesId)
  if (!Object.keys(result).length) throw new Error('These reviewed details have no matching EJARI fields. Download them instead, or select a name or supported property field.')
  return result
}
