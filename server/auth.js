import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const hashOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const fail = (message, status = 400) => Object.assign(Error(message), { status });
export const publicUser = user => ({ id: user.id, email: user.email });
export const cookieName = 'apni_session';

export function credentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail('Enter a valid email address.');
  if (typeof body?.passcode !== 'string' || !/^\d{4}$/.test(body.passcode)) throw fail('Enter exactly four digits for your passcode.');
  return { email, passcode: body.passcode };
}
export async function hashPasscode(passcode) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(passcode, salt, 64, hashOptions);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPasscode(passcode, stored) {
  const [salt, expected] = stored.split(':');
  const actual = await derive(passcode, salt, 64, hashOptions);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
const dummyHash = await hashPasscode('0000');

export function installAuth(app, store, { secureCookies = false } = {}) {
  const { db, transaction } = store;
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' };
  async function session(req, res, user) {
    const raw = token(), expires = Date.now() + 30 * 86400000;
    const previous = readCookie(req);
    await transaction(async () => {
      if (previous) await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous));
      await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
      await db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(raw), user.id, expires);
    });
    res.cookie(cookieName, raw, { ...cookieOptions, maxAge: expires - Date.now() });
  }
  async function throttle(req, email) {
    const now = Date.now();
    const keys = [[`email:${digest(email)}`, 5], [`ip:${digest(req.ip || 'unknown')}`, 30]];
    await transaction(async () => {
      for (const [key, limit] of keys) {
        const row = await db.prepare(`INSERT INTO attempts(key,count,expires_at) VALUES(?,1,?)
          ON CONFLICT(key) DO UPDATE SET
            count=CASE WHEN attempts.expires_at<=? THEN 1 ELSE attempts.count+1 END,
            expires_at=CASE WHEN attempts.expires_at<=? THEN ? ELSE attempts.expires_at END
          RETURNING count`).get(key, now + 15 * 60000, now, now, now + 15 * 60000);
        if (Number(row.count) > limit) throw fail('Too many sign-in attempts. Please try again in 15 minutes.', 429);
      }
    });
  }
  app.use('/api', async (req, res, next) => {
    const raw = readCookie(req);
    req.user = raw ? await db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(digest(raw), Date.now()) : null;
    next();
  });
  app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  for (const action of ['register', 'login']) app.post(`/api/auth/${action}`, async (req, res) => {
    const { email, passcode } = credentials(req.body);
    await throttle(req, email);
    let user = await db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (action === 'register') {
      const passcodeHash = await hashPasscode(passcode);
      user = { id: randomUUID(), email, passcode_hash: passcodeHash };
      const inserted = await db.prepare('INSERT INTO users(id,email,passcode_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id').get(user.id, email, passcodeHash, Date.now());
      if (!inserted) throw fail('Could not create this account. Try signing in instead.');
    } else if (!await checkPasscode(passcode, user?.passcode_hash || dummyHash) || !user) {
      throw fail('Email or passcode is incorrect.', 401);
    }
    await db.prepare('DELETE FROM attempts WHERE key=?').run(`email:${digest(email)}`);
    await session(req, res, user);
    res.status(action === 'register' ? 201 : 200).json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const raw = readCookie(req);
    if (raw) await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(raw));
    res.clearCookie(cookieName, cookieOptions).json({ ok: true });
  });
  app.use('/api', (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' }));
}
function readCookie(req) {
  return req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
}
