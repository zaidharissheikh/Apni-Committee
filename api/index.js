import { createApp } from '../server/app.js';
import { openRuntimeStore, runtimeOptions } from '../server/runtime.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let store;
  try {
    // Neon WebSocket pools belong to a single invocation and close on completion.
    store = await openRuntimeStore();
    const app = createApp(store, runtimeOptions());
    await new Promise((resolve, reject) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      res.once('error', reject);
      app(req, res);
    });
  } catch (error) {
    console.error('API unavailable:', error.code || error.name);
    if (!res.headersSent) res.status(503).json({ error: 'The service could not connect to its database. Please try again shortly.' });
  } finally { if (store) { try { await store.close(); } catch {} } }
}
