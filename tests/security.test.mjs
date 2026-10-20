import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAuthRedirect} from '../server/utils/auth-redirect.ts'
import {secretFindings,sensitivePath} from '../scripts/check-secrets.mjs'
import {consumeSharedAuthLimit,resolveDeploymentClientIp} from '../server/utils/auth-rate-limit.ts'

test('OAuth returns remain same-origin under browser URL parsing',()=>{
  for(const input of [undefined,null,['/profile-settings'],'https://example.com','//example.com','/\\example.com','/\texample.com','/\n/example.com','/%5cexample.com','/%0d%0alocation:evil','javascript:alert(1)']){
    assert.equal(normalizeAuthRedirect(input),'/profile-settings')
  }
  for(const input of ['/','/profile-settings?tab=logo','/real-estate-guide#example']){
    assert.equal(normalizeAuthRedirect(input),input)
    assert.equal(new URL(normalizeAuthRedirect(input),'https://app.example').origin,'https://app.example')
  }
})

test('production limiter fails closed and trusts the Vercel header only on Vercel',async()=>{
  const key='login:'+ 'a'.repeat(64)
  const response=allowed=>({rpc:async(name,args)=>{assert.equal(name,'consume_auth_rate_limit');assert.deepEqual(args,{p_key:key});return {data:[{allowed,retry_after:20}],error:null}}})
  assert.deepEqual(await consumeSharedAuthLimit(key,response(false)),{allowed:false,retryAfter:20})
  assert.deepEqual(await consumeSharedAuthLimit(key,response(true)),{allowed:true,retryAfter:20})
  for(const data of [null,[],[{allowed:true,retry_after:NaN}],[{allowed:'yes',retry_after:1}]])await assert.rejects(consumeSharedAuthLimit(key,{rpc:async()=>({data,error:null})}),error=>error.statusCode===503)
  await assert.rejects(consumeSharedAuthLimit(key,{rpc:async()=>({data:null,error:{message:'internal database detail'}})}),error=>error.statusCode===503 && !error.message.includes('internal database detail'))
  assert.equal(resolveDeploymentClientIp('127.0.0.1',undefined,[],'203.0.113.9',true),'203.0.113.9')
  assert.equal(resolveDeploymentClientIp('127.0.0.1',undefined,[],'203.0.113.9',false),'127.0.0.1')
})

test('secret scanner redacts values and only exempts explicit password fixtures',()=>{
  const key='ghp_'+'a'.repeat(36)
  const result=secretFindings('token='+key,'app/example.ts')
  assert.deepEqual(result,[{rule:'github-token',line:1}])
  assert.equal(JSON.stringify(result).includes(key),false)
  const statement='password'+": 'password'"
  assert.equal(secretFindings(statement,'tests/auth.test.mjs').length,0)
  assert.equal(secretFindings(statement,'app/example.ts').length,1)
  assert.equal(secretFindings('token='+key,'tests/auth.test.mjs').length,1)
  for(const path of ['.env','.env.production','.vercel/project.json','keys/private.pem','database.sqlite','payroll.xlsx','exports/customers.csv'])assert.equal(sensitivePath(path),true)
  assert.equal(sensitivePath('.env.example'),false)
  assert.equal(sensitivePath('public/ejari-template.pdf'),false)
})
