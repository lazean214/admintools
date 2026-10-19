import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts, PDFName, PDFString } from 'pdf-lib'
import init, { PdfEditorDocument } from '../app/wasm/ejari/admintools_ejari.js'
import { applyEditorTransaction, countEditorChanges, encodeEditorText, editorColor, validateEditorState, PdfEditorClient, createBlankEditorPdf, createSampleEditorPdf } from '../app/utils/pdf-editor.ts'

await init({module_or_path:await readFile(new URL('../app/wasm/ejari/admintools_ejari_bg.wasm',import.meta.url))})
const fixture=await PDFDocument.create()
const font=await fixture.embedFont(StandardFonts.Helvetica)
fixture.addPage([400,500]).drawText('Original editable text',{x:40,y:420,font,size:18})
fixture.addPage([400,500]).drawText('Second page text',{x:40,y:420,font,size:18})
const source=await fixture.save({useObjectStreams:false})

test('Rust replaces original text operators and keeps replacement selectable without flattening',async()=>{
  const doc=new PdfEditorDocument(source)
  const runs=JSON.parse(doc.inspect(0)).texts
  assert.equal(runs[0].text,'Original editable text')
  doc.replace_text(0,runs[0].id,runs[0].text,'Changed selectable text')
  doc.add_text(0,encodeEditorText('Added café text'),40,370,14,false,editorColor('#0f766e'))
  doc.add_shape(0,40,340,180,18,editorColor('#facc15'),0.3,0,0)
  doc.add_shape(0,40,280,100,40,editorColor('#0f766e'),1,2,2)
  doc.add_link(0,40,250,160,20,'https://example.com')
  doc.add_image(0,new Uint8Array([255,0,0,255,0,0,255,100]),2,1,40,190,80,40)
  const output=doc.finish(new Uint32Array([0,1]),new Uint32Array([0,0]))
  doc.free()
  const reopened=new PdfEditorDocument(output)
  const texts=JSON.parse(reopened.inspect(0)).texts.map(run=>run.text)
  assert.ok(texts.includes('Changed selectable text'))
  assert.ok(texts.includes('Added café text'))
  assert.ok(!texts.includes('Original editable text'))
  assert.equal(JSON.parse(reopened.inspect(1)).texts[0].text,'Second page text')
  const parsed=await PDFDocument.load(output)
  assert.equal(parsed.getPageCount(),2)
  assert.equal(parsed.getPage(0).node.Annots().size(),1)
  const folder=new URL('../.cache/pdf-editor-proof/',import.meta.url)
  await mkdir(folder,{recursive:true});await writeFile(new URL('edited.pdf',folder),output)
  await writeFile(new URL('source.pdf',folder),source)
  reopened.free()
})

test('source text streams shared by pages are cloned before editing',async()=>{
  const shared=await PDFDocument.load(source)
  shared.getPage(1).node.set(PDFName.of('Contents'),shared.getPage(0).node.get(PDFName.of('Contents')))
  shared.getPage(1).node.set(PDFName.of('Resources'),shared.getPage(0).node.get(PDFName.of('Resources')))
  const doc=new PdfEditorDocument(await shared.save({useObjectStreams:false}))
  const row=JSON.parse(doc.inspect(0)).texts[0]
  doc.replace_text(0,row.id,row.text,'Only page one changed')
  const output=doc.finish(new Uint32Array([0,1]),new Uint32Array([0,0]))
  doc.free()
  const reopened=new PdfEditorDocument(output)
  assert.equal(JSON.parse(reopened.inspect(1)).texts[0].text,'Original editable text')
  reopened.free()
})

test('images can be replaced at their existing placement, including transparency',async()=>{
  const doc=new PdfEditorDocument(source)
  doc.add_image(0,new Uint8Array([255,0,0,255]),1,1,40,100,50,50)
  const output=doc.finish(new Uint32Array([0,1]),new Uint32Array([0,0]));doc.free()
  const edit=new PdfEditorDocument(output)
  const image=JSON.parse(edit.inspect(0)).images[0]
  edit.replace_image(0,image.name,new Uint8Array([0,0,255,100,0,255,0,255]),2,1)
  const result=edit.finish(new Uint32Array([0,1]),new Uint32Array([0,0]));edit.free()
  const parsed=await PDFDocument.load(result)
  const xobject=parsed.getPage(0).node.Resources().lookup(PDFName.of('XObject')).lookup(PDFName.of(image.name))
  assert.equal(xobject.dict.get(PDFName.of('Width')).asNumber(),2)
  assert.ok(xobject.dict.has(PDFName.of('SMask')))
})

test('page ordering, deletion and rotation preserve original vector text',()=>{
  const doc=new PdfEditorDocument(source)
  const output=doc.finish(new Uint32Array([1]),new Uint32Array([90]));doc.free()
  const reopened=new PdfEditorDocument(output)
  assert.equal(JSON.parse(reopened.inspect(0)).texts[0].text,'Second page text')
  reopened.free()
})

test('unsupported replacement characters and invalid edits reject without corrupting source text',()=>{
  const doc=new PdfEditorDocument(source)
  const run=JSON.parse(doc.inspect(0)).texts[0]
  assert.throws(()=>doc.replace_text(0,run.id,run.text,'中文'),/font lacks/)
  assert.throws(()=>doc.replace_text(0,run.id,'stale','Changed'),/Text changed/)
  assert.throws(()=>doc.add_link(0,0,0,20,20,'javascript:alert(1)'),/http/)
  assert.throws(()=>doc.add_image(0,new Uint8Array(),1,1,0,0,20,20),/12 megapixels/)
  assert.throws(()=>doc.finish(new Uint32Array(),new Uint32Array()),/at least one/)
  assert.throws(()=>doc.finish(new Uint32Array([0,0]),new Uint32Array([0,0])),/Invalid page/)
  assert.equal(JSON.parse(doc.inspect(0)).texts[0].text,run.text)
  doc.free()
  assert.throws(()=>new PdfEditorDocument(new Uint8Array()),/32 MB/)
})

test('editor rejects signed PDF fields and unsafe added text or layer values',async()=>{
  const signed=await PDFDocument.load(source)
  const sig=signed.context.obj({FT:'Sig',T:PDFString.of('Signature')})
  signed.context.register(sig)
  const bytes=await signed.save({useObjectStreams:false})
  assert.throws(()=>new PdfEditorDocument(bytes),/Signed PDFs/)
  assert.throws(()=>encodeEditorText('中文'),/Latin/)
  assert.throws(()=>editorColor('red'),/valid color/)
  assert.throws(()=>validateEditorState({pages:[],layers:[],texts:[],images:[]}),/Keep/)
})

test('worker client transfers inputs and cancellation rejects pending work before retry',async()=>{
  const workers=[]
  const client=new PdfEditorClient(()=>{
    const worker={postMessage(message,transfer){this.message=message;this.transfer=transfer},terminate(){this.stopped=true}}
    workers.push(worker);return worker
  })
  const input=()=>({operation:'inspect',source:source.slice().buffer,page:0,state:{pages:[{source:0,rotation:0,width:400,height:500}],layers:[],texts:[],images:[]},assets:[]})
  const first=client.request(input())
  assert.equal(workers[0].transfer.length,1)
  client.cancel()
  await assert.rejects(first,/cancelled/)
  assert.equal(workers[0].stopped,true)
  const second=client.request(input())
  workers[1].onmessage({data:{id:workers[1].message.id,type:'inspection',value:{texts:[],images:[]}}})
  assert.equal((await second).type,'inspection')
  client.cancel()
})

test('blank and sample starter PDFs open in independent parsers and expose editable sample text and images',async()=>{
  assert.equal((await PDFDocument.load(createBlankEditorPdf())).getPageCount(),1)
  const sample=createSampleEditorPdf()
  assert.equal((await PDFDocument.load(sample)).getPageCount(),2)
  const doc=new PdfEditorDocument(new Uint8Array(sample))
  const info=JSON.parse(doc.inspect(0))
  assert.ok(info.texts.some(run=>run.text==='Click this text to edit it'))
  assert.equal(info.images[0].name,'Im1')
  doc.free()
})


test('preview transactions preserve model and history on failure or cancellation',async()=>{
  let session=1,model='original',history=['previous'],disposed=0
  const commit=value=>{history.push(model);model=value}
  await assert.rejects(applyEditorTransaction(async()=>{throw new Error('preview failed')},()=>true,commit,()=>{disposed++}))
  assert.equal(model,'original');assert.deepEqual(history,['previous'])
  const pending=applyEditorTransaction(async()=>{session=2;return 'stale'},()=>session===1,commit,()=>{disposed++})
  assert.equal(await pending,false);assert.equal(disposed,1)
  assert.equal(model,'original');assert.deepEqual(history,['previous'])
  assert.equal(await applyEditorTransaction(async()=>'updated',()=>session===2,commit,()=>{}),true)
  assert.equal(model,'updated');assert.deepEqual(history,['previous','original'])
})

test('page-only changes count rotation, ordering and deletion',()=>{
  const pages=[{source:0,rotation:0,width:400,height:500},{source:1,rotation:0,width:400,height:500}]
  const state={pages:structuredClone(pages),texts:[],images:[],layers:[]}
  assert.equal(countEditorChanges(state,pages),0)
  state.pages[0].rotation=90;assert.equal(countEditorChanges(state,pages),1)
  state.pages=structuredClone(pages).reverse();assert.equal(countEditorChanges(state,pages),2)
  state.pages=[structuredClone(pages[0])];assert.equal(countEditorChanges(state,pages),1)
})
