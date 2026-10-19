import type { Page } from 'tesseract.js'

/** Adapter for the pinned Tesseract.js 7 worker protocol. Owning the native
 * worker lets Cancel stop model initialization as well as recognition. */
export class PdfOcrClient {
  private worker:Worker|null=null
  private sequence=0
  private pending:{id:string;resolve:(value:any)=>void;reject:(error:Error)=>void}|null=null
  private factory:(url:string)=>Worker
  constructor(factory:(url:string)=>Worker=url=>new Worker(url)){this.factory=factory}
  cancel(reason='OCR cancelled.') {
    const worker=this.worker;this.worker=null;worker?.terminate()
    const pending=this.pending;this.pending=null;pending?.reject(new Error(reason))
  }
  async recognize(image:Uint8Array,baseUrl:string,progress:(status:string,value:number)=>void):Promise<Page> {
    this.cancel()
    const worker=this.factory(baseUrl+'worker.min.js');this.worker=worker
    const timeout=setTimeout(()=>{if(this.worker===worker)this.cancel('OCR timed out. Try a smaller or clearer page.')},150_000)
    worker.onmessage=({data})=>{
      if(this.worker!==worker || data.jobId!==this.pending?.id)return
      if(data.status==='progress'){progress(String(data.data?.status??''),Number(data.data?.progress)||0);return}
      const pending=this.pending;this.pending=null
      if(data.status==='resolve')pending?.resolve(data.data)
      else pending?.reject(new Error(String(data.data??'OCR worker failed.')))
    }
    worker.onerror=()=>{if(this.worker===worker)this.cancel('Could not load the local OCR engine. Reload the app and try again.')}
    const request=(action:string,payload:unknown,transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{
      if(this.worker!==worker){reject(new Error('OCR cancelled.'));return}
      const jobId=String(++this.sequence)
      this.pending={id:jobId,resolve,reject}
      try{worker.postMessage({workerId:'pdf-ocr',jobId,action,payload},transfer)}catch(error){this.pending=null;reject(error)}
    })
    try {
      await request('load',{options:{lstmOnly:true,corePath:baseUrl}})
      await request('loadLanguage',{langs:'eng',options:{langPath:baseUrl,gzip:true,lstmOnly:true,cacheMethod:'write',cachePath:'admintools-ocr-v7'}})
      await request('initialize',{langs:'eng',oem:1,config:{}})
      await request('setParameters',{params:{user_defined_dpi:'180'}})
      return await request('recognize',{image,options:{},output:{blocks:true,text:true}},[image.buffer])
    } finally {clearTimeout(timeout);if(this.worker===worker)this.cancel()}
  }
}
