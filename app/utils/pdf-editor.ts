import { encoding } from './ejari-fonts'

export type EditorPage = { source: number; rotation: number; width: number; height: number }
export type TextReplacement = { page: number; run: number; expected: string; value: string }
export type ImageReplacement = { page: number; name: string; asset: string }
export type EditorLayer = {
  id: string; page: number; kind: 'text' | 'image' | 'rect' | 'ellipse' | 'line' | 'highlight' | 'whiteout' | 'link' | 'draw'
  x: number; y: number; width: number; height: number; text: string; size: number; bold: boolean
  color: string; opacity: number; stroke: number; asset?: string; points?: number[]
}
export type EditorState = { pages: EditorPage[]; layers: EditorLayer[]; texts: TextReplacement[]; images: ImageReplacement[] }
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
export function validateEditorState(state: EditorState) {
  if (!state || !Array.isArray(state.pages) || !state.pages.length || state.pages.length>100) throw new Error('Keep 1 to 100 pages.')
  if (state.layers.length+state.texts.length+state.images.length>400) throw new Error('Keep at most 400 edits per document.')
  const seen=new Set<number>()
  for (const page of state.pages) {
    if (!Number.isInteger(page.source) || page.source<0 || seen.has(page.source) || ![0,90,180,270].includes(page.rotation)) throw new Error('Invalid page order or rotation.')
    seen.add(page.source)
  }
  for (const layer of state.layers) {
    if (![layer.x,layer.y,layer.width,layer.height,layer.size,layer.stroke,layer.opacity].every(Number.isFinite)) throw new Error('Invalid layer dimensions.')
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
