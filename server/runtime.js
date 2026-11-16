import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function openRuntimeStore() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (connectionString) {
    const { openPostgresStore } = await import('./postgres.js');
    return openPostgresStore(connectionString);
  }
  if (process.env.VERCEL) throw Error('Connect a Neon database and configure DATABASE_URL before deploying.');
  const { openStore } = await import('./store.js');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return openStore(process.env.COMMITTEE_DATA_DIR || path.join(root, 'data'));
}

export function runtimeOptions() {
  return {
    publicOrigin: process.env.APP_ORIGIN,
    secureCookies: Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    trustProxy: process.env.TRUST_PROXY || (process.env.VERCEL ? 1 : false)
  };
}
