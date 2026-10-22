import ts from 'typescript'
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const virtual = new Map()
const normalize = (path) => path.replaceAll('\\', '/')
for (const name of ['DocumentFieldExtractorModule', 'ImageObjectRemoverModule', 'ImageResizeModule', 'PdfCompressionModule', 'PdfImageExtractorModule', 'WatermarkModule', 'AgentToAgentFormModule', 'PdfTemplateFillerModule', 'EjariFormModule', 'PdfEditorModule']) {
  const path = resolve(root, 'app/components/' + name + '.vue')
  const { descriptor, errors } = parse(readFileSync(path, 'utf8'))
  const script = compileScript(descriptor, { id: name })
  const template = compileTemplate({ source: descriptor.template.content, filename: path, id: name, compilerOptions: { bindingMetadata: script.bindings } })
  if (errors.length || template.errors.length) throw new Error(JSON.stringify([...errors, ...template.errors]))
  const authImport = name === 'AgentToAgentFormModule' || name === 'PdfTemplateFillerModule' ? "import { useAuth } from '../composables/useAuth';\n" : ''
  virtual.set(normalize(path + '.ts'), "import { ref, shallowRef, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';\n" + authImport + script.content)
}
const configPath = resolve(root, '.nuxt/tsconfig.app.json')
const json = ts.readConfigFile(configPath, ts.sys.readFile)
if (json.error) throw new Error('Run nuxt prepare before checking processing types.')
const config = ts.parseJsonConfigFileContent(json.config, ts.sys, resolve(root, '.nuxt'))
const host = ts.createCompilerHost(config.options)
const original = host.getSourceFile.bind(host)
host.getSourceFile = (file, version, ...rest) => virtual.has(normalize(file))
  ? ts.createSourceFile(file, virtual.get(normalize(file)), version, true)
  : original(file, version, ...rest)
const program = ts.createProgram([
  ...virtual.keys(), resolve(root, '.nuxt/nuxt.d.ts'), resolve(root, 'app/types/assets.d.ts'), resolve(root, 'app/workers/processing.worker.ts'), resolve(root, 'app/workers/smart-selection.worker.ts'), resolve(root, 'app/workers/pdf-compression.worker.ts'), resolve(root, 'app/workers/ejari.worker.ts'), resolve(root, 'app/workers/pdf-editor.worker.ts')
], { ...config.options, noEmit: true }, host)
const allErrors = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error)
// Nuxt globals bring in typed API routes and the existing authentication module.
// Report those separate diagnostics without treating this focused processing
// check as a clean bill of health for the entire application.
const outsideScope = new Set(['app/composables/useAuth.ts', 'server/utils/auth-db.ts', 'server/utils/guide-db.ts'].map((file) => normalize(resolve(root, file))))
const diagnostics = allErrors.filter((d) => !d.file || !outsideScope.has(normalize(d.file.fileName)))
const unrelated = allErrors.length - diagnostics.length
if (unrelated) console.warn(`Note: ${unrelated} authentication/server diagnostics remain outside this processing check.`)
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: () => root, getCanonicalFileName: (x) => x, getNewLine: () => '\n' }))
  process.exit(1)
}
console.log('Processing Vue scripts/templates, worker, and imported utilities: type checks passed')
