import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../server/store.js';
import { createCommittee } from '../server/domain.js';
import { readLocalSnapshot, importLocalSnapshot } from '../server/import-local.js';

test('local import preserves ownership, passcode hashes and memberships, and is idempotent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'apni-import-'));
  let source, destination;
  try {
    source = await openStore(path.join(root, 'source'));
    destination = await openStore(path.join(root, 'destination'));
    source.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('owner', 'owner@example.com', 'existing-passcode-hash', Date.now());
    source.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('member', 'member@example.com', 'member-passcode-hash', Date.now());
    const c = createCommittee({ name: 'Existing committee', amount: 1000, start: '2026-11', bukkiIndex: 0, bukkiFirst: false, members: [{ name: 'Owner', entries: 1 }, { name: 'Member', entries: 1 }] });
    await source.insert(c, 'owner');
    source.db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(c.id, 'member', c.members[1].id);
    const snapshot = await readLocalSnapshot(path.join(root, 'source'));
    const result = await importLocalSnapshot(destination, snapshot);
    assert.deepEqual(result, { users: 2, committees: 1, memberships: 1 });
    assert.equal(destination.db.prepare('SELECT passcode_hash FROM users WHERE id=?').get('owner').passcode_hash, 'existing-passcode-hash');
    assert.equal((await destination.committee(c.id)).owner_id, 'owner');
    assert.deepEqual((await destination.committee(c.id)).committee, c);
    assert.equal(destination.db.prepare('SELECT member_id FROM memberships WHERE user_id=?').get('member').member_id, c.members[1].id);
    assert.deepEqual(await importLocalSnapshot(destination, snapshot), { alreadyImported: true });
    assert.deepEqual(await readLocalSnapshot(path.join(root, 'source')), snapshot);
  } finally {
    source?.close(); destination?.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
test('import refuses a nonempty destination and rolls back invalid data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'apni-import-'));
  const store = await openStore(root);
  try {
    const snapshot = { users: [{ id: 'x', email: 'x@example.com', passcode_hash: 'hash', created_at: 1 }], committees: [{ id: 'c', owner_id: 'missing-user', data: '{}', created_at: 1 }], memberships: [] };
    await assert.rejects(importLocalSnapshot(store, snapshot));
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
    store.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('existing', 'existing@example.com', 'hash', 1);
    await assert.rejects(importLocalSnapshot(store, { users: [], committees: [], memberships: [] }), /already contains/);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  } finally {
    store.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true });
  }
});
