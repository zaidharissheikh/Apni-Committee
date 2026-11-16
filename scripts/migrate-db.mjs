import { openPostgresStore } from '../server/postgres.js';

const store = await openPostgresStore(process.env.DATABASE_URL || process.env.POSTGRES_URL);
try {
  await store.migrate();
  console.log('Database schema is ready. Existing records were preserved.');
} catch (error) {
  console.error('Database setup failed:', error.code || error.name, 'Check DATABASE_URL, network access and your Neon database.');
  process.exitCode = 1;
} finally { await store.close(); }
