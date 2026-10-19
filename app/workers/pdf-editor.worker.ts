/// <reference lib="webworker" />
import init, { PdfEditorDocument } from '../wasm/ejari/admintools_ejari.js'
import wasmUrl from '../wasm/ejari/admintools_ejari_bg.wasm?url'
import { encodeEditorText, editorColor, validateEditorState } from '../utils/pdf-editor'
import type { EditorRequest, EditorResponse } from '../utils/pdf-editor'

const scope=self as unknown as DedicatedWorkerGlobalScope
let initialized:ReturnType<typeof init>|null=null
scope.onmessage=async({data}:MessageEvent<EditorRequest>)=>{
  const send=(message:EditorResponse,transfer:Transferable[]=[])=>scope.postMessage(message,transfer)
  let doc:PdfEditorDocument|null=null
  try {
    if (!['inspect','preview','export'].includes(data.operation) || !(data.source instanceof ArrayBuffer) || data.source.byteLength>32*1024*1024) throw new Error('Invalid PDF editor request.')
    validateEditorState(data.state)
    if (data.assets.length>16 || data.assets.reduce((sum,asset)=>sum+asset.rgba.byteLength,0)>64*1024*1024) throw new Error('Too many image assets.')
    initialized??=init({module_or_path:wasmUrl});await initialized
    doc=new PdfEditorDocument(new Uint8Array(data.source))
    if (data.operation==='inspect') {
      if(data.state.rebuilt?.includes(data.page??0)){send({id:data.id,type:'inspection',value:{texts:[],images:[]}});return}
      send({id:data.id,type:'inspection',value:JSON.parse(doc.inspect(data.page??0))});return
    }
    for (const page of data.state.rebuilt??[]) doc.clear_page(page)
    for (const edit of data.state.texts) doc.replace_text(edit.page,edit.run,edit.expected,edit.value)
    const assets=new Map(data.assets.map(asset=>[asset.id,asset]))
    for (const edit of data.state.images) {
      const asset=assets.get(edit.asset)
      if (!asset) throw new Error('Replacement image is missing.')
      doc.replace_image(edit.page,edit.name,new Uint8Array(asset.rgba),asset.width,asset.height)
    }
    if (data.operation==='export') for (const layer of data.state.layers) {
      const color=editorColor(layer.color)
      if (layer.kind==='text') {
        layer.text.split('\n').forEach((line,index)=>doc!.add_text(layer.page,encodeEditorText(line),layer.x,layer.y-index*layer.size*1.25,layer.size,layer.bold,color))
      } else if (layer.kind==='image') {
        const asset=assets.get(layer.asset??'')
        if (!asset) throw new Error('Image layer is missing.')
        doc.add_image(layer.page,new Uint8Array(asset.rgba),asset.width,asset.height,layer.x,layer.y,layer.width,layer.height)
      } else if (layer.kind==='link') doc.add_link(layer.page,layer.x,layer.y,layer.width,layer.height,layer.text)
      else if (layer.kind==='draw') doc.add_path(layer.page,new Float64Array(layer.points??[]),color,layer.stroke)
      else doc.add_shape(layer.page,layer.x,layer.y,layer.width,layer.height,color,layer.opacity,layer.stroke,layer.kind==='line'?1:layer.kind==='ellipse'?2:0)
    }
    const bytes=doc.finish(new Uint32Array(data.state.pages.map(page=>page.source)),new Uint32Array(data.state.pages.map(page=>page.rotation)))
    const output=Uint8Array.from(bytes).buffer
    send({id:data.id,type:'pdf',bytes:output},[output])
  } catch(error) {send({id:data.id,type:'error',message:error instanceof Error?error.message:String(error)})}
  finally {doc?.free()}
}
