import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {createWorker} from 'tesseract.js'
import {PDFDocument} from 'pdf-lib'
import init,{PdfEditorDocument} from '../app/wasm/ejari/admintools_ejari.js'
import {mapOcrLines,rebuildOcrPage} from '../app/utils/pdf-ocr.ts'
import {PdfOcrClient} from '../app/utils/pdf-ocr-client.ts'
import {encodeEditorText,editorColor} from '../app/utils/pdf-editor.ts'

test('English scan becomes real editable PDF text without retaining the scan',async()=>{
  const image=await readFile(new URL('./fixtures/ocr-scan.png',import.meta.url))
  const engine=await createWorker('eng',1,{langPath:resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'),cacheMethod:'none',errorHandler:()=>{}})
  let data
  try {({data}=await engine.recognize(image,{}, {blocks:true,text:true}))} finally {await engine.terminate()}
  assert.match(data.text,/LEASE AGREEMENT/)
  assert.match(data.text,/Alex Morgan/)
  let index=0
  const lines=mapOcrLines(data.blocks.flatMap(b=>b.paragraphs.flatMap(p=>p.lines)),{width:1200,height:1600},(x,y)=>[x/2,800-y/2],()=>String(index++))
  const model={pages:[{source:0,rotation:0,width:600,height:800},{source:1,rotation:0,width:600,height:800}],layers:[],images:[],texts:[]}
  const candidate=rebuildOcrPage(model,0,lines)
  assert.equal(model.rebuilt,undefined)
  const tenant=candidate.layers.find(line=>line.text.includes('Alex Morgan'))
  tenant.text='Tenant: Sam Taylor'
  const original=await PDFDocument.create(),png=await original.embedPng(image)
  original.addPage([600,800]).drawImage(png,{x:0,y:0,width:600,height:800})
  original.addPage([600,800]).drawImage(png,{x:0,y:0,width:600,height:800})
  const source=await original.save({useObjectStreams:false})
  await init({module_or_path:await readFile(new URL('../app/wasm/ejari/admintools_ejari_bg.wasm',import.meta.url))})
  const doc=new PdfEditorDocument(source)
  assert.equal(JSON.parse(doc.inspect(0)).texts.length,0)
  assert.equal(JSON.parse(doc.inspect(0)).images.length,1)
  doc.clear_page(0)
  for(const line of candidate.layers)doc.add_text(0,encodeEditorText(line.text),line.x,line.y,line.size,false,editorColor(line.color))
  assert.equal(JSON.parse(doc.inspect(1)).images.length,1)
  const output=doc.finish(new Uint32Array([0,1]),new Uint32Array([0,0]))
  const text=JSON.parse(doc.inspect(0)).texts.map(line=>line.text).join('\n')
  assert.match(text,/Tenant: Sam Taylor/);assert.doesNotMatch(text,/Alex Morgan/)
  assert.equal(JSON.parse(doc.inspect(0)).images.length,0)
  const reopened=new PdfEditorDocument(output)
  assert.equal(JSON.parse(reopened.inspect(1)).images.length,1,'the other page retains its shared scan image')
  const run=JSON.parse(reopened.inspect(0)).texts.find(line=>line.text.includes('Sam Taylor'))
  reopened.replace_text(0,run.id,run.text,'Tenant: Lee Taylor')
  assert.match(JSON.parse(reopened.inspect(0)).texts.map(line=>line.text).join('\n'),/Lee Taylor/)
  await mkdir('.cache/pdf-editor-proof',{recursive:true})
  await writeFile('.cache/pdf-editor-proof/ocr-editable.pdf',output)
  await writeFile('.cache/pdf-editor-proof/ocr-scan.pdf',source)
  reopened.free();doc.free()
})

test('OCR maps crop offsets, flags unsupported characters and validates conversion',()=>{
  const line={text:'Example text',confidence:65,bbox:{x0:40,y0:60,x1:240,y1:90}}
  const [mapped]=mapOcrLines([line],{width:1000,height:1600},(x,y)=>[10+x/2,820-y/2],()=> 'line')
  assert.equal(mapped.x,30);assert.equal(mapped.width,100);assert.equal(mapped.confidence,65)
  const [unsupported]=mapOcrLines([{...line,text:'Arabic: \u0627'}],{width:1000,height:1600},(x,y)=>[x/2,800-y/2],()=> 'arabic')
  assert.equal(unsupported.include,false)
  const model={pages:[{source:0,rotation:0,width:500,height:800}],layers:[],texts:[],images:[]}
  assert.throws(()=>rebuildOcrPage(model,0,[]),/at least one/)
  assert.throws(()=>rebuildOcrPage(model,1,[mapped]),/no longer/)
  assert.throws(()=>mapOcrLines([{...line,bbox:{...line.bbox,x0:NaN}}],{width:1000,height:1600},()=>[0,0],()=> 'bad'),/invalid/)
  assert.throws(()=>mapOcrLines(Array(401).fill(line),{width:1000,height:1600},()=>[0,0],()=> 'big'),/400/)
  unsupported.include=true;assert.throws(()=>rebuildOcrPage(model,0,[unsupported]),/supports Latin/)
})

function fakeWorker(){return {onmessage:null,onerror:null,packets:[],terminated:false,postMessage(packet){this.packets.push(packet)},terminate(){this.terminated=true},reply(status='resolve',data={}){const packet=this.packets.at(-1);this.onmessage({data:{jobId:packet.jobId,status,data}})}}}
test('OCR cancellation settles initialization, ignores stale progress, and permits retry',async()=>{
  const workers=[],progress=[]
  const client=new PdfOcrClient(()=>{const worker=fakeWorker();workers.push(worker);return worker})
  const first=client.recognize(new Uint8Array([1]),'/ocr/v7/',(...args)=>progress.push(args))
  const rejected=assert.rejects(first,/cancelled/)
  client.cancel();await rejected;assert.equal(workers[0].terminated,true)
  workers[0].reply('progress',{status:'old',progress:1});assert.equal(progress.length,0)
  const retry=client.recognize(new Uint8Array([1]),'/ocr/v7/',()=>{})
  for(let i=0;i<4;i++){workers[1].reply();await Promise.resolve()}
  assert.equal(workers[1].packets.at(-1).action,'recognize')
  workers[1].reply('resolve',{text:'recognized',blocks:[]})
  assert.equal((await retry).text,'recognized');assert.equal(workers[1].terminated,true)
})

test('OCR model failures reject and release the worker',async()=>{
  const worker=fakeWorker(),client=new PdfOcrClient(()=>worker)
  const result=client.recognize(new Uint8Array([1]),'/ocr/v7/',()=>{})
  const rejected=assert.rejects(result,/model missing/)
  worker.reply('reject','model missing');await rejected;assert.equal(worker.terminated,true)
})
