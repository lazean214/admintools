import { readFileSync, writeFileSync } from 'node:fs'

// JSON transport prevents PDF download extensions from intercepting the source
// template fetch before the application has added any values.
const bytes = readFileSync(new URL('../public/ejari-template.pdf',import.meta.url))
writeFileSync(new URL('../public/ejari-template-data.json',import.meta.url),JSON.stringify({encoding:'base64',data:bytes.toString('base64')})+'\n')
