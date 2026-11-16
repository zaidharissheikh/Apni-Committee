import { openRuntimeStore } from '../server/runtime.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw Error('Usage: npm run claim-legacy -- your@email.com (create this account in the app first).');
const store = await openRuntimeStore();
try {
  const user = await store.db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!user) throw Error('Create this account in the app first. No records were reassigned.');
  const result = await store.db.prepare('UPDATE committees SET owner_id=? WHERE owner_id IS NULL').run(user.id);
  console.log(`Assigned ${result.changes} legacy committees to ${email}. Existing account-owned committees were left unchanged.`);
} finally { await store.close(); }
