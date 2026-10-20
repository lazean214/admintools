import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

test('SQL migrations deny public data access and atomically enforce shared auth budgets',async()=>{
  const db=new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;')
    for(const path of ['supabase/schema.sql','supabase/migrations/202610190001_server_only_tables.sql','supabase/migrations/202610190002_shared_auth_limits.sql'])await db.exec(await readFile(path,'utf8'))
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role)
      for(const table of ['auth_users','auth_sessions','guide_articles','auth_rate_limits'])await assert.rejects(db.query('select * from public.'+table),/permission denied/)
      await assert.rejects(db.query('select * from public.consume_auth_rate_limit($1)',['login:'+'a'.repeat(64)]),/permission denied/)
      await db.exec('reset role')
    }
    const secured=await db.query("select relname,relrowsecurity from pg_class where relname in ('auth_users','auth_sessions','guide_articles','auth_rate_limits')")
    assert.equal(secured.rows.length,4);assert.equal(secured.rows.every(row=>row.relrowsecurity),true)
    await db.exec('set role service_role')
    for(const table of ['auth_users','auth_sessions','guide_articles','auth_rate_limits'])await db.query('select * from public.'+table)
    for(const [scope,limit] of [['login',30],['register',10]]){
      const key=scope+':'+'a'.repeat(64)
      const consume=()=>db.query('select * from public.consume_auth_rate_limit($1)',[key])
      const admitted=await Promise.all(Array.from({length:limit+2},consume))
      assert.equal(admitted.filter(result=>result.rows[0].allowed).length,limit)
      assert.equal(admitted.at(-1).rows[0].allowed,false)
      await db.query("update public.auth_rate_limits set expires_at=now()-interval '1 second' where key=$1",[key])
      assert.equal((await consume()).rows[0].allowed,true)
    }
    await assert.rejects(db.query('select * from public.consume_auth_rate_limit($1)',['invalid']),/Invalid rate limit key/)
  } finally {await db.close()}
})
