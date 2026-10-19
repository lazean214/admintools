import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type { PageViewport } from 'pdfjs-dist/types/src/display/page_viewport'
import { applyEditorTransaction, cloneEditorState, countEditorChanges, createBlankEditorPdf, createSampleEditorPdf, layerBounds, PdfEditorClient, validateEditorState } from '../utils/pdf-editor'
import type { EditorAsset, EditorInspection, EditorLayer, EditorPage, EditorState } from '../utils/pdf-editor'
import { mapOcrLines, rebuildOcrPage } from '../utils/pdf-ocr'
import type { OcrReviewLine } from '../utils/pdf-ocr'
import { PdfOcrClient } from '../utils/pdf-ocr-client'

export function usePdfEditor() {
  const canvas=ref<HTMLCanvasElement|null>(null),overlay=ref<HTMLCanvasElement|null>(null)
  const status=ref('Choose a PDF to begin. Your document stays in this browser.')
  const busy=ref(false),rendering=ref(false),filename=ref(''),tool=ref('select'),zoom=ref(1)
  const state=ref<EditorState>({pages:[],layers:[],texts:[],images:[]})
  const current=ref(0),selected=ref<string|null>(null),selectedRun=ref<number|null>(null)
  const inspection=ref<EditorInspection>({texts:[],images:[]})
  const search=ref(''),replacement=ref(''),draft=ref<EditorLayer|null>(null)
  const result=ref<{url:string;name:string}|null>(null)
  const ocrReview=ref<{page:number;revision:string;lines:OcrReviewLine[]}|null>(null)
  const ocrProgress=ref(0)
  const textTargets=ref<{id:number;left:number;top:number;width:number;height:number;angle:number;label:string}[]>([])
  const size=ref({width:0,height:0})
  const originalPages=shallowRef<EditorPage[]>([])
  const undo=ref<EditorState[]>([]),redo=ref<EditorState[]>([])
  const pdf=shallowRef<PDFDocumentProxy|null>(null)
  const assets=new Map<string,EditorAsset & {canvas:HTMLCanvasElement}>()
  const client=new PdfEditorClient(()=>new Worker(new URL('../workers/pdf-editor.worker.ts',import.meta.url),{type:'module'}))
  let source:ArrayBuffer|null=null,loadingTask:PDFDocumentLoadingTask|null=null,renderTask:RenderTask|null=null
  let viewport:PageViewport|null=null,documentGeneration=0,viewGeneration=0,actionGeneration=0,disposed=false
  let drag:{start:number[];original:EditorLayer;resize:boolean;create:boolean}|null=null
  let ocrRenderTask:RenderTask|null=null
  const ocrClient=new PdfOcrClient()
  const page=computed(()=>state.value.pages[current.value])
  const pageLayers=computed(()=>state.value.layers.filter(layer=>layer.page===page.value?.source))
  const activeLayer=computed(()=>state.value.layers.find(layer=>layer.id===selected.value)??null)
  const activeRun=computed(()=>inspection.value.texts.find(run=>run.id===selectedRun.value)??null)
  const filteredRuns=computed(()=>inspection.value.texts.filter(run=>run.text.toLowerCase().includes(search.value.toLowerCase())))
  const editCount=computed(()=>countEditorChanges(state.value,originalPages.value))
  const hasDocument=computed(()=>state.value.pages.length>0)
  const message=(error:unknown)=>error instanceof Error?error.message:String(error)
  const id=()=>crypto.randomUUID()
  function invalidateResult() {if(result.value){URL.revokeObjectURL(result.value.url);result.value=null}}
  function active(session:number,action:number){return !disposed && session===documentGeneration && action===actionGeneration}
  function checkpoint(invalidate=true) {
    if(invalidate)invalidateResult()
    const snapshot=cloneEditorState(state.value)
    if (JSON.stringify(undo.value.at(-1))!==JSON.stringify(snapshot)) undo.value.push(snapshot)
    if (undo.value.length>40) undo.value.shift()
    redo.value=[]
  }
  function clearSelection() {selected.value=null;selectedRun.value=null;draft.value=null}
  function selectLayer(layer:EditorLayer) {selected.value=layer.id;selectedRun.value=null;draft.value=structuredClone(JSON.parse(JSON.stringify(layer)))}
  function runValue(run:{id:number;text:string}) {return state.value.texts.find(edit=>edit.page===page.value?.source && edit.run===run.id)?.value??run.text}
  function selectRun(index:number) {
    const run=inspection.value.texts.find(run=>run.id===index)
    if (!run) return
    clearSelection();selectedRun.value=index;replacement.value=runValue(run)
    tool.value='text'
  }
  function assetCopies(model:EditorState,includeLayers=true) {
    const used=new Set([...model.images.map(edit=>edit.asset),...(includeLayers?model.layers.map(layer=>layer.asset).filter((key):key is string=>!!key):[])])
    return [...used].map(key=>{const asset=assets.get(key);if(!asset)throw new Error('An image asset is missing.');return {id:key,rgba:asset.rgba.slice(0),width:asset.width,height:asset.height}})
  }
  async function worker(operation:'inspect'|'preview'|'export',pageIndex?:number,candidate:EditorState=state.value) {
    if (!source) throw new Error('Open a PDF first.')
    const model=cloneEditorState(candidate)
    if(operation==='preview') model.pages=originalPages.value.map(page=>({...page}))
    return client.request({operation,source:source.slice(0),page:pageIndex,state:model,assets:operation==='inspect'?[]:assetCopies(candidate,operation==='export')})
  }
  async function loadPdf(bytes:ArrayBuffer,isCurrent=()=>!disposed) {
    const pdfjs=await import('pdfjs-dist')
    if(!isCurrent())throw new Error('PDF processing cancelled.')
    pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl
    const task=pdfjs.getDocument({data:bytes})
    loadingTask=task
    try {return await task.promise}
    catch(error){await task.destroy();throw error}
    finally {if(loadingTask===task)loadingTask=null}
  }
  async function openBytes(bytes:ArrayBuffer,name:string) {
    if (busy.value) return
    const generation=++documentGeneration
    actionGeneration++;viewGeneration++
    let candidate:PDFDocumentProxy|null=null
    busy.value=true;status.value='Opening PDF…';client.cancel();renderTask?.cancel()
    try {
      if(bytes.byteLength>32*1024*1024)throw new Error('Choose a PDF no larger than 32 MB.')
      const doc=await loadPdf(bytes.slice(0),()=>!disposed && generation===documentGeneration);candidate=doc
      if(disposed || generation!==documentGeneration){await doc.loadingTask.destroy();return}
      if(doc.numPages>100) {await doc.loadingTask.destroy();throw new Error('Choose a PDF with at most 100 pages.')}
      const pages:EditorPage[]=[]
      for(let index=0;index<doc.numPages;index++) {
        const p=await doc.getPage(index+1)
        pages.push({source:index,rotation:((p.rotate%360)+360)%360,width:p.view[2]!-p.view[0]!,height:p.view[3]!-p.view[1]!})
      }
      // Validate the Rust editing engine before replacing an open document.
      const validation=await client.request({operation:'inspect',source:bytes.slice(0),page:0,state:{pages,layers:[],texts:[],images:[]},assets:[]})
      if(disposed || generation!==documentGeneration){await doc.loadingTask.destroy();return}
      const previous=pdf.value;pdf.value=doc;candidate=null;source=bytes
      void previous?.loadingTask.destroy().catch(()=>{})
      for(const asset of assets.values())asset.canvas.width=asset.canvas.height=0
      assets.clear()
      state.value={pages,layers:[],texts:[],images:[]};originalPages.value=pages.map(page=>({...page}))
      ocrReview.value=null
      filename.value=name;current.value=0;zoom.value=1;undo.value=[];redo.value=[];clearSelection()
      if(result.value)URL.revokeObjectURL(result.value.url);result.value=null
      if(validation.type==='inspection')inspection.value=validation.value
      status.value='PDF ready. Select Text to edit existing text or add your own.'
      await nextTick()
      const scroll=canvas.value?.parentElement?.parentElement
      const padding=scroll?getComputedStyle(scroll):null
      const available=(scroll?.clientWidth??800)-(padding?parseFloat(padding.paddingLeft)+parseFloat(padding.paddingRight):48)
      const first=pages[0]!,visibleWidth=first.rotation%180?first.height:first.width
      zoom.value=[1,0.75,0.5,0.25].find(scale=>visibleWidth*scale<=available)??0.25
      await render()
    } catch(error) {await candidate?.loadingTask.destroy();if(!disposed && generation===documentGeneration)status.value=message(error)}
    finally {if(generation===documentGeneration)busy.value=false}
  }
  async function openFile(file:File) {
    if(busy.value)return
    if(file.size>32*1024*1024){status.value='Choose a PDF no larger than 32 MB.';return}
    const generation=++documentGeneration
    busy.value=true;status.value='Reading PDF…'
    try {
      const bytes=await file.arrayBuffer()
      if(disposed || generation!==documentGeneration)return
      busy.value=false;await openBytes(bytes,file.name)
    } catch(error){if(!disposed && generation===documentGeneration)status.value=message(error)}
    finally {if(generation===documentGeneration)busy.value=false}
  }
  async function blank() {await openBytes(createBlankEditorPdf(),'Untitled.pdf')}
  async function sample() {await openBytes(createSampleEditorPdf(),'Sample-document.pdf')}
  async function scannedSample() {
    if(busy.value)return
    const session=++documentGeneration
    busy.value=true;status.value='Preparing an image-only sample PDF...'
    try {
      const {createOcrSample}=await import('../utils/pdf-ocr-sample')
      const bytes=await createOcrSample()
      if(disposed || session!==documentGeneration)return
      busy.value=false;await openBytes(bytes,'Scanned-sample.pdf')
    } catch(error){if(!disposed && session===documentGeneration)status.value=message(error)}
    finally {if(session===documentGeneration)busy.value=false}
  }
  async function render() {
    const doc=pdf.value,p=page.value
    if(!doc || !p || !canvas.value || !overlay.value)return
    const generation=++viewGeneration
    client.cancel('Page view changed.')
    renderTask?.cancel();rendering.value=true
    try {
      const sourcePage=await doc.getPage(p.source+1)
      if(generation!==viewGeneration)return
      const scale=Math.min(zoom.value,Math.sqrt(8_000_000/(p.width*p.height)))
      viewport=sourcePage.getViewport({scale,rotation:p.rotation})
      const target=canvas.value
      target.width=Math.ceil(viewport.width);target.height=Math.ceil(viewport.height)
      overlay.value.width=target.width;overlay.value.height=target.height
      size.value={width:viewport.width,height:viewport.height}
      const context=target.getContext('2d')
      if(!context)throw new Error('Could not display this PDF.')
      renderTask=sourcePage.render({canvas:target,canvasContext:context,viewport})
      await renderTask.promise
      if(generation!==viewGeneration)return
      draw()
      const response=await worker('inspect',p.source)
      if(generation!==viewGeneration)return
      if(response.type==='inspection')inspection.value=response.value
      const text=await sourcePage.getTextContent()
      const pdfjs=await import('pdfjs-dist')
      if(generation!==viewGeneration)return
      const used=new Set<number>()
      textTargets.value=text.items.flatMap(item=>{
        if(!('str' in item) || !item.str.trim())return []
        const row=inspection.value.texts.find(row=>!used.has(row.id) && runValue(row).trim()===item.str.trim())
        if(!row)return []
        used.add(row.id)
        const matrix=pdfjs.Util.transform(viewport!.transform,item.transform)
        const height=Math.max(10,Math.hypot(matrix[2]!,matrix[3]!))
        return [{id:row.id,left:matrix[4]!,top:matrix[5]!-height,width:Math.max(12,item.width*scale),height,angle:Math.atan2(matrix[1]!,matrix[0]!)*180/Math.PI,label:runValue(row)}]
      })
    } catch(error) {if(generation===viewGeneration && !(error instanceof Error && error.name==='RenderingCancelledException'))status.value=message(error)}
    finally {if(generation===viewGeneration)rendering.value=false}
  }
  function draw() {
    const target=overlay.value,vp=viewport
    if(!target || !vp)return
    const context=target.getContext('2d');if(!context)return
    context.clearRect(0,0,target.width,target.height)
    for(const original of pageLayers.value) {
      const layer=original
      context.save();context.setTransform(...vp.transform as [number,number,number,number,number,number])
      context.globalAlpha=layer.opacity;context.fillStyle=layer.color;context.strokeStyle=layer.color;context.lineWidth=layer.stroke
      if(layer.kind==='text') {
        context.translate(layer.x,layer.y);context.scale(1,-1)
        context.font=(layer.bold?'bold ':'')+layer.size+'px Arial, Helvetica, sans-serif'
        layer.text.split('\n').forEach((line,index)=>context.fillText(line,0,index*layer.size*1.25))
      } else if(layer.kind==='image') {
        const image=assets.get(layer.asset??'')?.canvas
        if(image){context.scale(1,-1);context.drawImage(image,layer.x,-layer.y-layer.height,layer.width,layer.height)}
      } else if(layer.kind==='draw') {
        context.lineCap='round';context.lineJoin='round';context.beginPath()
        layer.points?.forEach((value,index,array)=>{if(index%2===0){if(index===0)context.moveTo(value,array[index+1]!);else context.lineTo(value,array[index+1]!)}})
        context.stroke()
      } else if(layer.kind==='line') {context.beginPath();context.moveTo(layer.x,layer.y);context.lineTo(layer.x+layer.width,layer.y+layer.height);context.stroke()}
      else if(layer.kind==='ellipse'){context.beginPath();context.ellipse(layer.x+layer.width/2,layer.y+layer.height/2,Math.abs(layer.width/2),Math.abs(layer.height/2),0,0,Math.PI*2);if(layer.stroke)context.stroke();else context.fill()}
      else if(layer.kind==='link') {context.setLineDash([4,3]);context.strokeStyle='#0f766e';context.lineWidth=1;context.strokeRect(layer.x,layer.y,layer.width,layer.height)}
      else if(layer.stroke)context.strokeRect(layer.x,layer.y,layer.width,layer.height)
      else context.fillRect(layer.x,layer.y,layer.width,layer.height)
      context.restore()
      if(layer.id===selected.value) {
        const bounds=layerBounds(layer)
        context.save();context.setTransform(...vp.transform as [number,number,number,number,number,number])
        context.strokeStyle='#0f766e';context.lineWidth=1/vp.scale;context.setLineDash([4/vp.scale,3/vp.scale])
        context.strokeRect(bounds.x-2,bounds.y-2,bounds.width+4,bounds.height+4)
        context.fillStyle='#0f766e';context.fillRect(bounds.x+bounds.width-3/vp.scale,bounds.y-3/vp.scale,6/vp.scale,6/vp.scale);context.restore()
      }
    }
  }
  function pointer(event:PointerEvent) {
    if(!viewport || !overlay.value)return [0,0]
    const rect=overlay.value.getBoundingClientRect()
    return viewport.convertToPdfPoint((event.clientX-rect.left)*overlay.value.width/rect.width,(event.clientY-rect.top)*overlay.value.height/rect.height)
  }
  function newLayer(kind:EditorLayer['kind'],x:number,y:number):EditorLayer {
    return {id:id(),page:page.value!.source,kind,x,y,width:kind==='text'?160:120,height:kind==='text'?20:60,text:kind==='text'?'Type your text':kind==='link'?'https://example.com':'',size:16,bold:false,color:kind==='highlight'?'#facc15':kind==='whiteout'?'#ffffff':'#0f766e',opacity:kind==='highlight'?0.35:1,stroke:['rect','ellipse','line','draw'].includes(kind)?2:0}
  }
  function onPointerDown(event:PointerEvent) {
    if(busy.value || rendering.value || !page.value)return
    const [x,y]=pointer(event) as [number,number]
    if(tool.value==='select') {
      const hit=[...pageLayers.value].reverse().find(layer=>{const b=layerBounds(layer);return x>=b.x-5 && x<=b.x+b.width+5 && y>=b.y-5 && y<=b.y+b.height+5})
      if(!hit){clearSelection();draw();return}
      selectLayer(hit);checkpoint(false)
      const b=layerBounds(hit)
      drag={start:[x,y],original:JSON.parse(JSON.stringify(hit)),resize:Math.abs(x-b.x-b.width)<12/zoom.value && Math.abs(y-b.y)<12/zoom.value,create:false}
    } else if(tool.value==='text') {
      checkpoint();const layer=newLayer('text',x,y);state.value.layers.push(layer);selectLayer(layer);tool.value='select';status.value='Edit the selected text in the panel, then choose Apply style.'
    } else {
      checkpoint()
      const layer=newLayer(tool.value as EditorLayer['kind'],x,y)
      if(layer.kind==='draw')layer.points=[x,y,x,y]
      state.value.layers.push(layer);selectLayer(layer)
      drag={start:[x,y],original:JSON.parse(JSON.stringify(layer)),resize:false,create:true}
    }
    overlay.value?.setPointerCapture(event.pointerId);draw()
  }
  function onPointerMove(event:PointerEvent) {
    if(!drag || !activeLayer.value)return
    invalidateResult()
    const [x,y]=pointer(event) as [number,number],layer=activeLayer.value
    const dx=x-drag.start[0]!,dy=y-drag.start[1]!
    if(drag.create) {
      if(layer.kind==='draw') {
        if((layer.points?.length??0)<2000)layer.points?.push(x,y)
        const b=layerBounds(layer);layer.x=b.x;layer.y=b.y;layer.width=b.width;layer.height=b.height
      } else if(layer.kind==='line') {layer.width=dx;layer.height=dy}
      else {layer.x=Math.min(drag.start[0]!,x);layer.y=Math.min(drag.start[1]!,y);layer.width=Math.max(1,Math.abs(dx));layer.height=Math.max(1,Math.abs(dy))}
    } else if(drag.resize && layer.kind!=='draw') {
      layer.width=Math.max(5,drag.original.width+dx);layer.height=Math.max(5,drag.original.height-dy);layer.y=drag.original.y+dy
      if(layer.kind==='text') {
        const factor=Math.max(layer.width/drag.original.width,layer.height/drag.original.height)
        layer.size=Math.max(4,Math.min(200,drag.original.size*factor))
        layer.width=drag.original.width*layer.size/drag.original.size;layer.height=drag.original.height*layer.size/drag.original.size
        layer.y=drag.original.y+drag.original.height-layer.height
      }
    }
    else {
      layer.x=drag.original.x+dx;layer.y=drag.original.y+dy
      if(layer.kind==='draw')layer.points=drag.original.points?.map((value,index)=>value+(index%2===0?dx:dy))
    }
    draft.value=JSON.parse(JSON.stringify(layer));draw()
  }
  function onPointerUp(event:PointerEvent) {
    if(drag){drag=null;tool.value='select';status.value='Layer placed. Drag to move it, or edit its properties.'}
    if(overlay.value?.hasPointerCapture(event.pointerId))overlay.value.releasePointerCapture(event.pointerId)
    draw()
  }
  function applyDraft() {
    if(!draft.value)return true
    try {
      const candidate=cloneEditorState(state.value),index=candidate.layers.findIndex(layer=>layer.id===draft.value!.id)
      candidate.layers[index]=JSON.parse(JSON.stringify(draft.value))
      validateEditorState(candidate);checkpoint();state.value=candidate;draw();status.value='Layer updated.';return true
    } catch(error){status.value=message(error);return false}
  }
  function removeLayer() {if(!selected.value || busy.value)return;checkpoint();state.value.layers=state.value.layers.filter(layer=>layer.id!==selected.value);clearSelection();draw()}
  function recordPrevious(previous:EditorState) {
    undo.value.push(previous);if(undo.value.length>40)undo.value.shift();redo.value=[]
  }
  async function previewChange(candidate:EditorState,commitHistory:(previous:EditorState)=>void,success:string,session=documentGeneration,action=++actionGeneration) {
    busy.value=true;status.value='Updating PDF content...'
    let committed=false
    try {
      committed=await applyEditorTransaction(async()=>{
        const response=await worker('preview',undefined,candidate)
        if(response.type!=='pdf')throw new Error('Could not update this PDF.')
        return loadPdf(response.bytes,()=>active(session,action))
      },()=>active(session,action),doc=>{
        commitHistory(cloneEditorState(state.value))
        renderTask?.cancel();viewGeneration++
        const previous=pdf.value;pdf.value=doc;state.value=candidate
        current.value=Math.min(current.value,candidate.pages.length-1);clearSelection();invalidateResult()
        void previous?.loadingTask.destroy().catch(()=>{})
      },doc=>doc.loadingTask.destroy())
      if(committed && active(session,action)){await render();if(active(session,action))status.value=success}
      return committed
    } catch(error){if(active(session,action))status.value=message(error);return committed}
    finally {if(active(session,action))busy.value=false}
  }
  async function replaceRun() {
    const row=activeRun.value;if(!row || !page.value || busy.value)return
    const candidate=cloneEditorState(state.value)
    const edit={page:page.value.source,run:row.id,expected:row.text,value:replacement.value}
    candidate.texts=candidate.texts.filter(value=>value.page!==edit.page || value.run!==edit.run)
    if(edit.value!==edit.expected)candidate.texts.push(edit)
    await previewChange(candidate,recordPrevious,'Original text replaced. The new text remains selectable.')
  }
  async function history(direction:'undo'|'redo') {
    if(busy.value)return
    const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo
    const next=from.value.at(-1);if(!next)return
    await previewChange(cloneEditorState(next),previous=>{from.value.pop();to.value.push(previous)},direction==='undo'?'Change undone.':'Change restored.')
  }
  async function recognizePage() {
    if(busy.value || rendering.value || !page.value || !pdf.value)return
    if(state.value.rebuilt?.includes(page.value.source)){status.value='This page is already converted. Edit its text layers, or undo the conversion first.';return}
    const session=documentGeneration,action=++actionGeneration,sourcePage=page.value.source,doc=pdf.value
    const revision=JSON.stringify(state.value)
    busy.value=true;ocrProgress.value=0;ocrReview.value=null;status.value='Preparing this page for English OCR...'
    const image=document.createElement('canvas')
    try {
      const original=await doc.getPage(sourcePage+1)
      if(!active(session,action))return
      const base=original.getViewport({scale:1,rotation:0})
      const scale=Math.min(2.5,Math.sqrt(12_000_000/(base.width*base.height)),8192/Math.max(base.width,base.height))
      const scanViewport=original.getViewport({scale,rotation:0})
      image.width=Math.ceil(scanViewport.width);image.height=Math.ceil(scanViewport.height)
      const context=image.getContext('2d');if(!context)throw new Error('Could not prepare the OCR image.')
      const task=original.render({canvas:image,canvasContext:context,viewport:scanViewport,background:'#ffffff'})
      ocrRenderTask=task;await task.promise
      if(!active(session,action))return
      const baseUrl=new URL('/ocr/v7/',window.location.origin).href
      const blob=await new Promise<Blob|null>(resolve=>image.toBlob(resolve,'image/png'))
      if(!active(session,action))return
      if(!blob)throw new Error('Could not encode this page for OCR.')
      const bytes=await blob.arrayBuffer()
      if(!active(session,action))return
      const data=await ocrClient.recognize(new Uint8Array(bytes),baseUrl,(phase,value)=>{
        if(active(session,action)){ocrProgress.value=Math.round(value*100);status.value=phase==='recognizing text'?'Recognizing English text: '+ocrProgress.value+'%':'Loading local OCR engine...'}
      })
      if(!active(session,action))return
      const lines=(data.blocks??[]).flatMap(block=>block.paragraphs.flatMap(paragraph=>paragraph.lines))
      const mapped=mapOcrLines(lines,{width:image.width,height:image.height},(x,y)=>scanViewport.convertToPdfPoint(x,y),id)
      if(!mapped.length){status.value='No text was recognized. Try a clearer, upright English scan.';return}
      ocrReview.value={page:sourcePage,revision,lines:mapped}
      clearSelection();tool.value='select';draw()
      status.value='Recognized '+mapped.length+' lines. Review the text, then choose Convert to editable page.'
    } catch(error){if(active(session,action))status.value='OCR could not finish: '+message(error)}
    finally {
      image.width=image.height=0
      if(active(session,action)){ocrRenderTask=null;busy.value=false}
    }
  }
  async function convertOcrPage() {
    const review=ocrReview.value
    if(!review || busy.value)return
    if(review.revision!==JSON.stringify(state.value)){status.value='The document changed after recognition. Run OCR again before converting.';return}
    try {
      const candidate=rebuildOcrPage(state.value,review.page,review.lines)
      if(await previewChange(candidate,recordPrevious,'Page converted. Select any text layer to edit, move or resize it.') && ocrReview.value===review)ocrReview.value=null
    } catch(error){status.value=message(error)}
  }
  async function importImage(file:File,replaceName?:string,signature=false) {
    if(busy.value || !page.value)return
    const session=documentGeneration,action=++actionGeneration,sourcePage=page.value.source
    busy.value=true;let bitmap:ImageBitmap|null=null
    let staged: (EditorAsset & {canvas:HTMLCanvasElement})|null=null,retained=false
    try {
      if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>8*1024*1024)throw new Error('Choose a PNG, JPEG or WebP image up to 8 MB.')
      bitmap=await createImageBitmap(file)
      if(!active(session,action))return
      if(bitmap.width*bitmap.height>12_000_000)throw new Error('Images must be at most 12 megapixels.')
      const buffer=document.createElement('canvas');buffer.width=bitmap.width;buffer.height=bitmap.height
      const context=buffer.getContext('2d');if(!context)throw new Error('Could not load this image.')
      context.drawImage(bitmap,0,0)
      const rgba=context.getImageData(0,0,buffer.width,buffer.height).data.buffer as ArrayBuffer
      if(assets.size>=16 || [...assets.values()].reduce((sum,item)=>sum+item.rgba.byteLength,0)+rgba.byteLength>64*1024*1024)throw new Error('Image assets exceed the 64 MB budget. Open a fresh editing session.')
      const key=id();staged={id:key,rgba,width:buffer.width,height:buffer.height,canvas:buffer};assets.set(key,staged)
      if(replaceName) {
        const candidate=cloneEditorState(state.value)
        candidate.images=candidate.images.filter(edit=>edit.page!==sourcePage || edit.name!==replaceName)
        candidate.images.push({page:sourcePage,name:replaceName,asset:key})
        retained=await previewChange(candidate,recordPrevious,'Existing image replaced.',session,action)
      } else {
        const center=viewport?.convertToPdfPoint(size.value.width*0.2,size.value.height*0.5)??[page.value!.width*0.15,page.value!.height*0.5]
        const layer=newLayer('image',center[0]!,center[1]!)
        layer.asset=key;layer.width=Math.min(signature?200:240,page.value!.width*0.6);layer.height=layer.width*buffer.height/buffer.width
        checkpoint();state.value.layers.push(layer);retained=true;selectLayer(layer);tool.value='select';draw()
        status.value='Image added. Drag it to move or resize.'
      }
    } catch(error){if(active(session,action))status.value=message(error)}
    finally {
      bitmap?.close()
      if(staged && !retained){if(assets.get(staged.id)===staged)assets.delete(staged.id);staged.canvas.width=staged.canvas.height=0}
      if(active(session,action))busy.value=false
    }
  }
  function captureSession(){return documentGeneration}
  function isSession(session:number){return !disposed && session===documentGeneration}
  async function removeOriginalImage(name:string) {
    const session=captureSession()
    const target=document.createElement('canvas');target.width=target.height=1
    const blob=await new Promise<Blob|null>(resolve=>target.toBlob(resolve,'image/png'))
    target.width=target.height=0
    if(blob && isSession(session))await importImage(new File([blob],'empty.png',{type:'image/png'}),name)
  }
  function changePage(index:number) {if(busy.value)return;ocrReview.value=null;current.value=index;clearSelection();inspection.value={texts:[],images:[]};textTargets.value=[];void render()}
  function rotate() {if(!page.value || busy.value)return;checkpoint();page.value.rotation=(page.value.rotation+90)%360;void render()}
  function movePage(direction:number) {
    const next=current.value+direction;if(next<0 || next>=state.value.pages.length || busy.value)return
    checkpoint();const item=state.value.pages.splice(current.value,1)[0]!;state.value.pages.splice(next,0,item);current.value=next;void render()
  }
  function deletePage() {
    if(state.value.pages.length<=1 || busy.value)return
    checkpoint();state.value.pages.splice(current.value,1);current.value=Math.min(current.value,state.value.pages.length-1);clearSelection();void render()
  }
  function cancel() {actionGeneration++;documentGeneration++;client.cancel();void loadingTask?.destroy();ocrRenderTask?.cancel();ocrClient.cancel();busy.value=false;status.value='PDF processing cancelled.'}
  async function exportPdf() {
    if(busy.value)return
    if(activeRun.value && replacement.value!==runValue(activeRun.value)){status.value='Choose Replace text to apply your original-text change before exporting.';return}
    if(draft.value && JSON.stringify(draft.value)!==JSON.stringify(activeLayer.value) && !applyDraft())return
    const generation=++actionGeneration
    busy.value=true;status.value='Applying changes and preparing your PDF…'
    try {
      const response=await worker('export')
      if(generation!==actionGeneration || disposed)return
      if(response.type!=='pdf')throw new Error('Could not export this PDF.')
      const blob=new Blob([response.bytes],{type:'application/pdf'})
      if(result.value)URL.revokeObjectURL(result.value.url)
      result.value={url:URL.createObjectURL(blob),name:filename.value.replace(/\.pdf$/i,'')+'-edited.pdf'}
      status.value='Edited PDF ready. Use Download PDF to save it.'
    } catch(error){if(generation===actionGeneration)status.value=message(error)}
    finally {if(generation===actionGeneration)busy.value=false}
  }
  function keyboard(event:KeyboardEvent) {
    if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)return
    if(event.key==='Escape'){clearSelection();tool.value='select';draw()}
    if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='z'){event.preventDefault();void history(event.shiftKey?'redo':'undo')}
    if((event.key==='Delete' || event.key==='Backspace') && selected.value){event.preventDefault();removeLayer()}
  }
  watch(zoom,()=>{void render()})
  onBeforeUnmount(()=>{
    disposed=true;documentGeneration++;actionGeneration++;viewGeneration++
    renderTask?.cancel();client.cancel();void loadingTask?.destroy();void pdf.value?.loadingTask.destroy()
    ocrRenderTask?.cancel();ocrClient.cancel()
    if(result.value)URL.revokeObjectURL(result.value.url)
    for(const asset of assets.values())asset.canvas.width=asset.canvas.height=0
    assets.clear()
  })
  return {canvas,overlay,status,busy,rendering,filename,tool,zoom,state,current,selected,selectedRun,inspection,search,replacement,draft,result,textTargets,size,undo,redo,page,pageLayers,activeLayer,activeRun,filteredRuns,editCount,hasDocument,
    ocrReview,ocrProgress,recognizePage,convertOcrPage,captureSession,isSession,openFile,blank,sample,scannedSample,runValue,selectRun,selectLayer,clearSelection,applyDraft,removeLayer,replaceRun,history,importImage,removeOriginalImage,changePage,rotate,movePage,deletePage,cancel,exportPdf,keyboard,onPointerDown,onPointerMove,onPointerUp,draw}
}
