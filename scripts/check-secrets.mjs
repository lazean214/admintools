import {execFileSync} from 'node:child_process'
import {readFileSync,lstatSync,readdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

export function secretFindings(text,path) {
  const rules=[
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
    ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
    ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{10,}/g],
    ['google-api-key',/\bAIza[A-Za-z0-9_-]{30,}/g],
    ['google-oauth-secret',/\bGOCSPX-[A-Za-z0-9_-]{15,}/g],
    ['slack-token',/\bxox[baprs]-[A-Za-z0-9-]{15,}/g],
    ['npm-token',/\bnpm_[A-Za-z0-9]{36,}\b/g],
    ['api-secret',/\b(?:sk_live_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{30,})/g],
    ['jwt',/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
    ['credential-url',/\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|https?):\/\/[^\s/@:$]+:[^\s/@$]+@/g],
    ['hardcoded-secret',/\b(?:[A-Z_]*(?:SERVICE_ROLE_KEY|CLIENT_SECRET|API_KEY|ACCESS_TOKEN|SECRET_KEY)|client_secret|api_key|service_role_key)\s*[=:]\s*["']([^"'\r\n]{8,})["']/g],
    ['hardcoded-password',/\bpassword\s*[=:]\s*["']([^"'\r\n]{8,})["']/gi],
  ]
  const findings=[]
  for(const [rule,pattern] of rules)for(const match of text.matchAll(pattern)){
    const value=match[1]??match[0]
    if(['hardcoded-secret','hardcoded-password'].includes(rule) && /^(?:your[_ -]|example[_ -]|placeholder|<|\$\{)/i.test(value))continue
    // These exact literals exercise password encoding/normalization, not accounts.
    if(rule==='hardcoded-password' && /^tests\/auth(?:-body)?\.test\.mjs$/.test(path) && ['password','  password  ','new password','  Existing café password 🔒  ',' café 🔒 '].includes(value))continue
    findings.push({rule,line:text.slice(0,match.index).split('\n').length})
  }
  return findings
}

export function sensitivePath(path) {
  if(/(?:^|\/)\.env\.example$/.test(path))return false
  if(/\.(?:csv|xlsx?)$/i.test(path) && !/^tests\/fixtures\//.test(path))return true
  return /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|credentials\.json|service-account[^/]*\.json|[^/]*-service-account\.json|\.vercel\/.*|\.aws\/.*|\.ssh\/.*)$|\.(?:pem|key|p12|pfx|jks|keystore|sqlite3?|db|dump|backup)$/i.test(path)
}

function run() {
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
  const git=(args,input)=>execFileSync('git',args,{cwd:root,input,maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe']})
  const findings=[],seen=new Set()
  const report=(path,location,entries)=>{for(const entry of entries){const item={path,location,...entry};const key=JSON.stringify(item);if(!seen.has(key)){seen.add(key);findings.push(item)}}}
  const inspect=(path,location,raw)=>{
    if(sensitivePath(path))report(path,location,[{rule:'private-file',line:1}])
    if(raw.subarray(0,8192).includes(0))return
    report(path,location,secretFindings(raw.toString('utf8'),path))
  }
  const files=git(['ls-files','--cached','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean)
  for(const path of new Set(files)){
    let info
    try{info=lstatSync(resolve(root,path))}catch{continue}
    if(info.isFile())inspect(path,'working-tree',readFileSync(resolve(root,path)))
  }
  if(process.argv.includes('--public-build')){
    const publicRoot=resolve(root,'.output/public')
    if(!existsSync(publicRoot))throw new Error('Build output is missing.')
    const walk=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){
      const path=resolve(directory,entry.name)
      if(entry.isDirectory())walk(path)
      else if(entry.isFile())inspect('.output/public/'+path.slice(publicRoot.length+1).replaceAll('\\','/'),'public-build',readFileSync(path))
    }}
    walk(publicRoot)
    const manifest=JSON.parse(readFileSync(resolve(root,'.output/server/package.json'),'utf8'))
    for(const name of ['braces','node-forge'])if(manifest.dependencies?.[name])report('.output/server/package.json','server-build',[{rule:'development-only-vulnerable-package-in-runtime',line:1}])
  }
  const objects=new Map()
  for(const record of git(['ls-files','--stage','-z']).toString().split('\0').filter(Boolean)){
    const [meta,path]=record.split('\t');objects.set(meta.split(' ')[1],{path,location:'index'})
  }
  if(process.argv.includes('--history'))for(const entry of git(['rev-list','--objects','--all']).toString().split('\n')){
    const index=entry.indexOf(' ');if(index<0)continue
    objects.set(entry.slice(0,index),{path:entry.slice(index+1),location:'history:'+entry.slice(0,12)})
  }
  // Batch Git reads instead of invoking a process for every historical blob.
  const ids=[...objects.keys()]
  if(ids.length){
    const metadata=git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],ids.join('\n')+'\n').toString()
    const blobs=metadata.trim().split('\n').filter(line=>line.split(' ')[1]==='blob').map(line=>line.split(' ')[0])
    const binary=/\.(?:pdf|wasm|png|jpe?g|gif|ico|woff2?|zip|gz|rlib|rmeta|exe|dll|so|a|lib|o|pdb|bin)$/i
    const textBlobs=blobs.filter(id=>!binary.test(objects.get(id).path))
    const sizes=new Map(metadata.trim().split('\n').map(line=>{const [id,,size]=line.split(' ');return [id,Number(size)]}))
    const batches=[];let batch=[],bytes=0
    for(const id of textBlobs){
      const size=sizes.get(id)
      if(size>16*1024*1024){const {path,location}=objects.get(id);report(path,location,[{rule:'oversized-file-needs-manual-review',line:1}]);continue}
      if(bytes+size>16*1024*1024 && batch.length){batches.push(batch);batch=[];bytes=0}
      batch.push(id);bytes+=size
    }
    if(batch.length)batches.push(batch)
    for(const batch of batches){
      const content=git(['cat-file','--batch'],batch.join('\n')+'\n')
      let offset=0
      for(const id of batch){
        const end=content.indexOf(10,offset),header=content.subarray(offset,end).toString(),size=Number(header.split(' ')[2])
        if(!Number.isSafeInteger(size))throw new Error('Could not inspect a Git object.')
        const {path,location}=objects.get(id)
        inspect(path,location,content.subarray(end+1,end+1+size));offset=end+size+2
      }
    }
  }
  if(findings.length){
    // Never print a source line, matched secret, Git diff or credential value.
    for(const item of findings)console.error(JSON.stringify(item))
    console.error('Potential secrets/private files found. Review locally; values are redacted.')
    process.exitCode=1
  }else console.log('Secret pattern check passed for working tree, Git index'+(process.argv.includes('--history')?', reachable history':'')+(process.argv.includes('--public-build')?', published assets and server dependency manifest':'')+'. Heuristic scan; manually review binary assets.')
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{run()}catch{console.error('Secret check could not complete. No matched values were printed.');process.exitCode=1}
}
