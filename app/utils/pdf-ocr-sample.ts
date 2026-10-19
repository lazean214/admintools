/** A local, image-only PDF so recognition can be tried without uploading a file. */
export async function createOcrSample():Promise<ArrayBuffer> {
  const image=document.createElement('canvas');image.width=1200;image.height=1600
  try {
    const context=image.getContext('2d');if(!context)throw new Error('Could not create the scanned sample.')
    context.fillStyle='#ffffff';context.fillRect(0,0,image.width,image.height)
    context.fillStyle='#111827';context.font='bold 52px Arial';context.fillText('LEASE AGREEMENT',90,170)
    context.font='32px Arial'
    for(const [index,line] of ['Tenant: Alex Morgan','Property: Apartment 204','Annual rent: 48,000 AED','This scanned text will become editable.'].entries())context.fillText(line,90,280+index*90)
    const blob=await new Promise<Blob|null>(resolve=>image.toBlob(resolve,'image/png'))
    if(!blob)throw new Error('Could not create the scanned sample.')
    const {PDFDocument}=await import('pdf-lib')
    const doc=await PDFDocument.create(),png=await doc.embedPng(await blob.arrayBuffer())
    doc.addPage([600,800]).drawImage(png,{x:0,y:0,width:600,height:800})
    return Uint8Array.from(await doc.save()).buffer
  } finally {image.width=image.height=0}
}
