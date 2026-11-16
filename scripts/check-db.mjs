import { openPostgresStore } from '../server/postgres.js';

const store = await openPostgresStore(process.env.DATABASE_URL || process.env.POSTGRES_URL);
try {
  const migration = await store.db.prepare('SELECT name FROM migrations WHERE name=?').get('postgres-v1');
  if (!migration) throw Error('Schema is missing. Run npm run db:migrate first.');
  const users = await store.db.prepare('SELECT COUNT(*) AS count FROM users').get();
  const committees = await store.db.prepare('SELECT COUNT(*) AS count FROM committees').get();
  console.log(`Connection OK. Schema ready. ${users.count} accounts; ${committees.count} committees.`);
} catch (error) {
  console.error('Database check failed:', error.code || error.name, 'Check DATABASE_URL and run npm run db:migrate.');
  process.exitCode = 1;
} finally { await store.close(); }
