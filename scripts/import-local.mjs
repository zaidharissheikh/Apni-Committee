import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPostgresStore } from '../server/postgres.js';
import { readLocalSnapshot, importLocalSnapshot } from '../server/import-local.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.COMMITTEE_DATA_DIR || path.join(root, 'data');
const snapshot = await readLocalSnapshot(dir);
console.log(`Local source: ${snapshot.users.length} accounts, ${snapshot.committees.length} committees, ${snapshot.memberships.length} memberships.`);
if (!process.argv.includes('--apply')) {
  console.log('Preview only. After confirming DATABASE_URL targets an empty Neon database, run npm run db:import-local -- --apply.');
} else {
  const store = await openPostgresStore(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  try {
    await store.migrate();
    const result = await importLocalSnapshot(store, snapshot);
    console.log(result.alreadyImported ? 'This import already completed. No records changed.' : `Imported ${result.users} accounts, ${result.committees} committees and ${result.memberships} memberships. Sign in with your existing email and passcode.`);
    console.log('Local source files were left unchanged. Browser sessions and invite links are not migrated; sign in and generate new links on the hosted app.');
  } catch (error) {
    console.error('Import failed:', error.code || error.message);
    process.exitCode = 1;
  } finally { await store.close(); }
}
