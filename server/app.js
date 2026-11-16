import express from 'express';
import { createCommittee, draw, payment, payout, addMember, assignShares, sharesLocked, catchup, topup } from './domain.js';
import { installAuth, digest, token, fail } from './auth.js';

export function createApp(store, { publicOrigin, secureCookies = false, trustProxy = false } = {}) {
  const app = express(), { db, transaction } = store;
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);
  app.use((req, res, next) => {
    res.set({ 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    const local = origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const sameHost = origin === `${req.protocol}://${req.get('host')}`;
    if ((origin && !(publicOrigin ? origin === publicOrigin : local || sameHost)) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Request origin is not allowed.' });
    if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Send this request as JSON.' });
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', async (req, res) => {
    try {
      const migration = await db.prepare('SELECT name FROM migrations WHERE name=?').get('postgres-v1');
      if (store.kind === 'postgres' && !migration) throw Error('Schema is missing.');
      res.json({ ok: true });
    } catch { res.status(503).json({ ok: false, error: 'Database is not ready. Run npm run db:migrate.' }); }
  });
  installAuth(app, store, { secureCookies });
  async function access(id, user, ownerOnly = false) {
    const record = await store.committee(id, { lock: ownerOnly });
    const membership = record && await db.prepare('SELECT * FROM memberships WHERE committee_id=? AND user_id=?').get(id, user.id);
    if (!record || (record.owner_id !== user.id && !membership)) throw fail('Committee not found.', 404);
    if (ownerOnly && record.owner_id !== user.id) throw fail('Only the Bukki can manage this committee.', 403);
    return record;
  }
  async function present(record, user) {
    const admin = record.owner_id === user.id, c = record.committee;
    const memberships = await db.prepare('SELECT member_id,user_id FROM memberships WHERE committee_id=?').all(c.id);
    const linked = memberships.map(x => x.member_id);
    return { ...c, role: admin ? 'bukki' : 'member', myMemberId: admin ? c.bukkiId : memberships.find(m => m.user_id === user.id)?.member_id, sharesLocked: sharesLocked(c), members: c.members.map(m => ({ ...m, linked: linked.includes(m.id) })) };
  }
  const owned = (c, user) => present({ committee: c, owner_id: user.id }, user);
  app.get('/api/committees', async (req, res) => {
    const rows = await db.prepare('SELECT * FROM committees WHERE owner_id=? OR id IN (SELECT committee_id FROM memberships WHERE user_id=?) ORDER BY created_at,id').all(req.user.id, req.user.id);
    res.json(await Promise.all(rows.map(row => present({ ...row, committee: JSON.parse(row.data) }, req.user))));
  });
  app.get('/api/committees/:id', async (req, res) => res.json(await present(await access(req.params.id, req.user), req.user)));
  app.post('/api/committees', async (req, res) => {
    const c = createCommittee(req.body);
    await store.insert(c, req.user.id);
    res.status(201).json(await owned(c, req.user));
  });
  app.delete('/api/committees/:id', async (req, res) => {
    await transaction(async () => {
      const { committee: c } = await access(req.params.id, req.user, true);
      if (req.body?.confirmationName !== c.name) throw fail('Type the exact committee name to confirm deletion.');
      await db.prepare('DELETE FROM committees WHERE id=?').run(c.id);
    });
    res.json({ deletedId: req.params.id });
  });
  app.post('/api/demo', async (req, res) => {
    const c = await transaction(async () => {
      await store.lockUser(req.user.id);
      const existing = (await db.prepare('SELECT * FROM committees WHERE owner_id=?').all(req.user.id)).find(row => JSON.parse(row.data).demo);
      if (existing) return JSON.parse(existing.data);
      const c = createCommittee({ name: 'Ghar walon ki committee', amount: 5000, start: '2026-11', bukkiIndex: 0, bukkiFirst: true, demo: true, members: [{ name: 'Ayesha Khan', entries: 1 }, { name: 'Ahmed Ali', entries: 2 }, { name: 'Fatima Noor', entries: 1 }, { name: 'Hassan Raza', entries: 1 }, { name: 'Sana Malik', entries: 1 }, { name: 'Bilal Ahmed', entries: 1 }, { name: 'Zainab Shah', entries: 1 }] });
      c.members.forEach(m => payment(c, c.rounds[0].id, m.id, true)); payout(c, c.rounds[0].id);
      c.members.slice(0, 4).forEach(m => payment(c, c.rounds[1].id, m.id, true));
      await store.insert(c, req.user.id); return c;
    });
    res.json(await owned(c, req.user));
  });
  app.post('/api/committees/:id/invites', async (req, res) => {
    const raw = token(), expiresAt = Date.now() + 7 * 86400000;
    const allocation = await transaction(async () => {
      const { committee: c } = await access(req.params.id, req.user, true);
      const memberId = req.body.memberId || null;
      if (memberId && (!c.members.some(m => m.id === memberId) || memberId === c.bukkiId || await db.prepare('SELECT 1 FROM memberships WHERE committee_id=? AND member_id=?').get(c.id, memberId))) throw fail('Choose an unlinked member other than the Bukki.');
      const target = c.members.find(m => m.id === memberId);
      const entries = req.body.entries ?? (target?.entries || 1);
      if (!Number.isInteger(entries) || entries < 1 || entries > 12) throw fail('Choose between 1 and 12 entries for this invitation.');
      if (target?.entries && entries !== target.entries) throw fail('This member already has entries. Their invitation must keep that entry count.');
      if (!target?.entries && (c.entries.length + entries > 120 || (!target && c.members.length >= 100))) throw fail('This invitation exceeds the committee member or entry limit.');
      // New-person links are independent, single-use allocations. Creating a link
      // for someone else must not invalidate invitations already sent.
      if (memberId) await db.prepare('DELETE FROM invites WHERE committee_id=? AND member_id=?').run(c.id, memberId);
      await db.prepare('INSERT INTO invites(token_hash,committee_id,member_id,expires_at) VALUES(?,?,?,?)').run(digest(raw), c.id, memberId, expiresAt);
      await db.prepare('INSERT INTO invite_options(token_hash,entries,used_by) VALUES(?,?,NULL)').run(digest(raw), entries);
      return { entries, addsEntries: !target?.entries };
    });
    res.status(201).json({ token: raw, expiresAt, ...allocation });
  });
  app.delete('/api/committees/:id/invites', async (req, res) => {
    await transaction(async () => {
      await access(req.params.id, req.user, true);
      await db.prepare('DELETE FROM invites WHERE committee_id=?').run(req.params.id);
    });
    res.json({ ok: true });
  });
  app.post('/api/invites/:token/join', async (req, res) => {
    if (!/^[\w-]{43}$/.test(req.params.token)) throw fail('This invite link is invalid or has expired.', 404);
    const record = await transaction(async () => {
      let invite = await db.prepare('SELECT * FROM invites WHERE token_hash=? AND expires_at>?').get(digest(req.params.token), Date.now());
      if (!invite) throw fail('This invite link is invalid or has expired. Ask the Bukki for a new link.', 404);
      const record = await store.committee(invite.committee_id, { lock: true });
      // Rotation, revocation, deletion and joining all use the committee lock.
      invite = await db.prepare('SELECT * FROM invites WHERE token_hash=? AND expires_at>?').get(digest(req.params.token), Date.now());
      if (!record || !invite) throw fail('This invite link is invalid or has expired. Ask the Bukki for a new link.', 404);
      const c = record.committee;
      if (record.owner_id === req.user.id || await db.prepare('SELECT 1 FROM memberships WHERE committee_id=? AND user_id=?').get(c.id, req.user.id)) return record;
      const options = await db.prepare('SELECT entries,used_by FROM invite_options WHERE token_hash=?').get(digest(req.params.token));
      if (options?.used_by) throw fail('This invitation has already been used. Ask the Bukki for your own link.', 409);
      const inviteEntries = Number(options?.entries ?? 1);
      let memberId = invite.member_id;
      if (memberId) {
        if (await db.prepare('SELECT 1 FROM memberships WHERE committee_id=? AND member_id=?').get(c.id, memberId)) throw fail('This member invite has already been used. Ask the Bukki for another link.', 409);
        const target = c.members.find(m => m.id === memberId);
        if (!target) throw fail('This member is no longer in the committee.', 404);
        if (!target.entries) assignShares(c, memberId, inviteEntries);
        else if (options && target.entries !== inviteEntries) throw fail('This member’s entries changed. Ask the Bukki for a new link.', 409);
      } else {
        const base = req.user.email.split('@')[0].slice(0, 45);
        let name = base, i = 2;
        while (c.members.some(m => m.name.toLowerCase() === name.toLowerCase())) name = `${base} (${i++})`;
        memberId = addMember(c, { name, entries: inviteEntries }).id;
      }
      await store.save(c);
      await db.prepare('INSERT INTO memberships VALUES(?,?,?)').run(c.id, req.user.id, memberId);
      await db.prepare('INSERT INTO invite_options(token_hash,entries,used_by) VALUES(?,?,?) ON CONFLICT(token_hash) DO UPDATE SET used_by=excluded.used_by').run(digest(req.params.token), inviteEntries, req.user.id);
      return record;
    });
    res.json(await present(record, req.user));
  });
  app.post('/api/committees/:id/:action', async (req, res) => {
    const c = await transaction(async () => {
      const { committee: c } = await access(req.params.id, req.user, true);
      const { roundId, memberId, paid, adjustmentId } = req.body;
      switch (req.params.action) {
        case 'draw': draw(c, roundId); break;
        case 'payment': payment(c, roundId, memberId, paid); break;
        case 'payout': payout(c, roundId); break;
        case 'members': addMember(c, req.body); break;
        case 'shares': assignShares(c, memberId, req.body.entries); break;
        case 'catchup': catchup(c, roundId, adjustmentId, paid); break;
        case 'topup': topup(c, roundId, adjustmentId); break;
        default: throw fail('Unknown action.', 404);
      }
      await store.save(c); return c;
    });
    res.json(await owned(c, req.user));
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use((err, req, res, next) => {
    const databaseError = /^([0-9A-Z]{5}|SQLITE_)/.test(String(err.code || ''));
    const status = err.status || (databaseError ? 503 : 400);
    if (status >= 500) console.error('Request failed:', err.code || err.name);
    if (status === 429) res.set('Retry-After', '900');
    res.status(status).json({ error: status >= 500 ? 'Could not save. Please try again.' : err.message });
  });
  return app;
}
