<script setup lang="ts">
import { usePdfEditor } from '../composables/usePdfEditor'
const editor=usePdfEditor()
const {canvas,overlay,status,busy,rendering,filename,tool,zoom,state,current,selected,selectedRun,inspection,search,replacement,draft,result,textTargets,size,undo,redo,page,pageLayers,activeRun,filteredRuns,editCount,hasDocument}=editor
const upload=ref<HTMLInputElement|null>(null),imageInput=ref<HTMLInputElement|null>(null),signature=ref<HTMLCanvasElement|null>(null)
const showSignature=ref(false),replaceImageName=ref<string|undefined>(),signatureDrawing=ref(false)
const signatureName=ref('')
const {ocrReview}=editor
const tools=[
  {id:'select',label:'Select'},{id:'text',label:'Text'},{id:'whiteout',label:'Whiteout'},
  {id:'highlight',label:'Highlight'},{id:'rect',label:'Rectangle'},{id:'ellipse',label:'Ellipse'},
  {id:'line',label:'Line'},{id:'draw',label:'Draw'},{id:'link',label:'Link'}
]
const hint=computed(()=>{
  if(tool.value==='text')return 'Click existing text to edit it, or click a blank area to add text.'
  if(tool.value==='whiteout')return 'Drag to cover an area. Whiteout hides content; it is not secure redaction.'
  if(tool.value==='select')return 'Select a layer, then drag to move it. Use the corner handle to resize.'
  if(tool.value==='draw')return 'Draw on the page with your mouse, pen or touch.'
  return 'Drag on the page to place a '+tool.value+'.'
})
async function choosePdf(event:Event) {
  const file=(event.target as HTMLInputElement).files?.[0]
  if(file)await editor.openFile(file)
  ;(event.target as HTMLInputElement).value=''
}
async function chooseImage(event:Event) {
  const file=(event.target as HTMLInputElement).files?.[0]
  if(file)await editor.importImage(file,replaceImageName.value)
  replaceImageName.value=undefined
  ;(event.target as HTMLInputElement).value=''
}
function addImage(name?:string) {replaceImageName.value=name;imageInput.value?.click()}
async function drop(event:DragEvent) {
  event.preventDefault()
  const file=event.dataTransfer?.files[0]
  if(file)await editor.openFile(file)
}
function setTool(id:string) {tool.value=id;showSignature.value=false;editor.clearSelection();editor.draw()}
async function signaturePanel() {
  showSignature.value=!showSignature.value
  if(showSignature.value){await nextTick();clearSignature()}
}
function clearSignature() {const target=signature.value;target?.getContext('2d')?.clearRect(0,0,target.width,target.height)}
function typeSignature() {
  const target=signature.value,context=target?.getContext('2d'),name=signatureName.value.trim()
  if(!target || !context || !name)return
  clearSignature()
  let fontSize=64
  context.font='italic '+fontSize+'px cursive'
  while(fontSize>12 && context.measureText(name).width>target.width-40){fontSize--;context.font='italic '+fontSize+'px cursive'}
  context.fillStyle='#111827';context.fillText(name,20,target.height*0.65)
}
function signPoint(event:PointerEvent) {
  const target=signature.value!,rect=target.getBoundingClientRect()
  return [(event.clientX-rect.left)*target.width/rect.width,(event.clientY-rect.top)*target.height/rect.height]
}
function startSignature(event:PointerEvent) {
  const target=signature.value,context=target?.getContext('2d')
  if(!target || !context)return
  signatureDrawing.value=true;target.setPointerCapture(event.pointerId)
  const [x,y]=signPoint(event);context.beginPath();context.moveTo(x!,y!)
}
function moveSignature(event:PointerEvent) {
  if(!signatureDrawing.value)return
  const context=signature.value?.getContext('2d');if(!context)return
  const [x,y]=signPoint(event);context.strokeStyle='#111827';context.lineWidth=3;context.lineCap='round';context.lineJoin='round';context.lineTo(x!,y!);context.stroke()
}
async function placeSignature() {
  const target=signature.value;if(!target)return
  const rgba=target.getContext('2d')?.getImageData(0,0,target.width,target.height).data
  if(!rgba?.some((value,index)=>index%4===3 && value>0)){status.value='Draw your signature before adding it.';return}
  const session=editor.captureSession()
  const blob=await new Promise<Blob|null>(resolve=>target.toBlob(resolve,'image/png'))
  if(blob && editor.isSession(session)){await editor.importImage(new File([blob],'signature.png',{type:'image/png'}),undefined,true);if(editor.isSession(session))showSignature.value=false}
}
</script>

<template>
  <section class="pdf-editor" @keydown="editor.keyboard" @dragover.prevent @drop="drop">
    <input ref="upload" class="hidden" type="file" accept="application/pdf,.pdf" aria-label="Choose PDF file" @change="choosePdf">
    <input ref="imageInput" class="hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose image file" @change="chooseImage">
    <div class="editor-heading">
      <div>
        <h1 class="module-title text-3xl font-bold">PDF editor</h1>
        <p class="mt-2 text-sm text-slate-600">Edit text, add images and signatures, and arrange your pages.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button v-if="hasDocument" type="button" class="btn-secondary" :disabled="busy" @click="upload?.click()">Open another PDF</button>
      </div>
    </div>
    <p class="editor-status" role="status" aria-live="polite">{{ status }}</p>
    <div v-if="!hasDocument" class="editor-upload">
      <svg aria-hidden="true" class="mx-auto h-14 w-14 text-teal-700" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.7">
        <path d="M12 5h16l9 9v29H12zM28 5v10h9M24 34V22m-5 5 5-5 5 5" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <h2 class="module-title mt-5 text-2xl font-bold">Make your PDF work for you</h2>
      <p class="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">Drop a document here to edit supported original text, place images and signatures, highlight details, or organize pages.</p>
      <div class="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" class="btn-primary" :disabled="busy" @click="upload?.click()">{{ busy ? 'Opening PDF…' : 'Choose PDF file' }}</button>
        <button type="button" class="btn-secondary" :disabled="busy" @click="editor.blank">Start a blank document</button>
      </div>
      <button type="button" class="mt-4 text-sm font-semibold text-teal-800 underline underline-offset-4" :disabled="busy" @click="editor.sample">Try a sample PDF</button>
      <button type="button" class="ml-4 mt-4 text-sm font-semibold text-teal-800 underline underline-offset-4" :disabled="busy" @click="editor.scannedSample">Try a scanned PDF</button>
      <p class="mt-5 text-xs text-slate-600">Up to 32 MB · 100 pages · Your file stays in this browser</p>
    </div>
    <template v-else>
      <div class="editor-document-bar">
        <span class="min-w-0 truncate font-semibold" :title="filename">{{ filename }}</span>
        <span class="text-xs text-slate-600">{{ state.pages.length }} {{ state.pages.length===1?'page':'pages' }} · {{ editCount }} {{ editCount===1?'edit':'edits' }}</span>
        <div class="ml-auto flex gap-2">
          <button type="button" class="editor-button" :disabled="!undo.length || busy" @click="editor.history('undo')">Undo</button>
          <button type="button" class="editor-button" :disabled="!redo.length || busy" @click="editor.history('redo')">Redo</button>
        </div>
      </div>
      <div class="editor-toolbar" role="toolbar" aria-label="PDF editing tools">
        <button v-for="item in tools" :key="item.id" type="button" class="editor-button" :class="{active:tool===item.id}" :aria-pressed="tool===item.id" :disabled="busy" @click="setTool(item.id)">{{ item.label }}</button>
        <span class="toolbar-divider" aria-hidden="true"/>
        <button type="button" class="editor-button" :disabled="busy" @click="addImage()">Image</button>
        <button type="button" class="editor-button" :class="{active:showSignature}" :disabled="busy" @click="signaturePanel">Sign</button>
        <button type="button" class="editor-button" :disabled="busy || rendering" @click="showSignature=false;editor.recognizePage()">OCR / Editable page</button>
        <button v-if="busy" type="button" class="editor-button" @click="editor.cancel">Cancel processing</button>
        <button type="button" class="editor-button editor-apply" :disabled="busy || rendering" @click="editor.exportPdf">Apply changes</button>
      </div>
      <div class="editor-hint">{{ hint }}</div>
      <p v-if="!ocrReview" class="px-5 py-2 text-xs text-slate-600">OCR converts one page at a time. Printed English only; use a clear, upright scan. Models load locally from this app.</p>
      <section v-if="ocrReview" class="ocr-review" aria-labelledby="ocr-heading">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="ocr-heading" class="inspector-title">Review recognized text</h2>
            <p class="inspector-help">English OCR for page {{ current+1 }}. Correct mistakes and uncheck lines you do not want. Amber scores need closer review. Unsupported characters start unchecked; correct the text before including those lines.</p></div>
          <button type="button" class="editor-button" :disabled="busy" @click="ocrReview=null">Discard OCR results</button>
        </div>
        <div class="ocr-lines">
          <div v-for="(line,index) in ocrReview.lines" :key="line.id" class="ocr-line">
            <label class="flex items-center gap-2 text-xs"><input v-model="line.include" type="checkbox" :disabled="busy" :aria-label="'Include OCR line '+(index+1)"><span :class="line.confidence<70?'text-amber-800':'text-slate-600'">{{ Math.round(line.confidence) }}%</span></label>
            <input v-model="line.text" class="editor-input" :disabled="busy" :aria-label="'OCR line '+(index+1)">
          </div>
        </div>
        <p class="inspector-help">Conversion replaces this page and its added layers with editable text on a clean background. Images, forms and complex formatting are removed. Text positions are approximate; fonts use Helvetica. Undo restores the original page.</p>
        <button type="button" class="btn-primary" :disabled="busy || !ocrReview.lines.some(line=>line.include && line.text.trim())" @click="editor.convertOcrPage">Convert to editable page</button>
      </section>
      <div class="editor-workspace">
        <aside class="editor-pages" aria-label="Document pages">
          <h2 class="inspector-title">Pages</h2>
          <div class="page-list">
            <button v-for="(item,index) in state.pages" :key="item.source" type="button" class="page-button" :class="{active:index===current}" :aria-current="index===current?'page':undefined" :disabled="busy" @click="editor.changePage(index)">
              <svg aria-hidden="true" viewBox="0 0 32 40" fill="none" stroke="currentColor"><path d="M5 2h15l7 7v29H5zM20 2v8h7M10 17h12M10 22h12M10 27h8"/></svg>
              <span>Page {{ index+1 }}</span>
              <span class="text-[11px]">Source {{ item.source+1 }}</span>
            </button>
          </div>
        </aside>
        <div class="editor-canvas-column">
          <div class="canvas-controls">
            <div class="flex flex-wrap items-center gap-1">
              <button type="button" class="editor-button" :disabled="busy || current===0" aria-label="Previous page" @click="editor.changePage(current-1)">Previous</button>
              <span class="px-1 text-xs">Page {{ current+1 }} / {{ state.pages.length }}</span>
              <button type="button" class="editor-button" :disabled="busy || current===state.pages.length-1" aria-label="Next page" @click="editor.changePage(current+1)">Next</button>
            </div>
            <label class="flex items-center gap-2 text-xs font-semibold">Zoom
              <select v-model.number="zoom" class="editor-select" :disabled="busy || rendering">
                <option :value="0.25">25%</option><option :value="0.5">50%</option><option :value="0.75">75%</option><option :value="1">100%</option><option :value="1.25">125%</option><option :value="1.5">150%</option><option :value="2">200%</option>
              </select>
            </label>
          </div>
          <div class="editor-scroll" :aria-busy="rendering">
            <div class="editor-page" :style="{width:size.width+'px',height:size.height+'px'}">
              <canvas ref="canvas" aria-label="Original PDF page"/>
              <canvas ref="overlay" class="editing-canvas" tabindex="0" aria-label="PDF editing canvas. Select a tool then click or drag to edit." @pointerdown.prevent="editor.onPointerDown" @pointermove="editor.onPointerMove" @pointerup="editor.onPointerUp" @pointercancel="editor.onPointerUp"/>
              <template v-if="tool==='text' && !busy && !rendering">
                <button v-for="target in textTargets" :key="target.id" type="button" class="original-text-target" :aria-label="'Edit original text: '+target.label" :style="{left:target.left+'px',top:target.top+'px',width:target.width+'px',height:target.height+'px',transform:'rotate('+target.angle+'deg)'}" @click.stop="editor.selectRun(target.id)"/>
              </template>
            </div>
          </div>
          <div class="canvas-footer">
            <button type="button" class="editor-button" :disabled="busy" @click="editor.rotate">Rotate 90°</button>
            <button type="button" class="editor-button" :disabled="busy || current===0" @click="editor.movePage(-1)">Move earlier</button>
            <button type="button" class="editor-button" :disabled="busy || current===state.pages.length-1" @click="editor.movePage(1)">Move later</button>
            <button type="button" class="editor-button danger" :disabled="busy || state.pages.length===1" @click="editor.deletePage">Delete page</button>
          </div>
        </div>
        <aside class="editor-inspector" aria-label="Editing properties">
          <div v-if="showSignature">
            <h2 class="inspector-title">Draw a signature</h2>
            <p class="inspector-help">Use your mouse, pen or finger. This adds a visual signature image.</p>
            <label class="editor-label">Or type your name<input v-model="signatureName" maxlength="100" class="editor-input"></label>
            <button type="button" class="editor-button mt-2" :disabled="!signatureName.trim()" @click="typeSignature">Use typed signature</button>
            <canvas ref="signature" width="600" height="220" class="signature-pad" aria-label="Signature drawing area" @pointerdown.prevent="startSignature" @pointermove.prevent="moveSignature" @pointerup="signatureDrawing=false" @pointercancel="signatureDrawing=false"/>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="editor-button" @click="clearSignature">Clear</button>
              <button type="button" class="btn-primary" :disabled="busy" @click="placeSignature">Add signature</button>
            </div>
          </div>
          <div v-else-if="activeRun">
            <h2 class="inspector-title">Edit original text</h2>
            <p class="inspector-help">This updates the PDF text itself using its original font. Replacement characters must exist in that font.</p>
            <p class="inspector-help">Position and font size stay the same. Check longer replacements for overlap.</p>
            <label class="editor-label">Original text<textarea :value="activeRun.text" readonly rows="3" class="editor-input"/></label>
            <label class="editor-label">Replacement<textarea v-model="replacement" rows="4" class="editor-input" :disabled="busy"/></label>
            <button type="button" class="btn-primary mt-3 w-full" :disabled="busy || replacement===editor.runValue(activeRun)" @click="editor.replaceRun">Replace text</button>
            <button type="button" class="editor-button mt-2" @click="editor.clearSelection">Back to page tools</button>
          </div>
          <div v-else-if="draft">
            <h2 class="inspector-title">{{ draft.kind==='image'?'Image':draft.kind==='text'?'Text':draft.kind==='link'?'Link':'Annotation' }} properties</h2>
            <template v-if="draft.kind==='text' || draft.kind==='link'">
              <label class="editor-label">{{ draft.kind==='link'?'Link URL':'Text' }}<textarea v-model="draft.text" rows="3" class="editor-input" :disabled="busy"/></label>
            </template>
            <div class="property-grid">
              <label class="editor-label">X (pt)<input v-model.number="draft.x" type="number" class="editor-input"></label>
              <label class="editor-label">Y (pt)<input v-model.number="draft.y" type="number" class="editor-input"></label>
              <label v-if="draft.kind!=='draw'" class="editor-label">Width (pt)<input v-model.number="draft.width" type="number" min="1" class="editor-input"></label>
              <label v-if="draft.kind!=='draw'" class="editor-label">Height (pt)<input v-model.number="draft.height" type="number" min="1" class="editor-input"></label>
              <label v-if="draft.kind==='text'" class="editor-label">Font size<input v-model.number="draft.size" type="number" min="4" max="200" class="editor-input"></label>
              <label v-if="draft.kind!=='image' && draft.kind!=='link'" class="editor-label">Color<input v-model="draft.color" type="color" class="editor-input h-10"></label>
              <label v-if="!['image','text','link'].includes(draft.kind)" class="editor-label">Stroke width<input v-model.number="draft.stroke" type="number" min="0" max="50" step="0.5" class="editor-input"></label>
              <label v-if="!['image','text','draw','link'].includes(draft.kind)" class="editor-label">Opacity<input v-model.number="draft.opacity" type="number" min="0" max="1" step="0.05" class="editor-input"></label>
            </div>
            <label v-if="draft.kind==='text'" class="mt-3 flex items-center gap-2 text-sm"><input v-model="draft.bold" type="checkbox">Bold</label>
            <p v-if="draft.kind==='whiteout'" class="inspector-help">Whiteout covers content. It does not remove the underlying text or image.</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn-primary" :disabled="busy" @click="editor.applyDraft">Apply style</button>
              <button type="button" class="editor-button danger" :disabled="busy" @click="editor.removeLayer">Delete layer</button>
            </div>
          </div>
          <div v-else>
            <h2 class="inspector-title">Page tools</h2>
            <p class="inspector-help">Choose a tool above. Added text stays selectable in the exported PDF.</p>
            <label class="editor-label">Find original text<input v-model="search" type="search" class="editor-input" placeholder="Search this page"></label>
            <div class="original-text-list">
              <button v-for="run in filteredRuns" :key="run.id" type="button" class="text-run" :disabled="busy" @click="editor.selectRun(run.id)">{{ editor.runValue(run) || '(deleted text)' }}</button>
              <p v-if="!inspection.texts.length" class="inspector-help">{{ state.rebuilt?.includes(page?.source??-1)?'Converted text is in Added layers below. Select a line to edit it.':'No supported text runs found. Use OCR / Editable page to convert a printed English scan.' }}</p>
              <p v-else-if="!filteredRuns.length" class="inspector-help">No matching text on this page.</p>
            </div>
            <template v-if="inspection.images.length">
              <h3 class="inspector-title mt-6">Existing images</h3>
              <p class="inspector-help">Replace a direct page image while keeping its placement.</p>
              <div v-for="image in inspection.images" :key="image.name" class="mb-2 border-b border-slate-200 pb-2">
                <p class="text-xs text-slate-600">{{ image.name }} · {{ image.width }} × {{ image.height }}</p>
                <button type="button" class="editor-button" :disabled="busy" @click="addImage(image.name)">Replace image</button>
                <button type="button" class="editor-button danger" :disabled="busy" @click="editor.removeOriginalImage(image.name)">Remove image</button>
              </div>
            </template>
          </div>
          <div v-if="pageLayers.length" class="layers-list">
            <h3 class="inspector-title">Added layers</h3>
            <button v-for="layer in [...pageLayers].reverse()" :key="layer.id" type="button" class="text-run" :class="{chosen:layer.id===selected}" @click="editor.selectLayer(layer);editor.draw()">{{ layer.kind }}{{ layer.kind==='text'?' · '+layer.text.slice(0,28):'' }}</button>
          </div>
        </aside>
      </div>
      <div class="editor-export-bar">
        <p class="text-sm text-slate-600">Original text edits keep their font. Added text uses Helvetica. Unsupported glyphs are reported before saving.</p>
      </div>
      <div v-if="result" class="editor-result" role="status">
        <div><h2 class="module-title text-lg font-bold">Your edited PDF is ready</h2><p class="mt-1 break-all text-sm">{{ result.name }}</p><p class="mt-1 text-xs">Apply changes again after making further edits.</p></div>
        <a class="btn-primary" :href="result.url" :download="result.name">Download PDF</a>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ocr-review{padding:20px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
.ocr-lines{max-height:280px;overflow:auto;margin:12px 0;display:grid;gap:8px}
.ocr-line{display:grid;grid-template-columns:76px minmax(0,1fr);gap:8px;align-items:center}
.pdf-editor{--editor-accent:#0f766e;color:#0f172a;background:#fff;border-radius:16px;border:1px solid #cbd5e1;overflow:clip}
.editor-heading{padding:28px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.editor-status{margin:0;padding:12px 28px;background:#f0fdfa;color:#115e59;font-size:13px;line-height:1.6;border-top:1px solid #ccfbf1;border-bottom:1px solid #ccfbf1;overflow-wrap:anywhere}
.editor-upload{text-align:center;padding:64px 24px 72px}
.editor-document-bar{padding:12px 18px;display:flex;align-items:center;gap:16px;border-bottom:1px solid #e2e8f0}
.editor-toolbar{position:sticky;top:88px;z-index:30;display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid #e2e8f0}
.editor-button{font-size:12px;line-height:1.5;font-weight:700;color:#334155;padding:8px 10px;background:#fff;border:1px solid transparent;border-radius:6px;white-space:nowrap}
.editor-button:hover:not(:disabled){background:#f0fdfa;color:#115e59}
.editor-button.active,.editor-button[aria-pressed=true]{color:#fff;background:var(--editor-accent)}
.editor-button.editor-apply{margin-left:auto;background:#0f766e;color:#fff}
.editor-button.editor-apply:hover:not(:disabled){background:#115e59;color:#fff}
.editor-button:disabled{opacity:.4;cursor:not-allowed}
.editor-button.danger{color:#b91c1c}
.toolbar-divider{height:24px;width:1px;background:#cbd5e1;margin:0 4px}
.editor-hint{padding:8px 18px;background:#f8fafc;font-size:12px;color:#475569;border-block:1px solid #e2e8f0}
.editor-workspace{display:grid;grid-template-columns:105px minmax(0,1fr) 275px;min-height:660px}
.editor-pages{padding:18px 10px;background:#f8fafc;border-right:1px solid #e2e8f0}
.inspector-title{font-size:14px;font-weight:700;margin-bottom:10px}
.inspector-help{font-size:12px;line-height:1.7;color:#475569;margin:8px 0 12px}
.page-list{display:flex;flex-direction:column;gap:10px;max-height:740px;overflow:auto}
.page-button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 5px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#475569;font-size:12px;font-weight:600}
.page-button svg{width:30px;height:38px}
.page-button.active{border-color:#0f766e;background:#f0fdfa;color:#115e59}
.editor-canvas-column{min-width:0;background:#e8edf1;display:flex;flex-direction:column}
.canvas-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #cbd5e1}
.editor-select{background:#fff;border:1px solid #cbd5e1;border-radius:5px;padding:6px;font-size:12px}
.editor-scroll{height:700px;overflow:auto;padding:24px;overscroll-behavior:contain}
.editor-page{position:relative;margin:0 auto;background:#fff;box-shadow:0 4px 16px #0f172a20;flex-shrink:0}
.editor-page>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.editing-canvas{z-index:2;touch-action:none;cursor:crosshair}
.original-text-target{position:absolute;z-index:3;background:transparent;border:1px solid transparent;transform-origin:left bottom;cursor:text}
.original-text-target:hover,.original-text-target:focus-visible{border-color:#0f766e;background:#0f766e12}
.canvas-footer{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px;border-top:1px solid #cbd5e1;margin-top:auto}
.editor-inspector{padding:20px 18px;border-left:1px solid #e2e8f0;max-height:820px;overflow:auto;min-width:0}
.editor-label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;margin-top:14px}
.editor-input{width:100%;min-width:0;padding:9px 10px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;color:#0f172a;font-size:13px;resize:vertical;caret-color:#0f766e}
.editor-input::placeholder{color:#64748b}
.editor-input[readonly]{background:#f8fafc;color:#475569}
.property-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.original-text-list{max-height:275px;overflow:auto;margin-top:10px}
.text-run{display:block;width:100%;text-align:left;padding:10px 8px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.text-run:hover,.text-run.chosen{background:#f0fdfa;color:#115e59}
.layers-list{margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0}
.signature-pad{width:100%;height:auto;touch-action:none;border:1px solid #94a3b8;border-radius:6px;background:#fff}
.editor-export-bar{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid #e2e8f0}
.editor-result{padding:22px 28px;background:#f0fdfa;border-top:1px solid #99f6e4;display:flex;align-items:center;justify-content:space-between;gap:20px;color:#115e59}
.pdf-editor :focus-visible{outline:3px solid #0f766e;outline-offset:3px}
.pdf-editor ::selection{color:#115e59;background:#99f6e4}
.pdf-editor ::-webkit-scrollbar{width:9px;height:9px}
.pdf-editor ::-webkit-scrollbar-thumb{background:#94a3b8;border:2px solid #e8edf1;border-radius:8px}
@media(max-width:1100px){.editor-workspace{grid-template-columns:80px minmax(0,1fr)}.editor-inspector{grid-column:1/-1;border-left:0;border-top:1px solid #cbd5e1;max-height:none}.editor-scroll{height:620px}.original-text-list{max-height:180px}}
@media(max-width:640px){.editor-heading{padding:22px 18px;align-items:flex-start;flex-direction:column}.editor-upload{padding:42px 18px}.editor-status{padding:12px 18px}.editor-document-bar{gap:8px;flex-wrap:wrap}.editor-workspace{grid-template-columns:minmax(0,1fr)}.editor-pages{border-right:0;border-bottom:1px solid #cbd5e1;padding:10px}.editor-pages>.inspector-title{display:none}.page-list{flex-direction:row;max-height:110px}.page-button{min-width:68px;padding:6px}.page-button svg{display:none}.editor-inspector{grid-column:1}.editor-scroll{height:520px;padding:14px}.editor-toolbar{padding:8px;gap:2px}.editor-button{padding:8px}.editor-result,.editor-export-bar{align-items:flex-start;flex-direction:column}.editor-result{padding:20px}.canvas-controls{padding:8px 4px}}
@media(prefers-reduced-motion:no-preference){.editor-upload{animation:editor-enter .3s cubic-bezier(.16,1,.3,1)}@keyframes editor-enter{from{clip-path:inset(0 0 6%);opacity:.65}to{clip-path:inset(0);opacity:1}}}
</style>
