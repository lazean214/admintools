import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'..')
const target=resolve(root,'public/ocr/v7')
await mkdir(target,{recursive:true})
const files=[['tesseract.js/dist/worker.min.js','worker.min.js'],
  ...['','simd-','relaxedsimd-'].map(variant=>[`tesseract.js-core/tesseract-core-${variant}lstm.wasm.js`,`tesseract-core-${variant}lstm.wasm.js`]),
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz','eng.traineddata.gz']]
for(const [source,name] of files)await copyFile(resolve(root,'node_modules',source),resolve(target,name))
const license=await readFile(resolve(root,'node_modules/tesseract.js/LICENSE.md'),'utf8')
await writeFile(resolve(target,'LICENSE-tesseract.txt'),license)
await copyFile(resolve(root,'node_modules/tesseract.js-core/LICENSE'),resolve(target,'LICENSE-core.txt'))
console.log('Prepared local OCR worker, WASM cores and English model.')
