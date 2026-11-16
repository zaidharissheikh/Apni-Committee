# Apni Committee

A React app for running a traditional committee with individual shares, saved random chit draws, monthly collections, and payout history.

## Run locally

Requires Node.js 24. Local storage uses the built-in `node:sqlite` module. For Vercel deployment with Neon Postgres, follow [DEPLOYMENT.md](DEPLOYMENT.md).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The API runs on port 3001. Create an account with your email and a four-digit passcode, then start a committee or explicitly load your own fictional demo.

```sh
npm test
npm run build
npm start
```

The production app runs at http://127.0.0.1:3001 after building.

## Committee rules

- Each share creates one monthly contribution, one chit, and one eventual payout. Session duration equals total shares, including multiple shares owned by one member.
- The organizer selects the Bukki and optionally gives the first payout to one of the Bukki's shares.
- Draws use Node's cryptographic random generator and Fisher–Yates shuffle. The final entry wins. The full order is saved before animation and cannot be rerolled.
- The draw room starts with folded, anonymous chits. Shuffle mixes them, then each press opens exactly one chit. Nothing advances automatically; the last chit has its own reveal. Reduced-motion settings remove movement while preserving manual pacing. Reveal progress is saved in this browser so refreshing resumes the same saved draw.
- Winners keep contributing for the rest of the session. A winning share is removed from future pools; other shares belonging to that member remain eligible.
- Collections can be marked and undone only in the current unsettled month. A payout requires a winner and all contributions. Confirmed months are locked.
- CSV export includes every month's member obligations, collection status, winner, and payout status.
- The committee toolbar includes **Delete committee**. Type the exact committee name in the confirmation dialog to permanently remove that session and all its records. Other committees remain intact. Only the account that created the committee can delete it.

## Bring an existing committee online

During creation, set the original starting month and enable **This committee has already started**. Enter the number of completed months and select each month's winner, in order. A member can appear again only while they have unused shares. If the Bukki-first option is enabled, the first imported winner is the selected Bukki.

Confirm that all imported months were fully collected and paid out. These months are marked as imported, settled, and locked; the app continues at the first remaining month. Optional actual payout dates are validated. When a date is unknown, the history says **Imported settled month** rather than presenting the import date as the actual payout date. Future months cannot be imported.

## Browser verification

```sh
node tests/browser-flow.mjs
```

Build first. This test requires Google Chrome at its usual Windows path, or `CHROME_PATH` pointing to your Chromium executable. It starts an in-process HTTP server with a temporary SQLite database, creates a test account, tests setup and the paced ceremony through the browser, and removes only its temporary database. It does not modify your committee records.

## Accounts, invitations and permissions

- Sign up or sign in with an email and a four-digit passcode. Leading zeroes are supported. Accounts are unique by normalized email; passcodes use salted scrypt hashes.
- Sessions last 30 days and use HttpOnly, SameSite=Lax cookies. Session tokens and invite tokens are stored as hashes. Sign out removes the server-side session.
- Login and registration share persistent account and IP attempt limits (5 per account and 30 per IP in 15 minutes). Successful authentication clears the account bucket. Limits survive restarts.
- The creator account has Bukki controls. The Bukki selection in setup identifies the member/share eligible for the first payout; it does not transfer account administration.
- The API returns only committees the signed-in account created or joined. Draws, collections, payouts, manual member additions, share assignments, invitations, exports in the UI, and deletion belong to the creator. Members see the overview, members, ledger and payout history. API writes check permissions independently of the UI.
- **Invite members → Someone new** creates a link that adds a member with zero shares and viewing access. Existing signed-in users join automatically; otherwise the link survives sign-in or signup. Reopening a link never duplicates membership.
- Alternatively, select a manually added member in the invitation dialog. Their link connects one account to the existing member and shares, preserving the ledger. These links are bearer invitations: send them directly to the intended person. They are not email-address verified.
- Links expire after seven days. Creating another link for the same target replaces the previous one. **Revoke all invite links** stops new joins without removing existing members.
- Use **Members → Add member** for manual additions. Assign 1–12 shares to a viewing member before the first collection or random draw. Each new share adds one month. Once financial activity begins, shares stay locked; view-only joins and links to existing members still work. This protects saved draws and settled history.
- Active pages refresh committee details every 20 seconds and when the browser regains focus. They pause background refresh during mutations and modal forms.
- Controls, tabs, dialogs, dropdowns and feedback have small animations. Dropdowns support arrows, Home/End, typing, Enter, Escape, and click-away. Reduced-motion preferences disable movement throughout the app.

Email is currently an account identifier, not a verified mailbox. Email delivery, verification and forgotten-passcode recovery are not connected. This is a convenience login with baseline protection; a four-digit passcode has limited entropy. Authentication implementation references: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Storage and existing records

Locally, records persist in **data/committee.sqlite**, including users, hashed sessions, committee ownership, memberships, invitations and login attempt limits. Committee mutations run in SQLite transactions. Back up this directory using a SQLite-aware backup or while the server is stopped; include WAL files if present. COMMITTEE_DATA_DIR overrides its location. Keep it on persistent storage when hosting; this implementation targets one Node service with a shared local SQLite volume.

On first startup, the app copies the previous data/committees.json into SQLite without modifying the JSON source. Invalid legacy data stops startup. The migration runs once, so deleted committees cannot reappear from the old JSON file.

Legacy records have no known account owner. They stay private and unassigned until the local operator explicitly assigns them. They are never given to the first person who signs up. To restore your existing committees:

1. Start the app and create your own account.
2. From this project directory, run the following with that account's email:

```sh
npm run claim-legacy -- your@email.com
```

3. Refresh the app. This assigns only unowned legacy committees; it does not reassign other users' committees. Run it only for the intended original organizer's account.

## Vercel + Neon

Follow [the complete deployment guide](DEPLOYMENT.md) for project setup, database connection, migrations, importing existing accounts and records, deployment, and verification. Hosted storage uses Neon Postgres through the server-only DATABASE_URL (or legacy POSTGRES_URL). The Vercel API never falls back to local SQLite. Browser sessions and invite links are regenerated after migration; existing account passcodes and committee ownership are preserved.

## Other Node hosting

Local development binds to 127.0.0.1. To make invitation links usable on other devices, host this same app behind HTTPS with persistent SQLite storage. Configure these environment variables in your host:

| Variable | Purpose |
| --- | --- |
| HOST | Set to 0.0.0.0 when the host requires an externally bound listener. |
| PORT | HTTP port, default 3001. |
| APP_ORIGIN | Exact browser origin, for example https://committee.example.com. API origin checks use this value. |
| NODE_ENV | Set to production to require Secure session cookies over HTTPS. |
| COOKIE_SECURE | Optional true to require Secure cookies independently of NODE_ENV. |
| TRUST_PROXY | Optional trusted proxy IP/subnet or Express preset such as loopback. Configure only your host's actual proxies so rate limits use visitor IPs. Forwarded headers are untrusted by default. |
| COMMITTEE_DATA_DIR | Absolute directory on persistent storage. |

Build with npm run build and launch with npm start. The app creates invitation links using the origin open in the browser. A localhost link only works on that computer. HTTPS termination may be handled by your host's reverse proxy. This change does not publish or configure a hosting service.

The Bukki collects and transfers funds outside the app; it records payments without moving money. Demo committees are created only on request and belong to the requesting account.

## Verification in restricted environments

If a workspace blocks Node child processes, the test suite can run in one process:

```sh
node --test --test-isolation=none tests/*.test.js
```

The browser flow accepts CHROME_DEBUG_URL to connect to an already running Chromium debugging endpoint instead of launching a new browser. Browser verification still requires a permitted Chromium runtime. The standard Vite build requires permission to launch its esbuild service.
