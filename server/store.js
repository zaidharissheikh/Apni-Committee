import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { schema, storeMethods } from './schema.js';

export async function openStore(dir) {
  await mkdir(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'committee.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(schema);
  // Upgrade local databases created before the hosted-storage adapter.
  if (!db.prepare('PRAGMA table_info(committees)').all().some(c => c.name === 'created_at')) {
    db.exec('ALTER TABLE committees ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0');
    for (const row of db.prepare('SELECT id,data FROM committees').all()) db.prepare('UPDATE committees SET created_at=? WHERE id=?').run(Date.parse(JSON.parse(row.data).createdAt) || 0, row.id);
  }
  const context = new AsyncLocalStorage();
  let queue = Promise.resolve();
  function transaction(fn) {
    if (context.getStore()) return fn();
    const job = queue.then(() => context.run(true, async () => {
      db.exec('BEGIN IMMEDIATE');
      try { const value = await fn(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }));
    queue = job.catch(() => {});
    return job;
  }
  if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get('legacy-json')) {
    let legacy;
    try { legacy = JSON.parse(await readFile(path.join(dir, 'committees.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') { db.close(); throw error; } }
    if (legacy !== undefined && (!legacy || !Array.isArray(legacy.committees) || legacy.committees.some(c => !c || !c.id || !Array.isArray(c.members) || !Array.isArray(c.rounds)))) {
      db.close(); throw Error('Invalid legacy committee file. Restore a valid backup before starting.');
    }
    await transaction(() => {
      for (const c of legacy?.committees || []) db.prepare('INSERT INTO committees(id,owner_id,data,created_at) VALUES(?,NULL,?,?)').run(c.id, JSON.stringify(c), Date.parse(c.createdAt) || 0);
      db.prepare('INSERT INTO migrations(name) VALUES(?)').run('legacy-json');
    });
  }
  return {
    kind: 'sqlite', db, transaction,
    ...storeMethods(db),
    close() { db.close(); }
  };
}
