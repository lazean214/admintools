import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createWorker } from 'tesseract.js'
import { detectDocumentKind, extractDocumentFields } from '../app/utils/document-fields.ts'

// Generated, plainly marked test images. No personal identity documents are used.
test('local OCR extracts supported passport, Emirates ID and NOC image fields', async () => {
  const engine = await createWorker('eng', 1, { langPath: resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'), cacheMethod: 'none', errorHandler: () => {} })
  const cases = [
    ['mixed-passport', 'passport', { passportNumber: 'L898902C3', fullName: 'ANNA MARIA ERIKSSON' }],
    ['mixed-emirates-id', 'emirates-id', { fullName: 'Jane Example', emiratesId: '784-2001-1234567-1' }],
    ['mixed-noc', 'noc', { fullName: 'Jane Example', referenceNumber: 'NOC-TEST-123', propertyNo: '804' }],
  ]
  try {
    for (const [fixture, kind, expected] of cases) {
      const { data } = await engine.recognize(await readFile(new URL(`./fixtures/${fixture}.png`, import.meta.url)))
      assert.equal(detectDocumentKind(data.text), kind, `${fixture}: document type`)
      const fields = extractDocumentFields(data.text)
      for (const [key, value] of Object.entries(expected)) assert.ok(fields.some(field => field.key === key && field.value === value), `${fixture}: ${key}`)
      assert.ok(fields.every(field => !field.selected))
    }
  } finally { await engine.terminate() }
})
