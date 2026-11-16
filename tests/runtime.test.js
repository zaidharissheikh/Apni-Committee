import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import handler from '../api/index.js';
import { openRuntimeStore, runtimeOptions } from '../server/runtime.js';

test('hosted runtime refuses SQLite fallback and uses secure cookies', async () => {
  const keys=['VERCEL','DATABASE_URL','POSTGRES_URL','APP_ORIGIN','TRUST_PROXY'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    process.env.VERCEL='1';delete process.env.DATABASE_URL;delete process.env.POSTGRES_URL;delete process.env.TRUST_PROXY;
    await assert.rejects(openRuntimeStore(),/Connect a Neon database/);
    assert.equal(runtimeOptions().secureCookies,true);
    assert.equal(runtimeOptions().trustProxy,1);
  } finally { for(const key of keys) original[key]===undefined?delete process.env[key]:process.env[key]=original[key]; }
});

test('serverless handler serves real API paths and closes its invocation store', async () => {
  const keys=['VERCEL','DATABASE_URL','POSTGRES_URL','COMMITTEE_DATA_DIR','APP_ORIGIN'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const dir=await mkdtemp(path.join(tmpdir(),'apni-runtime-'));
  let server;
  try {
    for(const key of keys) delete process.env[key];
    process.env.COMMITTEE_DATA_DIR=dir;
    server=createServer((req,res)=>{
      res.status=code=>{res.statusCode=code;return res;};
      res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
      handler(req,res).catch(error=>{if(!res.writableEnded){res.statusCode=500;res.end(error.message);}});
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(await (await fetch(base+'/api/health')).json(),{ok:true});
    assert.deepEqual(await (await fetch(base+'/api/auth/me')).json(),{user:null});
    assert.equal((await fetch(base+'/api/committees')).status,401);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    for(const key of keys) original[key]===undefined?delete process.env[key]:process.env[key]=original[key];
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
    // Handler cleanup runs after response completion; wait for this event loop turn.
    await new Promise(resolve=>setImmediate(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
