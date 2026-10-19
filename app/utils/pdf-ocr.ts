import { encodeEditorText, cloneEditorState, validateEditorState } from './pdf-editor'
import type { EditorLayer, EditorState } from './pdf-editor'
import { widths } from './ejari-fonts'

export type OcrLine={text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number};baseline?:{x0:number;y0:number;x1:number;y1:number}}
export type OcrReviewLine={id:string;text:string;confidence:number;x:number;y:number;width:number;height:number;size:number;include:boolean}


/** Map the unrotated OCR raster back into source PDF coordinates, including crop offsets. */
export function mapOcrLines(lines:OcrLine[],raster:{width:number;height:number},point:(x:number,y:number)=>number[],newId:()=>string):OcrReviewLine[] {
  if(lines.length>400)throw new Error('This page has more than 400 text lines. Convert a simpler page.')
  return lines.filter(line=>line.text.trim()).map(line=>{
    const b=line.bbox
    if(![b.x0,b.x1,b.y0,b.y1,line.confidence].every(Number.isFinite) || b.x0<0 || b.y0<0 || b.x1>raster.width || b.y1>raster.height || b.x1<=b.x0 || b.y1<=b.y0)throw new Error('OCR returned invalid text coordinates.')
    const text=line.text.trim().replace(/\s+/g,' ')
    const [x,y]=point(b.x0,b.y1),[right,top]=point(b.x1,b.y0)
    const width=Math.abs(right!-x!),height=Math.abs(top!-y!)
    let include=true,units=0
    try {units=[...encodeEditorText(text)].reduce((sum,code)=>sum+(widths[code]??556),0)/1000} catch {include=false}
    const size=Math.max(4,Math.min(200,height/0.75,units?width/units:height))
    const round=(value:number)=>Math.round(value*100)/100
    return {id:newId(),text,confidence:Math.max(0,Math.min(100,line.confidence)),x:round(x!),y:round(y!+height*0.15),width:round(width),height:round(height),size:round(size),include}
  })
}

export function rebuildOcrPage(model:EditorState,page:number,lines:OcrReviewLine[]):EditorState {
  if(!model.pages.some(item=>item.source===page))throw new Error('This page is no longer in the document.')
  const chosen=lines.filter(line=>line.include && line.text.trim())
  if(!chosen.length)throw new Error('Select at least one recognized line to convert.')
  const candidate=cloneEditorState(model)
  candidate.layers=candidate.layers.filter(layer=>layer.page!==page)
  candidate.texts=candidate.texts.filter(edit=>edit.page!==page)
  candidate.images=candidate.images.filter(edit=>edit.page!==page)
  candidate.rebuilt=[...new Set([...(candidate.rebuilt??[]),page])]
  for(const line of chosen) {
    encodeEditorText(line.text)
    const layer:EditorLayer={id:line.id,page,kind:'text',text:line.text,x:line.x,y:line.y,width:line.width,height:line.height,size:line.size,bold:false,color:'#111827',opacity:1,stroke:0}
    candidate.layers.push(layer)
  }
  validateEditorState(candidate)
  return candidate
}
