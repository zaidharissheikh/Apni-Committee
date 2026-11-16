// Shared schema. SQLite accepts BIGINT; Postgres needs it for millisecond timestamps.
export const schema = `
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, passcode_hash TEXT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS committees(id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id), data TEXT NOT NULL, created_at BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS memberships(committee_id TEXT NOT NULL REFERENCES committees(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), member_id TEXT NOT NULL, PRIMARY KEY(committee_id,user_id), UNIQUE(committee_id,member_id));
CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, committee_id TEXT NOT NULL REFERENCES committees(id) ON DELETE CASCADE, member_id TEXT, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS invite_options(token_hash TEXT PRIMARY KEY REFERENCES invites(token_hash) ON DELETE CASCADE, entries INTEGER NOT NULL CHECK(entries BETWEEN 1 AND 12), used_by TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);
CREATE INDEX IF NOT EXISTS committees_owner ON committees(owner_id);
CREATE INDEX IF NOT EXISTS memberships_user ON memberships(user_id);
`;

export function storeMethods(db, { lockReads = false } = {}) {
  return {
    async lockUser(id) { await db.prepare('SELECT id FROM users WHERE id=?' + (lockReads ? ' FOR UPDATE' : '')).get(id); },
    async save(c) { await db.prepare('UPDATE committees SET data=? WHERE id=?').run(JSON.stringify(c), c.id); },
    async insert(c, ownerId) { await db.prepare('INSERT INTO committees(id,owner_id,data,created_at) VALUES(?,?,?,?)').run(c.id, ownerId, JSON.stringify(c), Date.parse(c.createdAt) || Date.now()); },
    async committee(id, { lock = false } = {}) {
      const row = await db.prepare('SELECT * FROM committees WHERE id=?' + (lock && lockReads ? ' FOR UPDATE' : '')).get(id);
      return row && { ...row, committee: JSON.parse(row.data) };
    }
  };
}
