import test from 'node:test'
import assert from 'node:assert/strict'
import { extractDocumentFields, detectDocumentKind, fieldsForEjari } from '../app/utils/document-fields.ts'
import { pdfDocumentText } from '../app/utils/document-text.ts'
import { parseDocumentMrz, mrzCheckDigit } from '../app/utils/document-mrz.ts'
import { cleanDocumentResults, documentResultGroups } from '../app/utils/document-results.ts'

test('ID cleanup preserves conflicting readings and ambiguous dates', () => {
  const field = (key, value) => ({ key, label: key, value, source: value, selected: false })
  const results = cleanDocumentResults([field('fullName', 'JANE EXAMPLE'), field('fullName', 'Jane   Example'), field('birthDate', '23/04/1990'), field('identityExpiryDate', '02/03/2030'), field('cardNumber', '123456789'), field('cardNumber', '987654321')], 'emirates-id')
  assert.equal(results.filter(f => f.key === 'fullName').length, 1)
  assert.match(results[0].source, /Jane   Example/)
  assert.equal(results.find(f => f.key === 'birthDate').value, '1990-04-23')
  assert.equal(results.find(f => f.key === 'identityExpiryDate').value, '02/03/2030')
  assert.match(results.find(f => f.key === 'identityExpiryDate').warning, /Confirm the full date/)
  assert.equal(results.filter(f => f.key === 'cardNumber').length, 2)
  assert.ok(results.every(f => !f.selected))
})

test('title deed groups retain owners, unit-specific areas and manual fields', () => {
  const fields = ['ownerName', 'ownerName', 'ownerRegistrationNumber', 'totalAreaSqm', 'totalAreaSqft', 'titleDeedNumber', 'email'].map((key, i) => ({ key, label: key, value: String(i), source: String(i), selected: false, manual: key === 'email' }))
  const groups = documentResultGroups(fields, 'title-deed')
  assert.equal(groups.find(g => g.title === 'Ownership').fields.length, 3)
  assert.equal(groups.find(g => g.title === 'Areas').fields.length, 2)
  assert.equal(groups.flatMap(g => g.fields).length, fields.length)
  assert.equal(groups.find(g => g.title === 'Other details').fields[0], fields.at(-1))
})

// Synthetic text follows the label structures of user-provided blank templates.
// No source PDFs, personal names, identifiers or contact details are committed.
test('blank bilingual tenancy labels, separator lines and default amounts stay empty', () => {
  const text = `TENANCY CONTRACT
Owner / Lessor Information
Owner’s Name
اسم المالك
Lessor’s Name
اسم المؤجر
Lessor’s Emirates ID
هوية المؤجر
License No. Licensing Authority
Incase of a Company
Lessor's Email
Tenant Information
Tenant’s Name
Tenant’s Emirates ID
License No. Licensing Authority
Building Name\tProperty No.
Property Type\tProperty Area (s.m) (  . )
Location\tPremises No. (DEWA) ( )
Contract Information
Contract Value\t0.00/- AED
Annual Rent\t0.00/- AED\tSecurity Deposit Amount\t0.00/- AED
Signatures`
  assert.equal(detectDocumentKind(text), 'property')
  assert.deepEqual(extractDocumentFields(text), [])
})
test('blank listing/NOC choices and split passport/ID labels are not entered values', () => {
  const text = `LISTING AGREEMENT RENT
Date:\tReference No.:
LANDLORD DETAILS
Landlord’s Name
Passport Number/
Emirates ID
Expiry Date: / /
PROPERTY DETAILS
Building Name\tUnit
Street Name\tCommunity
BUA (SqFt)\tPlot (SqFt)
Bedrooms\tBathrooms\tParking
Rental Amount
TERMS AND CONDITIONS
Landlord’s Name\tSignature`
  assert.equal(detectDocumentKind(text), 'noc')
  assert.deepEqual(extractDocumentFields(text), [])
})
test('filled bilingual columns preserve values, possessive labels, units and raw source', () => {
  const text = `TENANCY CONTRACT
Owner’s Name\tJane Example\tاسم المالك
Tenant’s Name\tSam Sample\tاسم المستأجر
Building Name\tExample Tower\tProperty No.\tA101
Annual Rent\t80000\tSecurity Deposit Amount\t4000
Bedrooms: 0
BUA (SqFt): 900`
  const fields = extractDocumentFields(text)
  assert.equal(fields.find(f => f.key === 'ownerName').value, 'Jane Example')
  assert.match(fields.find(f => f.key === 'ownerName').source, /Owner’s Name/)
  assert.equal(fields.find(f => f.key === 'propertyNo').value, 'A101')
  assert.equal(fields.find(f => f.key === 'annualRentAed').value, '80000')
  assert.equal(fields.find(f => f.key === 'securityDepositAed').value, '4000')
  assert.equal(fields.find(f => f.key === 'bedrooms').value, '0')
  assert.equal(fields.find(f => f.key === 'propertyBuaSqft').value, '900')
})
test('title-deed owner rows remain separate and exclude static signature/footer text', () => {
  const fields = extractDocumentFields(`Title Deed
Property Type: Flat : نوع العقار
Community: Example Community : المنطقة
Building Name: Example Tower : اسم المبنى
Area Sq Meter: 100.25 : المساحة
Owners numbers and their shares:
(1111111) JANE EXAMPLE 50.25
(2222222) SAM SAMPLE 50.00
Approved Signature
DUBAI LAND DEPARTMENT`)
  assert.equal(detectDocumentKind('Title Deed\nPurchased from Example Properties'), 'title-deed')
  assert.deepEqual(fields.filter(f => f.key === 'ownerName').map(f => f.value), ['JANE EXAMPLE', 'SAM SAMPLE'])
  assert.equal(fields.find(f => f.key === 'totalAreaSqm').value, '100.25')
  fields.filter(f => f.key === 'ownerName').forEach(f => f.selected = true)
  assert.throws(() => fieldsForEjari(fields, ''), /Choose one/)
})
test('PDF text rows retain columns, while clear OCR labels tolerate surrounding noise', () => {
  const item = (str, x, y) => ({ str, transform: [1,0,0,1,x,y], width: 20 })
  assert.equal(pdfDocumentText([item('A101',200,700),item('Property No.',10,700),item('Footer',10,20)]), 'Property No.\tA101\nFooter')
  const fields = extractDocumentFields('EMIRATES ID\n-- Name: Jane Example\nBa - Nationality: EXAMPLE\nDate of Birth: 01/02/1990 noise\nID Number /\n784-2001-1234567-1 I')
  assert.equal(fields.find(f => f.key === 'fullName').value, 'Jane Example')
  assert.equal(fields.find(f => f.key === 'birthDate').value, '01/02/1990')
  assert.equal(fields.filter(f => f.key === 'emiratesId').length, 1)
  assert.ok(!fields.some(f => f.key === 'cardNumber'))
  assert.deepEqual(extractDocumentFields('This\tproperty\tis\tsubject\tto\tthe\tcommunity\tregulations'), [])
  assert.deepEqual(extractDocumentFields('Contract Value\nFrom\tTo\nSignatures'), [])
})
test('an intact UAE card first line can recover only protected identifiers, not guessed dates/names', () => {
  const number = '123456789', id = '784200112345671'
  const first = `ILARE${number}${mrzCheckDigit(number)}${id}`
  const values = parseDocumentMrz(first + '\nunreadable lines')
  assert.equal(values.find(f => f.key === 'emiratesId').value, id)
  assert.equal(values.find(f => f.key === 'cardNumber').value, number)
  assert.ok(values.every(f => /Only part/.test(f.warning)))
  assert.ok(!values.some(f => f.key === 'birthDate' || f.key === 'fullName'))
})
