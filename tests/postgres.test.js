import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresStore, postgresSql } from '../server/postgres.js';

function fakePool() {
  const events = [];
  let serial = 0, failSql;
  function runner(id) {
    return {
      async query(sql, params = []) {
        events.push({ id, sql, params });
        if (sql === failSql) throw Error('Simulated query failure');
        return { rows: [{ id: 'committee', owner_id: 'owner', data: '{"id":"committee","members":[],"rounds":[]}' }], rowCount: 1 };
      },
      release() { events.push({ id, sql: 'RELEASE' }); }
    };
  }
  return {
    events, query: (...args) => runner('pool').query(...args),
    async connect() { return runner(++serial); },
    async end() { events.push({ sql: 'END' }); },
    fail(sql) { failSql = sql; }
  };
}
test('Postgres adapter keeps values parameterized and converts result shapes', async () => {
  assert.equal(postgresSql('SELECT * FROM committees WHERE id=? AND owner_id=?'), 'SELECT * FROM committees WHERE id=$1 AND owner_id=$2');
  const pool = fakePool(), store = createPostgresStore(pool);
  const value = "value'); DROP TABLE users; --";
  await store.db.prepare('SELECT * FROM users WHERE email=?').get(value);
  assert.equal(pool.events[0].sql, 'SELECT * FROM users WHERE email=$1');
  assert.deepEqual(pool.events[0].params, [value]);
  assert.deepEqual(await store.db.prepare('DELETE FROM users WHERE id=?').run('x'), { changes: 1 });
});
test('concurrent transactions use separate clients and nested work stays on its owning client', async () => {
  const pool = fakePool(), store = createPostgresStore(pool);
  await Promise.all(['first', 'second'].map(value => store.transaction(async () => {
    await store.db.prepare('SELECT ?').get(value);
    await Promise.resolve();
    await store.transaction(() => store.db.prepare('SELECT ?').get(value + '-nested'));
  })));
  for (const [id, value] of [[1, 'first'], [2, 'second']]) {
    const events = pool.events.filter(e => e.id === id);
    assert.deepEqual(events.map(e => e.sql), ['BEGIN', 'SELECT $1', 'SELECT $1', 'COMMIT', 'RELEASE']);
    assert.deepEqual(events[1].params, [value]);
    assert.deepEqual(events[2].params, [value + '-nested']);
  }
  assert.equal(pool.events.some(e => e.id === 'pool'), false);
});
test('failed transactions roll back and release clients without committing', async () => {
  const pool = fakePool(), store = createPostgresStore(pool);
  pool.fail('UPDATE broken SET id=$1');
  await assert.rejects(store.transaction(() => store.db.prepare('UPDATE broken SET id=?').run('bad')), /Simulated/);
  assert.deepEqual(pool.events.map(e => e.sql), ['BEGIN', 'UPDATE broken SET id=$1', 'ROLLBACK', 'RELEASE']);
});
test('committee writes acquire row locks; schema setup uses an advisory lock', async () => {
  const pool = fakePool(), store = createPostgresStore(pool);
  await store.transaction(() => store.committee('committee', { lock: true }));
  assert.ok(pool.events.some(e => e.sql === 'SELECT * FROM committees WHERE id=$1 FOR UPDATE'));
  await store.migrate();
  assert.ok(pool.events.some(e => e.sql === 'SELECT pg_advisory_xact_lock(72861940)'));
  assert.ok(pool.events.some(e => e.sql.includes('expires_at BIGINT')));
});
