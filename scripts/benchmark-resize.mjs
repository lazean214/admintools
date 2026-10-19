import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'

// Local-only, synthetic-image benchmark. No user images or external services.
const root = resolve(import.meta.dirname, '..')
const server = createServer(async (req, res) => {
  try {
    const routes = {
      '/': ['scripts/benchmarks/resize.html', 'text/html'],
      '/benchmark.js': ['scripts/benchmarks/resize.mjs', 'text/javascript'],
      '/worker.js': ['scripts/benchmarks/resize.worker.mjs', 'text/javascript'],
      '/watermark': ['scripts/benchmarks/watermark.html', 'text/html'],
      '/watermark-check.js': ['scripts/benchmarks/watermark.mjs', 'text/javascript'],
      '/ejari': ['scripts/benchmarks/ejari.html', 'text/html'],
      '/ejari-check.js': ['scripts/benchmarks/ejari.mjs', 'text/javascript'],
      '/ejari-compatible-check.js': ['scripts/benchmarks/ejari-compatible.mjs', 'text/javascript'],
      '/ejari-template.pdf': ['public/ejari-template.pdf', 'application/pdf'],
      '/ejari-template-data.json': ['public/ejari-template-data.json', 'application/json'],
      '/pdfjs.mjs': ['node_modules/pdfjs-dist/build/pdf.mjs', 'text/javascript'],
      '/pdf.worker.mjs': ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'text/javascript'],
      '/wasm.js': ['app/wasm/processing/admintools_processing.js', 'text/javascript'],
      '/admintools_processing_bg.wasm': ['app/wasm/processing/admintools_processing_bg.wasm', 'application/wasm']
    }
    const utilities = { '/watermark-utils.js': 'watermark.ts', '/processing-utils.js': 'processing.ts', '/processing-client.js': 'processing-client.ts', '/ejari-utils.js':'ejari.ts', '/ejari-fonts.js':'ejari-fonts.ts', '/ejari-render.js':'ejari-render.ts', '/ejari-template.js':'ejari-template.ts' }
    if (utilities[req.url]) {
      const source = await readFile(resolve(root, 'app/utils', utilities[req.url]), 'utf8')
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll("'./processing'", "'/processing-utils.js'").replaceAll("'./ejari-fonts'", "'/ejari-fonts.js'").replaceAll("'pdfjs-dist/build/pdf.worker.min.mjs?url'", "'/pdf-worker-url.js'").replaceAll("'pdfjs-dist'", "'/pdfjs.mjs'")
      res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(output); return
    }
    if (req.url === '/pdf-worker-url.js') { res.writeHead(200, { 'content-type':'text/javascript' }); res.end("export default '/pdf.worker.mjs'"); return }
    if (req.url === '/worker-production.js' || req.url === '/ejari-worker-production.js' || /^\/_nuxt\/[A-Za-z0-9_.-]+\.(js|wasm|mjs)$/.test(req.url)) {
      const files = await readdir(resolve(root, '.output/public/_nuxt'))
      const production = req.url.endsWith('worker-production.js')
      const name = production ? files.find((f) => f.startsWith(req.url === '/worker-production.js' ? 'processing.worker-' : 'ejari.worker-')) : req.url.slice('/_nuxt/'.length)
      if (!name || !files.includes(name)) { res.writeHead(404); res.end(); return }
      if (production) { res.writeHead(302, { location: '/_nuxt/' + name }); res.end(); return }
      res.writeHead(200, { 'content-type': name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' })
      res.end(await readFile(resolve(root, '.output/public/_nuxt', name))); return
    }
    const route = routes[req.url]
    if (!route) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': route[1], 'cache-control': 'no-store' })
    res.end(await readFile(resolve(root, route[0])))
  } catch { res.writeHead(500); res.end('Benchmark asset unavailable.') }
})
server.listen(3210, '127.0.0.1', () => console.log('Resize benchmark: http://127.0.0.1:3210'))
