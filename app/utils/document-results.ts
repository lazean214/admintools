import type { DocumentField, DocumentFieldKey, DocumentKind } from './document-fields'

/** Clean presentation without guessing dates or discarding conflicting source values. */
export function cleanDocumentResults(fields: DocumentField[], kind: DocumentKind): DocumentField[] {
  if (kind !== 'emirates-id' && kind !== 'title-deed') return fields
  const results: DocumentField[] = []
  for (const original of fields) {
    const field = { ...original, value: original.value.replace(/\s+/g, ' ').trim() }
    if (/Date$/.test(field.key)) {
      const match = field.value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
      if (match && Number(match[1]) > 12 && Number(match[2]) <= 12) {
        const iso = `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
        if (Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso) field.value = iso
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(field.value)) field.warning = [field.warning, 'Confirm the full date against the document and enter YYYY-MM-DD.'].filter(Boolean).join(' ')
    }
    const duplicate = !field.manual && results.find(item => !item.manual && item.key === field.key && item.value.toLocaleLowerCase() === field.value.toLocaleLowerCase())
    if (duplicate) {
      if (!duplicate.source.includes(field.source)) duplicate.source += '\n' + field.source
      if (field.warning && !duplicate.warning?.includes(field.warning)) duplicate.warning = [duplicate.warning, field.warning].filter(Boolean).join(' ')
    } else results.push(field)
  }
  return results
}

export function documentResultGroups(fields: DocumentField[], kind: DocumentKind) {
  const profiles: Partial<Record<DocumentKind, { title: string; keys: DocumentFieldKey[] }[]>> = {
    'emirates-id': [
      { title: 'Identity details', keys: ['emiratesId', 'fullName', 'birthDate', 'nationality', 'identityExpiryDate', 'issueDate', 'sex'] },
      { title: 'Card details', keys: ['cardNumber', 'occupation', 'issuingPlace', 'issuingCountry', 'givenNames', 'surname'] },
    ],
    'title-deed': [
      { title: 'Ownership', keys: ['ownerName', 'ownerRegistrationNumber'] },
      { title: 'Property details', keys: ['propertyType', 'propertyNo', 'buildingName', 'buildingNumber', 'floorNumber', 'location', 'plotOrMakaniNo', 'municipalityNumber', 'parking'] },
      { title: 'Areas', keys: ['suiteAreaSqm', 'balconyAreaSqm', 'totalAreaSqm', 'totalAreaSqft', 'propertyBuaSqft', 'propertyPlotSqft'] },
      { title: 'Deed details', keys: ['titleDeedNumber', 'issueDate', 'documentDate', 'mortgageStatus'] },
    ],
  }
  const profile = profiles[kind]
  if (!profile) return [{ title: '', fields }]
  const used = new Set<DocumentField>()
  const groups = profile.map(group => ({ title: group.title, fields: group.keys.flatMap(key => fields.filter(field => field.key === key)) }))
  for (const group of groups) for (const field of group.fields) used.add(field)
  groups.push({ title: 'Other details', fields: fields.filter(field => !used.has(field)) })
  return groups.filter(group => group.fields.length)
}
