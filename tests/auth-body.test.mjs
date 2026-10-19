import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { AUTH_BODY_MAX_BYTES, readAuthJson } from '../server/utils/auth-body.ts'

async function withServer(run) {
  const app = createApp({onError:()=>{}})
  app.use(defineEventHandler(async event => {
    const body = await readAuthJson(event,150)
    return {body}
  }))
  const server = createServer(toNodeListener(app))
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  try { await run(server.address().port) }
  finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)) }
}

function send(port, chunks, headers = {}, end = true) {
  return new Promise((resolve,reject) => {
    const req = request({host:'127.0.0.1',port,path:'/',method:'POST',headers:{'content-type':'application/json',...headers}},res=>{
      const parts=[]
      res.on('data',chunk=>parts.push(chunk))
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}))
    })
    req.on('error',reject)
    for (const chunk of chunks) req.write(chunk)
    if (end) req.end()
  })
}

test('bounded auth reader accepts UTF-8 JSON and an exact-limit body', async()=>{
  await withServer(async port=>{
    const value={email:'example@example.com',password:' café 🔒 '}
    const encoded=Buffer.from(JSON.stringify(value))
    const response=await send(port,[encoded.subarray(0,7),encoded.subarray(7)])
    assert.equal(response.status,200)
    assert.deepEqual(JSON.parse(response.body).body,value)
    const exact='"'+'a'.repeat(AUTH_BODY_MAX_BYTES-2)+'"'
    assert.equal((await send(port,[exact])).status,200)
  })
})

test('oversized declared and chunked requests return HTTP 413 and close the connection', async()=>{
  await withServer(async port=>{
    for (const response of [
      await send(port,['{}'],{'content-length':String(AUTH_BODY_MAX_BYTES+1)}),
      await send(port,['"'+'a'.repeat(AUTH_BODY_MAX_BYTES),'"'])
    ]) {
      assert.equal(response.status,413)
      assert.equal(response.headers.connection,'close')
    }
    assert.equal((await send(port,['{}'])).status,200,'rejection must not poison later requests')
  })
})

test('invalid JSON, invalid UTF-8, unsupported media types and compression are rejected', async()=>{
  await withServer(async port=>{
    for (const body of ['','{bad',Buffer.from([0x22,0xff,0x22])]) assert.equal((await send(port,[body])).status,400)
    for (const headers of [{'content-type':'text/plain'},{'content-type':'application/x-www-form-urlencoded'},{'content-encoding':'gzip'}]) {
      assert.equal((await send(port,['{}'],headers)).status,415)
    }
  })
})

test('incomplete request bodies time out and return HTTP 408', async()=>{
  await withServer(async port=>{
    const response=await send(port,['{'],{},false)
    assert.equal(response.status,408)
    assert.equal(response.headers.connection,'close')
  })
})

test('aborted uploads release the reader without crashing later requests', async()=>{
  await withServer(async port=>{
    await new Promise(resolve=>{
      const req=request({host:'127.0.0.1',port,path:'/',method:'POST',headers:{'content-type':'application/json'}})
      req.on('error',()=>{})
      req.on('close',resolve)
      req.write('{')
      setTimeout(()=>req.destroy(),20)
    })
    assert.equal((await send(port,['{}'])).status,200)
  })
})
