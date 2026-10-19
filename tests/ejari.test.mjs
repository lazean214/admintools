import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import init, { ejari_probe, ejari_roundtrip, fill_ejari, create_ejari_raster } from '../app/wasm/ejari/admintools_ejari.js'
import { inflateSync } from 'node:zlib'
import { ejariFields, encodeEjariFields, fitEjariText, ejariLayout } from '../app/utils/ejari.ts'
import { ProcessingClient, ProcessingCancelledError } from '../app/utils/processing-client.ts'
import { decodeEjariTemplate, loadEjariTemplate } from '../app/utils/ejari-template.ts'

await init({ module_or_path: await readFile(new URL('../app/wasm/ejari/admintools_ejari_bg.wasm', import.meta.url)) })
const template = new Uint8Array(await readFile(new URL('../public/ejari-template.pdf', import.meta.url)))

test('download-manager-safe JSON transport decodes the exact pinned template', async () => {
  const payload = JSON.parse(await readFile(new URL('../public/ejari-template-data.json',import.meta.url),'utf8'))
  assert.deepEqual(new Uint8Array(decodeEjariTemplate(payload)),template)
  const previousFetch = globalThis.fetch
  const controller = new AbortController()
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url,'/ejari-template-data.json')
      assert.equal(options.signal,controller.signal)
      return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}})
    }
    assert.deepEqual(new Uint8Array(await loadEjariTemplate(controller.signal)),template)
    globalThis.fetch = async () => new Response('',{status:404})
    await assert.rejects(loadEjariTemplate(controller.signal),/Could not load/)
  } finally { globalThis.fetch = previousFetch }
  for (const input of [null,{}, {encoding:'base64',data:'%%%bad'}, {encoding:'base64',data:'a'.repeat(2_666_669)}, {encoding:'base64',data:btoa('not a PDF') }]) {
    assert.throws(()=>decodeEjariTemplate(input),/Invalid EJARI/)
  }
})

test('Rust WASM reads the pinned three-page EJARI template', () => {
  assert.equal(ejari_probe(template), 3)
})

test('Rust roundtrip preserves page geometry, content streams and resource identities', async () => {
  const output = ejari_roundtrip(template)
  const before = await PDFDocument.load(template)
  const after = await PDFDocument.load(output)
  assert.equal(after.getPageCount(), 3)
  for (let i = 0; i < 3; i++) {
    const original = before.getPage(i)
    const actual = after.getPage(i)
    assert.deepEqual(actual.getSize(), { width: 612, height: 792 })
    assert.equal(actual.getRotation().angle, original.getRotation().angle)
    for (const name of ['Contents', 'Resources']) {
      assert.equal(actual.node.get(PDFName.of(name)).toString(), original.node.get(PDFName.of(name)).toString())
    }
  }
  // Compare every existing object's serialized representation; writer metadata
  // may change, while template streams/fonts/images must survive untouched.
  for (const [ref, original] of before.context.enumerateIndirectObjects()) {
    const actual = after.context.lookup(ref)
    assert.ok(actual, `missing object ${ref}`)
    if (typeof original.getContents === 'function') {
      assert.deepEqual(actual.getContents(), original.getContents(), `stream ${ref}`)
    }
  }
  await mkdir(new URL('../.cache/ejari-proof/', import.meta.url), { recursive: true })
  await writeFile(new URL('../.cache/ejari-proof/roundtrip.pdf', import.meta.url), output)
})

test('unknown, modified and oversized templates are rejected before parsing', () => {
  const modified = template.slice()
  modified[modified.length - 1] ^= 1
  for (const bytes of [new Uint8Array(), new Uint8Array([37,80,68,70]), modified]) {
    assert.throws(() => ejari_roundtrip(bytes), /template has changed/)
  }
  assert.throws(() => ejari_probe(new Uint8Array(2_000_001)), /size limit/)
  assert.equal(ejari_probe(template), 3, 'rejection must not poison later requests')
})

test('text fitting preserves established Helvetica metrics, kerning and WinAnsi encoding', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const value of ['AVATAR WAVE', 'Crème Brûlée € – café', 'Owner '.repeat(60)]) {
    for (const width of [10,40,58,170]) {
      let expected = value.trim()
      while (expected.length && font.widthOfTextAtSize(expected,8) > width*72/25.4) expected = expected.slice(0,-1)
      const actual = fitEjariText(value,width,'Owner')
      assert.equal(actual.text,expected)
      assert.equal(Buffer.from(actual.bytes).toString('hex').toUpperCase(),font.encodeText(expected).asString())
    }
  }
  assert.throws(() => fitEjariText('اسم',58,'Owner'), /Latin\/WinAnsi/)
  assert.throws(() => fitEjariText('a'.repeat(1025),58,'Owner'), /1024/)
})

test('filled Rust PDFs match the established overlay layout for every property usage', async () => {
  const values = Object.fromEntries(ejariLayout.map(([key]) => [key, key]))
  Object.assign(values, { ownerName:'Crème Brûlée € – AVATAR', lessorName:'A long lessor name '.repeat(20),
    propertyAreaSqm:123.45, contractStartDate:'2026-10-19', contractEndDate:'2027-10-18',
    contractValueAed:'123456.78', annualRentAed:'125000', securityDepositAed:'5000' })
  for (let i=1;i<=5;i++) values[`additionalTerm${i}`] = `Term ${i}: example conditions AVATAR café`
  for (const usage of ['Residential','Commercial','Industrial']) {
    const fields = ejariFields({ ...values,propertyUsage:usage })
    assert.equal(fields.length,32)
    assert.equal(fields.filter(f => f.page===2).length,5)
    assert.equal(fields.filter(f => f.style===1).length,1)
    const payload = encodeEjariFields(fields)
    const result = fill_ejari(template,new Uint8Array(payload.text),new Uint32Array(payload.offsets),new Float64Array(payload.placements))
    const reference = await PDFDocument.load(template)
    const regular = await reference.embedFont(StandardFonts.Helvetica)
    const bold = await reference.embedFont(StandardFonts.HelveticaBold)
    for (const field of fields) reference.getPage(field.page).drawText(field.text, {
      x:(field.x+20)*72/25.4, y:792-(field.top+35)*72/25.4, size:field.style?10:8, font:field.style?bold:regular
    })
    const actual = await PDFDocument.load(result)
    assert.equal(actual.getPageCount(),3)
    // A parseable three-page PDF can still be the untouched source template.
    // Require every captured field in its target page's actual content streams.
    for (const field of fields) {
      const streams = actual.getPage(field.page).node.Contents().asArray()
        .map(ref => actual.context.lookup(ref))
      const expected = Buffer.from(field.bytes).toString('hex').toUpperCase()
      assert.ok(streams.some(stream => Buffer.from(stream.getContents()).toString('latin1').includes(`<${expected}> Tj`)), `missing field ${field.text}`)
    }
    const folder = new URL('../.cache/ejari-proof/',import.meta.url)
    await mkdir(folder,{ recursive:true })
    await writeFile(new URL(`${usage}-rust.pdf`,folder),result)
    await writeFile(new URL(`${usage}-reference.pdf`,folder),await reference.save({ useObjectStreams:false }))
  }
})

test('Rust rejects malformed overlays, bad ranges, invalid text and nonfinite coordinates', () => {
  for (const args of [
    [[],[],[]], [[65],[1,1],[0,0,14,27]], [[65],[0,2],[0,0,14,27]],
    [[65],[0,1],[1,0,14,27]], [[65],[0,1],[0,2,14,27]], [[65],[0,1],[0,0,NaN,27]],
    [[10],[0,1],[0,0,14,27]], [[65],[0,1],[0,0,181,27]], [[65],[0,1],[0,0,14]]
  ]) assert.throws(() => fill_ejari(template,new Uint8Array(args[0]),new Uint32Array(args[1]),new Float64Array(args[2])),/Invalid EJARI/)
})

test('EJARI worker transport transfers all inputs, cancels and retries with a fresh worker', async () => {
  const workers = []
  const client = new ProcessingClient(() => {
    const worker = { postMessage(message,transfer) { this.message=message;this.transfer=transfer }, terminate() { this.stopped=true } }
    workers.push(worker)
    return worker
  })
  const input = () => ({ template:template.slice().buffer,...encodeEjariFields(ejariFields({ownerName:'Example'})) })
  const first = client.ejariPdf(input())
  assert.equal(workers[0].transfer.length,4)
  assert.equal(workers[0].message.operation,'ejari-pdf')
  client.cancel()
  await assert.rejects(first,ProcessingCancelledError)
  assert.equal(workers[0].stopped,true)
  const second = client.ejariPdf(input())
  const blob = new Blob(['%PDF-1.4'],{type:'application/pdf'})
  workers[1].onmessage({data:{ id:workers[1].message.id,type:'file',blob }})
  assert.equal(await second,blob)
})

test('compatibility export contains all three lossless page images with correct order, dimensions and white flattening', async () => {
  const pageBytes = 1224*1584*4
  const rgba = new Uint8Array(pageBytes*3)
  for (let page=0;page<3;page++) {
    for (let offset=page*pageBytes;offset<(page+1)*pageBytes;offset+=4) rgba.set([30+page*70,60,90,255],offset)
  }
  rgba.set([0,0,0,0],0)
  const result = create_ejari_raster(rgba)
  const pdf = await PDFDocument.load(result)
  assert.equal(pdf.getPageCount(),3)
  for (const [index,page] of pdf.getPages().entries()) {
    assert.deepEqual(page.getSize(),{width:612,height:792})
    const image = page.node.Resources().lookup(PDFName.of('XObject')).lookup(PDFName.of('PageImage'))
    assert.equal(image.dict.get(PDFName.of('Width')).asNumber(),1224)
    assert.equal(image.dict.get(PDFName.of('Height')).asNumber(),1584)
    const rgb = image.dict.get(PDFName.of('Filter')) ? inflateSync(image.getContents()) : image.getContents()
    assert.equal(rgb.length,1224*1584*3)
    assert.deepEqual(Array.from(rgb.slice(0,3)),index ? [30+index*70,60,90] : [255,255,255])
    assert.deepEqual(Array.from(rgb.slice(-3)),[30+index*70,60,90])
  }
  assert.throws(()=>create_ejari_raster(new Uint8Array()),/three rendered/)
  assert.throws(()=>create_ejari_raster(rgba.subarray(0,pageBytes)),/three rendered/)
})
