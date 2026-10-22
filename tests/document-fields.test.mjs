import test from 'node:test'
import assert from 'node:assert/strict'
import { extractDocumentFields, reviewedDocumentFields, fieldsForEjari, detectDocumentKind } from '../app/utils/document-fields.ts'
import { parseDocumentMrz, mrzCheckDigit } from '../app/utils/document-mrz.ts'

test('extracts labeled values and their source without guessing unlabeled names', () => {
  const fields = extractDocumentFields('TENANT NAME: Jane Example\nAnnual rent: AED 80,000\nBuilding name\nExample Tower\nJohn Unlabeled')
  assert.deepEqual(fields.map(f => [f.key, f.value]), [['tenantName','Jane Example'],['annualRentAed','AED 80,000'],['buildingName','Example Tower']])
  assert.equal(fields[2].source, 'Building name\nExample Tower')
  assert.ok(fields.every(f => !f.selected))
})

// Public ICAO specimen values, not a real person's identity document.
const passport = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10'

test('passport MRZ extracts neutral fields, preserves raw dates and checks transcription', () => {
  assert.equal(mrzCheckDigit('L898902C3'), 6)
  const fields = parseDocumentMrz(passport)
  assert.equal(fields.find(f => f.key === 'fullName')?.value, 'ANNA MARIA ERIKSSON')
  assert.equal(fields.find(f => f.key === 'passportNumber')?.value, 'L898902C3')
  assert.equal(fields.find(f => f.key === 'birthDate')?.value, '740812')
  assert.match(fields.find(f => f.key === 'birthDate')?.warning, /two digits/)
  assert.ok(fields.every(f => !f.warning.includes('checks failed')))
  assert.ok(parseDocumentMrz(passport.replace('L898902C3', 'L898902C4')).every(f => /checks failed/.test(f.warning)))
  assert.deepEqual(parseDocumentMrz('P<SHORT\n123'), [])
})
test('TD1 identity cards retain their card number without assuming it is an Emirates ID', () => {
  const fields = parseDocumentMrz('I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\n' + 'ERIKSSON<<ANNA<MARIA'.padEnd(30, '<'))
  assert.equal(fields.find(f => f.key === 'cardNumber')?.value, 'D23145890')
  assert.ok(!fields.some(f => f.key === 'emiratesId'))
  assert.ok(fields.every(f => !f.warning.includes('checks failed')))
})
test('Emirates ID details stay neutral and do not invent a birth date from the ID digits', () => {
  const fields = extractDocumentFields('Emirates ID\nName: Jane Example\nID Number: 784-2001-1234567-1\nNationality: EXAMPLE\nExpiry date: 2030-01-02')
  assert.equal(fields.find(f => f.key === 'emiratesId')?.value, '784-2001-1234567-1')
  assert.equal(fields.find(f => f.key === 'fullName')?.value, 'Jane Example')
  assert.equal(fields.find(f => f.key === 'identityExpiryDate')?.value, '2030-01-02')
  assert.ok(!fields.some(f => ['tenantName','ownerName','birthDate','contractEndDate','cardNumber'].includes(f.key)))
  assert.equal(extractDocumentFields('ID Number: ABC123', 'other')[0]?.key, 'cardNumber')
})
test('NOC classification and named-author clauses do not silently assign an owner role', () => {
  const text = 'NO OBJECTION CERTIFICATE\nReference No: NOC-123\nI, Jane Example, holder of passport number AB12345, authorize the agent.\nProperty No: 804'
  assert.equal(detectDocumentKind(text), 'noc')
  const fields = extractDocumentFields(text)
  assert.equal(fields.find(f => f.key === 'fullName')?.value, 'Jane Example')
  assert.equal(fields.find(f => f.key === 'referenceNumber')?.value, 'NOC-123')
  assert.equal(fields.find(f => f.key === 'passportNumber')?.value, 'AB12345')
  assert.ok(!fields.some(f => f.key === 'ownerName'))
})

test('separate name labels combine only when unambiguous; manual fields need provenance', () => {
  assert.equal(extractDocumentFields('Given names: Jane\nSurname: Example', 'passport').find(f => f.key === 'fullName')?.value, 'Jane Example')
  assert.ok(!extractDocumentFields('Given names: Jane\nSurname: Example\nSurname: Other', 'passport').some(f => f.key === 'fullName'))
  assert.throws(() => reviewedDocumentFields([{ key: 'fullName', label: 'Full name', value: 'Jane Example', source: '', selected: true, manual: true }]), /source excerpt/)
  const ids = extractDocumentFields('Emirates ID\nID number: 784 2001 1234567 1')
  assert.equal(ids.filter(f => f.key === 'emiratesId').length, 1)
})
test('reviewed identity transfer requires a role and never puts passport numbers into EID fields', () => {
  const fields = extractDocumentFields('Name: Jane Example\nEmirates ID: 784-2001-1234567-1\nPassport number: EX123', 'emirates-id')
  fields.forEach(f => f.selected = true)
  assert.throws(() => fieldsForEjari(fields, ''), /Choose whether/)
  assert.deepEqual(fieldsForEjari(fields, 'tenant'), { tenantName: 'Jane Example', tenantEmiratesId: '784-2001-1234567-1' })
  assert.deepEqual(fieldsForEjari(fields, 'owner'), { ownerName: 'Jane Example' })
  assert.ok(!Object.values(fieldsForEjari(fields, 'lessor')).includes('EX123'))
})
test('identity transfer rejects role conflicts, malformed IDs and unsupported-only details', () => {
  const fields = extractDocumentFields('Full name: Jane\nTenant name: John')
  fields.forEach(f => f.selected = true)
  assert.throws(() => fieldsForEjari(fields, 'tenant'), /Conflicting/)
  const id = extractDocumentFields('Emirates ID: 123')
  id[0].selected = true
  assert.throws(() => reviewedDocumentFields(id), /15 digits/)
  const number = extractDocumentFields('Passport number: EX123')
  number[0].selected = true
  assert.throws(() => fieldsForEjari(number, 'tenant'), /no matching/)
  assert.deepEqual(reviewedDocumentFields(number), { passportNumber: 'EX123' })
})
test('does not consume another label as a missing field value or guess multi-column values', () => {
  assert.deepEqual(extractDocumentFields('Owner name:\nTenant name: Jane\nAnnual rent: 1 | Deposit: 2').map(f => f.key), ['tenantName'])
  assert.deepEqual(extractDocumentFields('Tenant name  Jane  Annual rent  10000'), [])
})
test('keeps conflicts for review, removes exact duplicates and rejects ambiguous transfer', () => {
  const fields = extractDocumentFields('Tenant name: Jane\nTenant name: Jane\nTenant name: John')
  assert.equal(fields.length, 2)
  fields.forEach(f => f.selected = true)
  assert.throws(() => reviewedDocumentFields(fields), /Choose one/)
  fields[1].selected = false
  assert.deepEqual(reviewedDocumentFields(fields), { tenantName: 'Jane' })
})
test('requires review and explicit date/currency normalization before transfer', () => {
  const fields = extractDocumentFields('Start date: 01/02/2026\nAnnual rent: AED 10,000')
  assert.throws(() => reviewedDocumentFields(fields), /Select at least/)
  fields[0].selected = true
  assert.throws(() => reviewedDocumentFields(fields), /YYYY-MM-DD/)
  fields[0].value = '2026-02-01'; fields[1].selected = true
  assert.throws(() => reviewedDocumentFields(fields), /without currency/)
  fields[1].value = '10000'
  assert.deepEqual(reviewedDocumentFields(fields), { contractStartDate: '2026-02-01', annualRentAed: '10000' })
  fields[0].value = '2026-02-31'
  assert.throws(() => reviewedDocumentFields(fields), /valid date/)
  assert.throws(() => extractDocumentFields('x'.repeat(100001)), /shorter/)
})
