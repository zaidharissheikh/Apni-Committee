import { AsyncLocalStorage } from 'node:async_hooks';
import { schema, storeMethods } from './schema.js';

export function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Each transaction uses one dedicated client; AsyncLocalStorage keeps concurrent
// requests from sharing a transaction when Vercel runs them in one process.
export function createPostgresStore(pool) {
  const context = new AsyncLocalStorage();
  function query(sql, values = []) { return (context.getStore() || pool).query(postgresSql(sql), values); }
  const db = {
    prepare(sql) {
      return {
        async all(...values) { return (await query(sql, values)).rows; },
        async get(...values) { return (await query(sql, values)).rows[0]; },
        async run(...values) { const result = await query(sql, values); return { changes: result.rowCount }; }
      };
    },
    async exec(sql) { await query(sql); }
  };
  async function transaction(fn) {
    if (context.getStore()) return fn();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await context.run(client, fn);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  return {
    kind: 'postgres', db, transaction, ...storeMethods(db, { lockReads: true }),
    async lockImport() { await query('SELECT pg_advisory_xact_lock(72861941)'); },
    async migrate() {
      await transaction(async () => {
        // Serialize schema installation across concurrent deploys.
        await query('SELECT pg_advisory_xact_lock(72861940)');
        for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await query(statement);
        await query('INSERT INTO migrations(name) VALUES(?) ON CONFLICT(name) DO NOTHING', ['postgres-v1']);
      });
    },
    close() { return pool.end(); }
  };
}

export async function openPostgresStore(connectionString) {
  if (!connectionString) throw Error('DATABASE_URL is required for hosted storage.');
  let url;
  try { url = new URL(connectionString); }
  catch { throw Error('DATABASE_URL is not a valid connection string. Check its value without sharing it publicly.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('DATABASE_URL must be a Postgres connection string.');
  // The Neon driver uses TLS WebSockets and Node 22+ native WebSocket support.
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 15000, idleTimeoutMillis: 5000 });
  pool.on('error', () => console.error('An idle database connection closed.'));
  return createPostgresStore(pool);
}
