const origin = process.argv[2];
if (!origin) throw Error('Usage: npm run deploy:check -- https://your-project.vercel.app');
const url = new URL(origin);
if (!['https:', 'http:'].includes(url.protocol)) throw Error('Supply an HTTP(S) deployment URL.');
const base = url.origin;
async function request(path) {
  return fetch(base + path, { redirect: 'error', signal: AbortSignal.timeout(20000) });
}
try {
  const page = await request('/');
  if (!page.ok || !page.headers.get('content-type')?.includes('text/html')) throw Error('The app page did not return HTML. Check deployment protection and routing.');
  const html = await page.text();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]).filter(p => p.startsWith('/'));
  if (!scripts.length || scripts.some(p => p.includes('/src/'))) throw Error('The built frontend bundle is missing. Check the build output directory.');
  for (const script of scripts) {
    const asset = await request(script);
    if (!asset.ok || !/javascript/.test(asset.headers.get('content-type') || '')) throw Error('A JavaScript asset is missing or being rewritten to HTML.');
  }
  const health = await request('/api/health');
  if (!health.ok || !(await health.json()).ok) throw Error('The database health check failed. Check DATABASE_URL and run db:migrate.');
  const me = await request('/api/auth/me');
  if (!me.ok || (await me.json()).user !== null) throw Error('Anonymous authentication check returned an unexpected result.');
  const committees = await request('/api/committees');
  if (committees.status !== 401) throw Error('Anonymous committee access was not rejected.');
  console.log('Deployment check passed: app HTML, JavaScript assets, database health, authentication and private API access.');
} catch (error) {
  console.error('Deployment check failed:', error.message);
  process.exitCode = 1;
}
