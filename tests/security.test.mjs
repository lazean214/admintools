import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeAuthRedirect} from '../server/utils/auth-redirect.ts'
import {secretFindings,sensitivePath} from '../scripts/check-secrets.mjs'

test('OAuth returns remain same-origin under browser URL parsing',()=>{
  for(const input of [undefined,null,['/profile-settings'],'https://example.com','//example.com','/\\example.com','/\texample.com','/\n/example.com','/%5cexample.com','/%0d%0alocation:evil','javascript:alert(1)']){
    assert.equal(normalizeAuthRedirect(input),'/profile-settings')
  }
  for(const input of ['/','/profile-settings?tab=logo','/real-estate-guide#example']){
    assert.equal(normalizeAuthRedirect(input),input)
    assert.equal(new URL(normalizeAuthRedirect(input),'https://app.example').origin,'https://app.example')
  }
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
  for(const path of ['.env','.env.production','.vercel/project.json','keys/private.pem','database.sqlite'])assert.equal(sensitivePath(path),true)
  assert.equal(sensitivePath('.env.example'),false)
  assert.equal(sensitivePath('public/ejari-template.pdf'),false)
})
