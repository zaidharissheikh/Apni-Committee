import { DatabaseSync } from 'node:sqlite';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

export async function readLocalSnapshot(dir) {
  const file = path.join(dir, 'committee.sqlite');
  let exists = true;
  try { await access(file); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  if (exists) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      db.exec('BEGIN');
      const snapshot = {
        users: db.prepare('SELECT id,email,passcode_hash,created_at FROM users').all(),
        committees: db.prepare('SELECT * FROM committees').all().map(row => ({ ...row, created_at: row.created_at || Date.parse(JSON.parse(row.data).createdAt) || 0 })),
        memberships: db.prepare('SELECT committee_id,user_id,member_id FROM memberships').all()
      };
      db.exec('COMMIT');
      return snapshot;
    } finally { db.close(); }
  }
  const source = JSON.parse(await readFile(path.join(dir, 'committees.json'), 'utf8'));
  if (!source || !Array.isArray(source.committees) || source.committees.some(c => !c?.id || !Array.isArray(c.members) || !Array.isArray(c.rounds))) throw Error('Invalid legacy JSON source. No data was imported.');
  return {
    users: [], memberships: [],
    committees: source.committees.map(c => ({ id: c.id, owner_id: null, data: JSON.stringify(c), created_at: Date.parse(c.createdAt) || 0 }))
  };
}

export async function importLocalSnapshot(store, snapshot) {
  return store.transaction(async () => {
    await store.lockImport?.();
    if (await store.db.prepare('SELECT 1 FROM migrations WHERE name=?').get('local-import-v1')) return { alreadyImported: true };
    const users = await store.db.prepare('SELECT COUNT(*) AS count FROM users').get();
    const committees = await store.db.prepare('SELECT COUNT(*) AS count FROM committees').get();
    if (Number(users.count) || Number(committees.count)) throw Error('The destination already contains accounts or committees. Use an empty Neon branch. No records were imported.');
    for (const user of snapshot.users) await store.db.prepare('INSERT INTO users(id,email,passcode_hash,created_at) VALUES(?,?,?,?)').run(user.id, user.email, user.passcode_hash, user.created_at);
    for (const c of snapshot.committees) await store.db.prepare('INSERT INTO committees(id,owner_id,data,created_at) VALUES(?,?,?,?)').run(c.id, c.owner_id, c.data, c.created_at);
    for (const m of snapshot.memberships) await store.db.prepare('INSERT INTO memberships(committee_id,user_id,member_id) VALUES(?,?,?)').run(m.committee_id, m.user_id, m.member_id);
    await store.db.prepare('INSERT INTO migrations(name) VALUES(?)').run('local-import-v1');
    return { users: snapshot.users.length, committees: snapshot.committees.length, memberships: snapshot.memberships.length };
  });
}
