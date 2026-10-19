import { ProcessingClient, ProcessingCancelledError } from '/processing-client.js'
import { ejariFields, encodeEjariFields } from '/ejari-utils.js'
import { loadEjariTemplate } from '/ejari-template.js'

document.querySelector('#run').onclick = async () => {
  const button = document.querySelector('#run')
  const status = document.querySelector('#status')
  const results = document.querySelector('#results')
  button.disabled = true
  const client = new ProcessingClient(() => new Worker('/ejari-worker-production.js',{type:'module'}))
  const report = message => results.textContent += message+'\n'
  const ensure = (condition,message) => { if (!condition) throw new Error(message) }
  try {
    results.textContent = ''
    status.textContent = 'Running'
    const template = await loadEjariTemplate(new AbortController().signal)
    const input = () => ({template:template.slice(0),...encodeEjariFields(ejariFields({ownerName:'Example Owner café',propertyUsage:'Residential',additionalTerm1:'Synthetic test term'}))})
    const output = await client.ejariPdf(input())
    ensure(output.type==='application/pdf' && output.size>1_000_000,'Invalid PDF output')
    ensure((await output.text()).startsWith('%PDF-'),'Missing PDF header')
    report(`PASS production worker PDF: ${output.size} bytes`)
    const bad = input()
    new Uint8Array(bad.template)[0] ^= 1
    let rejected = false
    try { await client.ejariPdf(bad) } catch (error) { rejected = /template has changed/.test(error.message) }
    ensure(rejected,'Modified template was accepted')
    report('PASS modified template rejected')
    const cancelled = client.ejariPdf(input())
    client.cancel()
    try { await cancelled; throw new Error('Cancellation failed') }
    catch (error) { ensure(error instanceof ProcessingCancelledError,'Unexpected cancellation error') }
    report('PASS cancellation')
    const retry = await client.ejariPdf(input())
    ensure(retry.size>1_000_000,'Retry failed')
    report('PASS fresh worker retry')
    status.textContent='PASS: 4 checks'
  } catch (error) { status.textContent='FAILED'; report(error.stack || String(error)) }
  finally { client.cancel(); button.disabled=false }
}
