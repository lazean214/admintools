import { ProcessingClient } from '/processing-client.js'
import { ejariFields } from '/ejari-utils.js'
import { renderEjariPages } from '/ejari-render.js'
import { getDocument } from '/pdfjs.mjs'
import { loadEjariTemplate } from '/ejari-template.js'

document.querySelector('#compatible').onclick = async () => {
  const button = document.querySelector('#compatible')
  const status = document.querySelector('#compatible-status')
  const results = document.querySelector('#compatible-results')
  const previews = document.querySelector('#compatible-previews')
  const client = new ProcessingClient(() => new Worker('/ejari-worker-production.js',{type:'module'}))
  let pdf
  button.disabled = true
  status.textContent = 'Running'
  results.textContent = ''
  previews.replaceChildren()
  try {
    const template = await loadEjariTemplate(new AbortController().signal)
    const fields = ejariFields({ownerName:'VISIBLE OWNER 123',lessorName:'VISIBLE LESSOR',tenantName:'VISIBLE TENANT',propertyUsage:'Residential',additionalTerm1:'VISIBLE TERM ON PAGE THREE'})
    const rgba = await renderEjariPages(template.slice(0),fields,new AbortController().signal,()=>{})
    const expected = new Uint8Array(rgba.slice(0))
    const blob = await client.ejariRasterPdf(rgba)
    pdf = getDocument({data:await blob.arrayBuffer()})
    const doc = await pdf.promise
    if (doc.numPages !== 3) throw new Error('Missing pages')
    results.textContent += 'PASS three generated US Letter pages\n'
    const pageBytes = 1224*1584*4
    for (let index=0;index<3;index++) {
      const page = await doc.getPage(index+1)
      const canvas = document.createElement('canvas')
      canvas.width=1224;canvas.height=1584;canvas.style.width='350px'
      const context = canvas.getContext('2d',{willReadFrequently:true})
      await page.render({canvas,canvasContext:context,viewport:page.getViewport({scale:2})}).promise
      const actual = context.getImageData(0,0,1224,1584).data
      let changed=0
      for (let i=0;i<pageBytes;i++) if (actual[i] !== expected[index*pageBytes+i]) changed++
      if (changed) throw new Error(`Page ${index+1}: ${changed} changed channels`)
      results.textContent+=`PASS page ${index+1}: lossless rendered pixels\n`
      previews.append(canvas)
    }
    // Independently compare owner/tenant/term regions with the blank template.
    const blank = new Uint8Array(await renderEjariPages(template,[],new AbortController().signal,()=>{}))
    for (const [page,left,top,right,bottom] of [[0,190,335,420,360],[0,190,685,420,710],[2,110,630,600,655]]) {
      let changed=0
      for (let y=top;y<bottom;y++) for (let x=left;x<right;x++) {
        const offset=page*pageBytes+(y*1224+x)*4
        if (expected[offset]!==blank[offset]) changed++
      }
      if (changed<20) throw new Error(`Filled values missing on page ${page+1}`)
      results.textContent+=`PASS entered values visible on page ${page+1}: ${changed} changed pixels\n`
    }
    status.textContent='PASS: 7 checks'
  } catch(error) {status.textContent='FAILED';results.textContent+=error.stack||String(error)}
  finally {await pdf?.destroy();client.cancel();button.disabled=false}
}
