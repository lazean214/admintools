import { PDFDocument } from 'pdf-lib'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve(import.meta.dirname, '../.cache/tools')
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'removal-fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#648cb4"/><rect x="145" y="85" width="30" height="30" fill="#ff0000"/></svg>')
const doc = await PDFDocument.create()
const page = doc.addPage([400, 400])
const operations = []
// PDF.js groups runs of ten or more inline RGB images into an atlas.
for (let i = 0; i < 12; i++) {
  operations.push(Buffer.from(`q\n24 0 0 24 ${10 + i * 28} 30 cm\nBI /W 2 /H 2 /BPC 8 /CS /RGB ID `))
  operations.push(Buffer.from([255, 0, i * 15, 0, 255, 0, 0, 0, 255, 255, 255, 0]))
  operations.push(Buffer.from('\nEI\nQ\n'))
}
operations.push(Buffer.from('q\n90 0 0 20 10 100 cm\nBI /W 9 /H 2 /BPC 1 /CS /G ID '))
operations.push(Buffer.from([170, 128, 0, 0]))
operations.push(Buffer.from('\nEI\nQ\n'))
page.node.addContentStream(doc.context.register(doc.context.flateStream(Buffer.concat(operations))))
await writeFile(resolve(directory, 'pdf-images-fixture.pdf'), await doc.save())
console.log(`Fixtures written to ${directory}. PDF extraction should return 13 images.`)
