# Deploy Apni Committee to Vercel + Neon

The frontend deploys as Vite static files. `/api/*` runs the Express API in a Vercel Node 24 function. All hosted accounts, sessions, committees, memberships, invitations and login limits persist in Neon Postgres. Vercel does not use your local SQLite file.

## 1. Create and link the Vercel project

Run these commands in this project directory from your own terminal:

```powershell
npm ci
npx vercel login
npx vercel link
```

During linking, select your account/team, create a new project, and use this directory as the root. A name such as `apni-committee` is fine; Vercel may assign a different public URL if a name is taken. You do not need a GitHub repository for CLI deployment. Keep `.vercel/` out of Git; it stores the local project link.

If you prefer GitHub deployments, push the source (excluding `data/`, `.env*`, `.vercel/` and `node_modules/`) to a private repository, then choose **Add New → Project** in Vercel and import that repository instead. `.env.example` is a public template and can be committed.

Confirm the project settings:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | This project directory |
| Node.js version | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |

The checked-in `vercel.json` supplies API routing and SPA fallback. Do not deploy only the `dist` directory: Vercel also needs `api/`, `server/`, `package.json` and the lockfile.

## 2. Connect Neon in Vercel

Open the project's **Storage** area and choose **Create Database / Connect Store → Neon**. Alternatively, add [Neon from Vercel Marketplace](https://vercel.com/marketplace/neon) and connect it to this project. Choose the plan that suits your account and a database region close to your Vercel function region.

Connect the database to the **Production** environment. Check **Settings → Environment Variables** for `DATABASE_URL`, supplied by the integration. It should be the pooled connection string. Keep the provider's TLS settings intact. The app also accepts `POSTGRES_URL` for older integrations.

No Neon Auth setup is required: the app keeps its existing email + passcode accounts. Do not rename the connection string to `VITE_DATABASE_URL`; any `VITE_` value can be bundled into the browser. Do not paste database passwords into chat or source code.

For Preview deployments, use a separate Neon branch/database. Do not connect untrusted previews to production records. `APP_ORIGIN`, added later, should be scoped to Production.

## 3. Initialize the database

Pull the project's Production environment into an ignored local file:

```powershell
npx vercel env pull .env.local --environment=production
npm run db:migrate
npm run db:check
```

The migration creates tables and indexes in a transaction and can be rerun safely. It does not delete existing records. `db:check` prints connection readiness and record counts without printing credentials. The local database commands load `.env.local`; normal local development keeps using SQLite unless you explicitly set a database connection in its process environment.

If you are using a Neon database created outside Vercel, connect its integration or add its pooled connection string as the server-only `DATABASE_URL` environment variable. You can also copy `.env.example` to `.env.local` and fill it in locally.

## 4. Bring your existing accounts and committees online

Do this before creating new accounts on the hosted app. Stop making changes to the local app during the final import, then keep a backup of your local `data/` directory.

First inspect the import counts:

```powershell
npm run db:import-local
```

This reads your local database without changing it or connecting to Neon. It prefers `data/committee.sqlite` and falls back to `data/committees.json` if SQLite does not exist.

When the counts are right and `.env.local` points to the intended empty Neon database:

```powershell
npm run db:import-local -- --apply
npm run db:check
```

The import preserves accounts, passcode hashes, committee ownership, all committee records and memberships. You can sign in online with your existing email and passcode. Import writes are atomic, refuse a nonempty destination, and run only once; rerunning after a successful import leaves records unchanged. This is a one-time transfer, not ongoing synchronization.

Browser sessions and old invite links are deliberately left behind. Sign in again and generate new invitations from the deployed app.

If your older committees still have no account owner, create/sign in to the intended organizer account, then run:

```powershell
npm run claim-legacy -- your@email.com
```

With `DATABASE_URL` in `.env.local`, this command assigns unowned **hosted** committees to that account. Already owned committees are unaffected. If you intentionally want to start fresh online, skip the import.

## 5. Deploy production

```powershell
npx vercel --prod
```

Open the deployment URL returned by Vercel. Copy its stable project domain, then add this in **Settings → Environment Variables**, scoped to **Production**:

| Variable | Value |
| --- | --- |
| `APP_ORIGIN` | The exact stable origin, e.g. `https://your-project.vercel.app`, without a trailing slash |

Redeploy so the new environment variable takes effect:

```powershell
npx vercel --prod
```

Vercel supplies `VERCEL` and the proxy headers used by the app. Secure cookies are enabled automatically. You do not need `HOST`, `PORT`, `COMMITTEE_DATA_DIR`, `TRUST_PROXY`, or a writable disk on Vercel. Do not add local-only data paths to the hosted environment.

When you add a custom domain, set it as the primary domain, update `APP_ORIGIN` to that HTTPS origin and redeploy. Invite links use whichever origin is open in the browser, so generate and share links from the primary domain.

## 6. Verify before sharing

Run the read-only deployment check:

```powershell
npm run deploy:check -- https://your-project.vercel.app
```

Then verify the signed-in flows:

1. Sign in with an imported account (or create one if starting fresh). Check its committees and payout history.
2. Sign in with a different account in an incognito window. Its committee list should be separate.
3. Create an invitation as the Bukki. Open it in that second account; it should join with viewing access, with no drawing, collection, invitation or deletion controls.
4. Refresh and sign back in to confirm the database persists records and sessions across requests.
5. Revoke the invitation, then try it with an account that has not joined; it should fail.

If your Vercel project uses deployment protection, make the Production app accessible to the people you intend to invite in the project's protection settings. The app still requires its own login. Do not disable Preview protection just to test a Production invite.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| App opens but the API is 404 or HTML | Deploy the project root, confirm Vite preset and `vercel.json`, and keep the `/api/*` rewrite ahead of the SPA fallback. |
| `/api/health` returns 503 | Confirm `DATABASE_URL` exists in Production, run `db:migrate`, check Neon status and Vercel function logs. |
| Missing dependency | Run `npm ci` locally and redeploy with `package-lock.json`. The Neon driver is a runtime dependency. |
| Origin not allowed | Match `APP_ORIGIN` to the exact HTTPS domain in the address bar; remove trailing slashes and redeploy. For previews, use preview-scoped configuration. |
| Sign-in succeeds but does not persist | Stay on one HTTPS domain; check cookies are enabled and requests are not being redirected between domains. |
| Existing committees are missing | Run the import before signup, use the correct Neon branch, and check whether legacy committees need `claim-legacy`. |
| Import refuses existing records | Use an empty database/branch. The tool intentionally does not overwrite or merge existing accounts. |
| Local development cannot write | Local development reads SQLite by default. Hosted migration commands load `.env.local` separately. Check for explicitly exported `DATABASE_URL`/`APP_ORIGIN` in your shell. |

The four-digit account login remains the baseline convenience login requested for this app. Email verification and forgotten-passcode recovery are not connected to an email service yet.

References: [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite), [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [Neon’s Vercel integration](https://neon.com/docs/guides/vercel-managed-integration), [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).
