import { encoding } from './ejari-fonts'

export type EditorPage = { source: number; rotation: number; width: number; height: number }
export type TextReplacement = { page: number; run: number; expected: string; value: string }
export type ImageReplacement = { page: number; name: string; asset: string }
export type EditorLayer = {
  id: string; page: number; kind: 'text' | 'image' | 'rect' | 'ellipse' | 'line' | 'highlight' | 'whiteout' | 'link' | 'draw'
  x: number; y: number; width: number; height: number; text: string; size: number; bold: boolean
  color: string; opacity: number; stroke: number; asset?: string; points?: number[]
}
export type EditorState = { pages: EditorPage[]; layers: EditorLayer[]; texts: TextReplacement[]; images: ImageReplacement[]; rebuilt?: number[] }
export type EditorInspection = { texts: { id: number; text: string; font: string }[]; images: { name: string; width: number; height: number }[] }
export type EditorAsset = { id: string; rgba: ArrayBuffer; width: number; height: number }
export type EditorRequest = { id: number; operation: 'inspect' | 'preview' | 'export'; source: ArrayBuffer; page?: number; state: EditorState; assets: EditorAsset[] }
export type EditorResponse = { id: number; type: 'inspection'; value: EditorInspection } | { id: number; type: 'pdf'; bytes: ArrayBuffer } | { id: number; type: 'error'; message: string }

export function encodeEditorText(text: string): Uint8Array {
  if (text.length > 4096) throw new Error('Text layers support at most 4096 characters.')
  return Uint8Array.from(Array.from(text,char=>{
    const code=encoding[char.codePointAt(0)!]
    if (code===undefined || code<32 || code===127) throw new Error('Added text supports Latin letters and WinAnsi symbols. The selected character needs a different embedded font.')
    return code
  }))
}
export function editorColor(hex: string): Float64Array {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Choose a valid color.')
  return new Float64Array([1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255))
}
export function cloneEditorState(state: EditorState): EditorState { return JSON.parse(JSON.stringify(state)) }
export function countEditorChanges(state:EditorState,original:EditorPage[]) {
  const pageChanges=state.pages.filter((page,index)=>page.source!==original[index]?.source || page.rotation!==original[index]?.rotation).length+Math.max(0,original.length-state.pages.length)
  return state.layers.length+state.texts.length+state.images.length+pageChanges+(state.rebuilt?.length??0)
}
export async function applyEditorTransaction<T>(prepare:()=>Promise<T>,isCurrent:()=>boolean,commit:(value:T)=>void,dispose:(value:T)=>Promise<unknown>|void):Promise<boolean> {
  const value=await prepare()
  if(!isCurrent()){await dispose(value);return false}
  commit(value)
  return true
}
export function validateEditorState(state: EditorState) {
  if (!state || !Array.isArray(state.pages) || !state.pages.length || state.pages.length>100) throw new Error('Keep 1 to 100 pages.')
  if (state.layers.length+state.texts.length+state.images.length>400) throw new Error('Keep at most 400 edits per document.')
  if (state.rebuilt && (state.rebuilt.length>100 || new Set(state.rebuilt).size!==state.rebuilt.length || state.rebuilt.some(page=>!Number.isInteger(page) || page<0 || page>=100))) throw new Error('Invalid converted pages.')
  const seen=new Set<number>()
  for (const page of state.pages) {
    if (!Number.isInteger(page.source) || page.source<0 || seen.has(page.source) || ![0,90,180,270].includes(page.rotation)) throw new Error('Invalid page order or rotation.')
    seen.add(page.source)
  }
  for (const layer of state.layers) {
    if (![layer.x,layer.y,layer.width,layer.height,layer.size,layer.stroke,layer.opacity].every(Number.isFinite)) throw new Error('Invalid layer dimensions.')
    if (layer.x < -14400 || layer.x > 28800 || layer.y < -14400 || layer.y > 28800 || Math.abs(layer.width)>14400 || Math.abs(layer.height)>14400 || layer.size<4 || layer.size>200 || layer.stroke<0 || layer.stroke>50 || layer.opacity<0 || layer.opacity>1) throw new Error('Layer dimensions or style are outside the supported range.')
    if (['image','rect','ellipse','highlight','whiteout','link'].includes(layer.kind) && (layer.width<1 || layer.height<1)) throw new Error('Use positive width and height.')
    if (['line','draw'].includes(layer.kind) && layer.stroke<0.1) throw new Error('Drawing strokes must be at least 0.1 point.')
    if (layer.kind==='draw' && (!layer.points || layer.points.length<4 || layer.points.length>2048 || layer.points.length%2 || !layer.points.every(Number.isFinite))) throw new Error('Invalid drawing path.')
    editorColor(layer.color)
    if (layer.kind==='text') layer.text.split('\n').forEach(encodeEditorText)
    if (layer.kind==='link') {
      let url: URL
      try {url=new URL(layer.text)} catch {throw new Error('Enter a full link such as https://example.com.')}
      if (!['https:','http:','mailto:'].includes(url.protocol)) throw new Error('Use an http, https or mailto link.')
    }
  }
}
export function layerBounds(layer: EditorLayer) {
  if (layer.kind==='draw' && layer.points?.length) {
    const xs=layer.points.filter((_,i)=>i%2===0),ys=layer.points.filter((_,i)=>i%2===1)
    return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(1,Math.max(...xs)-Math.min(...xs)),height:Math.max(1,Math.max(...ys)-Math.min(...ys))}
  }
  return {x:Math.min(layer.x,layer.x+layer.width),y:Math.min(layer.y,layer.y+layer.height),width:Math.abs(layer.width),height:Math.abs(layer.height)}
}

export function createBlankEditorPdf(): ArrayBuffer {
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2756 841.8898] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream'
  ]
  return buildStarterPdf(objects)
}
function buildStarterPdf(objects:string[]):ArrayBuffer {
  let text='%PDF-1.4\n'
  const offsets=[0]
  objects.forEach((object,index)=>{offsets.push(text.length);text+=(index+1)+' 0 obj\n'+object+'\nendobj\n'})
  const xref=text.length
  text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) text+=String(offset).padStart(10,'0')+' 00000 n \n'
  text+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n'
  return new TextEncoder().encode(text).buffer
}
export function createSampleEditorPdf():ArrayBuffer {
  const first='q\n0.06 0.46 0.43 rg\n40 740 515 4 re f\nQ\nBT\n/F1 26 Tf\n40 690 Td\n(SAMPLE DOCUMENT) Tj\n/F1 14 Tf\n0 -42 Td\n(Click this text to edit it) Tj\n0 -32 Td\n(Add your own text, images and signatures.) Tj\n0 -32 Td\n(Use page tools to rotate, reorder or delete pages.) Tj\nET\nq\n140 0 0 90 40 420 cm\n/Im1 Do\nQ\n'
  const second='BT\n/F1 24 Tf\n40 700 Td\n(Your second page) Tj\n/F1 14 Tf\n0 -44 Td\n(This sample stays in your browser.) Tj\n0 -32 Td\n(Text remains selectable in the exported PDF.) Tj\nET\n'
  const stream=(text:string)=>'<< /Length '+text.length+' >>\nstream\n'+text+'endstream'
  const pixels='0f766e99f6e4ccfbf1ffffff>'
  return buildStarterPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 4 0 R >>',
    stream(first),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    stream(second),
    '<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /ASCIIHexDecode /Length '+pixels.length+' >>\nstream\n'+pixels+'\nendstream'
  ])
}

export class PdfEditorClient {
  private worker: Worker | null = null
  private id=0
  private pending=new Map<number,{resolve:(value:EditorResponse)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  constructor(privateFactory:()=>Worker) {this.factory=privateFactory}
  private factory:()=>Worker
  async request(input:Omit<EditorRequest,'id'>):Promise<EditorResponse> {
    if (!(input.source instanceof ArrayBuffer) || input.source.byteLength>32*1024*1024) throw new Error('Choose a PDF no larger than 32 MB.')
    validateEditorState(input.state)
    if (input.assets.length>16 || input.assets.reduce((sum,asset)=>sum+asset.rgba.byteLength,0)>64*1024*1024) throw new Error('Image assets exceed the 64 MB editing budget.')
    if (!this.worker) {
      this.worker=this.factory()
      this.worker.onmessage=({data}:MessageEvent<EditorResponse>)=>{
        const pending=this.pending.get(data.id)
        if (!pending) return
        clearTimeout(pending.timer);this.pending.delete(data.id)
        if (data.type==='error') pending.reject(new Error(data.message))
        else pending.resolve(data)
      }
      this.worker.onerror=event=>{event.preventDefault();this.cancel('The PDF worker failed. Try a smaller document.')}
      this.worker.onmessageerror=()=>this.cancel('Could not receive the edited PDF.')
    }
    const id=++this.id
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject,timer:setTimeout(()=>this.cancel('PDF processing timed out.'),120_000)})
      try {this.worker!.postMessage({...input,id},[input.source,...input.assets.map(asset=>asset.rgba)])}
      catch(error) {this.cancel(error instanceof Error?error.message:'Could not start PDF processing.')}
    })
  }
  cancel(message='PDF processing cancelled.') {
    this.worker?.terminate();this.worker=null
    for (const pending of this.pending.values()) {clearTimeout(pending.timer);pending.reject(new Error(message))}
    this.pending.clear()
  }
}
