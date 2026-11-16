import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { createCommittee } from '../server/domain.js';
import { digest } from '../server/auth.js';

async function fixture(t, options, legacySource) {
  const dir = await mkdtemp(path.join(tmpdir(), 'apni-access-'));
  if (legacySource) await writeFile(path.join(dir, 'committees.json'), legacySource);
  const store = await openStore(dir);
  const server = createApp(store, options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve)); store.close();
    const target = path.resolve(dir);
    assert.ok(target.startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(target, { recursive: true, force: true });
  });
  function client() {
    let cookie = '';
    return {
      get cookie() { return cookie; },
      async request(route, body, method, headers = {}) {
        const response = await fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const nextCookie = response.headers.get('set-cookie');
        if (nextCookie) cookie = nextCookie.split(';')[0];
        return { status: response.status, data: await response.json(), headers: response.headers };
      }
    };
  }
  return { store, dir, client };
}
const committeeInput = { name: 'Private family', amount: 1000, start: '2026-11', bukkiIndex: 0, bukkiFirst: false, members: [{ name: 'Bukki', entries: 1 }, { name: 'Existing member', entries: 1 }] };
async function register(client, email, passcode = '0123') {
  const response = await client.request('auth/register', { email, passcode });
  assert.equal(response.status, 201, JSON.stringify(response.data)); return response;
}
test('accounts isolate committees; invite joins are idempotent; every admin route rejects members', async t => {
  const { client, store } = await fixture(t), owner = client(), member = client(), outsider = client();
  assert.equal((await outsider.request('committees')).status, 401);
  const registration = await register(owner, ' BUKKI@example.com ');
  assert.equal(registration.data.user.email, 'bukki@example.com');
  assert.match(registration.headers.get('set-cookie'), /HttpOnly/);
  assert.match(registration.headers.get('set-cookie'), /SameSite=Lax/);
  assert.equal('passcode_hash' in registration.data.user, false);
  const saved = store.db.prepare('SELECT * FROM users').get();
  assert.notEqual(saved.passcode_hash, '0123');
  assert.equal(store.db.prepare('SELECT token_hash FROM sessions').get().token_hash.includes(owner.cookie.split('=')[1]), false);
  await register(member, 'member@example.com'); await register(outsider, 'outsider@example.com');
  let { data: c } = await owner.request('committees', committeeInput);
  assert.equal(c.role, 'bukki');
  assert.deepEqual((await member.request('committees')).data, []);
  assert.equal((await member.request(`committees/${c.id}`)).status, 404);
  assert.equal((await member.request(`committees/${c.id}`, { confirmationName: c.name }, 'DELETE')).status, 404);
  const { data: invite } = await owner.request(`committees/${c.id}/invites`, {});
  assert.equal((await outsider.request(`invites/${invite.token}/join`, {}, 'POST', { Origin: 'https://evil.example' })).status, 403);
  const joined = await member.request(`invites/${invite.token}/join`, {});
  assert.equal(joined.status, 200); assert.equal(joined.data.role, 'member');
  assert.equal(joined.data.members.length, 3); assert.equal(joined.data.members.at(-1).entries, 0);
  assert.equal(joined.data.entries.length, 2); assert.equal(joined.data.rounds.length, 2);
  const again = await member.request(`invites/${invite.token}/join`, {});
  assert.equal(again.data.members.length, 3);
  assert.equal((await member.request('committees')).data.length, 1);
  assert.deepEqual((await outsider.request('committees')).data, []);
  for (const action of ['draw', 'payment', 'payout', 'members', 'shares', 'invites']) assert.equal((await member.request(`committees/${c.id}/${action}`, { roundId: c.rounds[0].id, name: 'Intruder', entries: 1 })).status, 403, action);
  assert.equal((await member.request(`committees/${c.id}`, { confirmationName: c.name }, 'DELETE')).status, 403);
  assert.equal((await member.request(`committees/${c.id}/invites`, {}, 'DELETE')).status, 403);
  c = (await owner.request(`committees/${c.id}/shares`, { memberId: joined.data.members.at(-1).id, entries: 2 })).data;
  assert.equal(c.entries.length, 4); assert.equal(c.rounds.length, 4);
  assert.equal(c.members.at(-1).linked, true);
  assert.equal((await owner.request(`committees/${c.id}/payment`, { roundId: c.rounds[0].id, memberId: c.bukkiId, paid: true })).status, 200);
  assert.equal((await owner.request(`committees/${c.id}/members`, { name: 'Too late', entries: 1 })).status, 400);
  assert.equal((await owner.request(`committees/${c.id}/members`, { name: 'Late viewer', entries: 0 })).status, 200);
  await owner.request(`committees/${c.id}/invites`, {}, 'DELETE');
  assert.equal((await outsider.request(`invites/${invite.token}/join`, {})).status, 404);
  assert.equal((await member.request(`committees/${c.id}`)).status, 200);
  const originalCookie = owner.cookie;
  await owner.request('auth/logout', {});
  assert.equal((await owner.request('committees')).status, 401);
  assert.equal((await outsider.request('committees', undefined, 'GET', { Cookie: originalCookie })).status, 401);
  assert.equal((await owner.request('auth/login', { email: 'BUKKI@example.com', passcode: '0123' })).status, 200);
});
test('targeted invites link existing shares, rotate, expire, and cannot be claimed by two users', async t => {
  const { client, store } = await fixture(t), owner = client(), first = client(), second = client();
  await register(owner, 'owner@example.com'); await register(first, 'first@example.com'); await register(second, 'second@example.com');
  const { data: c } = await owner.request('committees', committeeInput);
  const target = { memberId: c.members[1].id };
  const old = (await owner.request(`committees/${c.id}/invites`, target)).data;
  const invite = (await owner.request(`committees/${c.id}/invites`, target)).data;
  assert.equal((await first.request(`invites/${old.token}/join`, {})).status, 404);
  const joins = await Promise.all([first.request(`invites/${invite.token}/join`, {}), second.request(`invites/${invite.token}/join`, {})]);
  assert.deepEqual(joins.map(x => x.status).sort(), [200, 409]);
  assert.equal(joins.find(x => x.status === 200).data.members.length, 2);
  assert.equal(joins.find(x => x.status === 200).data.entries.length, 2);
  const general = (await owner.request(`committees/${c.id}/invites`, {})).data;
  store.db.prepare('UPDATE invites SET expires_at=0 WHERE token_hash=?').run(digest(general.token));
  assert.equal((await second.request(`invites/${general.token}/join`, {})).status, 404);
  assert.equal((await second.request('invites/not-valid/join', {})).status, 404);
  assert.equal((await owner.request(`committees/${c.id}/invites`, { memberId: c.bukkiId })).status, 400);
  assert.equal((await owner.request(`committees/${c.id}`, { confirmationName: 'wrong' }, 'DELETE')).status, 400);
  assert.equal((await owner.request(`committees/${c.id}`, { confirmationName: c.name }, 'DELETE')).status, 200);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM memberships').get().n, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM invites').get().n, 0);
});
test('passcodes validate strictly, failures throttle persistently, and expired sessions stop working', async t => {
  const { client, store } = await fixture(t), owner = client();
  for (const passcode of ['123', '12345', 'abcd', 1234]) assert.equal((await owner.request('auth/register', { email: 'owner@example.com', passcode })).status, 400);
  await register(owner, 'owner@example.com');
  await owner.request('auth/logout', {});
  for (let i = 0; i < 5; i++) assert.equal((await owner.request('auth/login', { email: 'owner@example.com', passcode: '9999' })).status, 401);
  assert.equal((await owner.request('auth/login', { email: 'owner@example.com', passcode: '0123' })).status, 429);
  store.db.prepare('UPDATE attempts SET expires_at=0').run();
  assert.equal((await owner.request('auth/login', { email: 'owner@example.com', passcode: '0123' })).status, 200);
  store.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await owner.request('committees')).status, 401);
  assert.deepEqual((await owner.request('auth/me')).data, { user: null });
});
test('legacy migration preserves source and records without granting ownership to a new signup', async t => {
  const c = createCommittee(committeeInput), source = JSON.stringify({ committees: [c] });
  const { dir, client, store } = await fixture(t, undefined, source);
  assert.equal((await store.committee(c.id)).owner_id, null);
  assert.deepEqual((await store.committee(c.id)).committee, c);
  assert.equal(await readFile(path.join(dir, 'committees.json'), 'utf8'), source);
  const account = client(); await register(account, 'new@example.com');
  assert.deepEqual((await account.request('committees')).data, []);
  const reopened = await openStore(dir);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM committees').get().n, 1);
  reopened.close();
});
test('production origin checks, secure cookies, and per-account demos remain isolated', async t => {
  const origin='https://committee.example.com';
  const { client }=await fixture(t,{publicOrigin:origin,secureCookies:true}), owner=client(), other=client();
  const auth=await owner.request('auth/register',{email:'owner@example.com',passcode:'1234'},'POST',{Origin:origin});
  assert.equal(auth.status,201);assert.match(auth.headers.get('set-cookie'),/; Secure/);
  assert.equal((await other.request('auth/register',{email:'other@example.com',passcode:'1234'},'POST',{Origin:'https://wrong.example.com'})).status,403);
  assert.equal((await other.request('auth/register',{email:'other@example.com',passcode:'1234'},'POST',{'Content-Type':'text/plain'})).status,415);
  await register(other,'other@example.com');
  const first=(await owner.request('demo',{})).data;
  assert.equal((await owner.request('demo',{})).data.id,first.id);
  assert.deepEqual((await other.request('committees')).data,[]);
  const second=(await other.request('demo',{})).data;
  assert.notEqual(second.id,first.id);
  assert.equal((await other.request(`committees/${first.id}`)).status,404);
  assert.equal((await owner.request('committees')).data.length,1);
});
test('database sessions and account lockouts survive opening the store again', async t => {
  const { client,dir }=await fixture(t), owner=client();
  await register(owner,'owner@example.com');
  const cookie=owner.cookie;
  for(let i=0;i<5;i++) await owner.request('auth/login',{email:'blocked@example.com',passcode:'1234'});
  const reopened=await openStore(dir);
  try{
    assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash=?').get(digest(cookie.split('=')[1])).n,1);
    assert.equal(reopened.db.prepare('SELECT count FROM attempts WHERE key=?').get('email:'+digest('blocked@example.com')).count,5);
    assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
  }finally{reopened.close();}
});
test('invalid legacy files stop migration and leave the original source intact', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'apni-invalid-'));
  try {
    for(const source of ['{broken','null','{"committees":[null]}']) {
      await writeFile(path.join(dir,'committees.json'),source);
      await assert.rejects(()=>openStore(dir));
      assert.equal(await readFile(path.join(dir,'committees.json'),'utf8'),source);
    }
  }finally{
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));
    await rm(dir,{recursive:true,force:true});
  }
});
