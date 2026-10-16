# DoChess production deployment guide

Target: a **controlled public release** of the API on a persistent-process
host, with the static site staying on GitHub Pages. Nothing here deploys
itself — every step below is manual and reviewable.

## Fast path: Fly.io (2026-10-15, ready to run)

`fly.toml` + `Dockerfile` are committed. The frontend already honours
`window.DOCHESS_API_BASE` (clerk-config.js — set to the Render URL since
the 2026-10-16 deploy) in all three API resolvers, and the CSP already
allows `https://*.fly.dev` (plus Railway/Render wildcards).

```sh
flyctl auth login
flyctl launch --no-deploy          # accept dochess-api, region cdg
flyctl secrets set MONGODB_URI="..." CLERK_SECRET_KEY="..." UPSTASH_REDIS_REST_URL="..." UPSTASH_REDIS_REST_TOKEN="..."
flyctl deploy
curl https://dochess-api.fly.dev/api/health   # productionReady: true, db.kind: mongo
```

Then point the frontend at it (one line + push, Pages redeploys):

```js
window.DOCHESS_API_BASE = 'https://dochess-api.fly.dev';
```

Before that, in MongoDB Atlas → Network Access, allow `0.0.0.0/0`
(Fly has no static egress IPs), with a least-privilege DB user scoped
to `dochess` only.

## Status as of 2026-10-16: DEPLOYED (Render)

The API is live at `https://dochess-api.onrender.com` (Docker, free tier,
auto-deploy from `master`) with `/api/health` reporting
`productionReady: true` and `db.kind: mongo`. The Pages frontend points at
it via `window.DOCHESS_API_BASE`, so friends, ranking, hall of fame and
sync behave like localhost. Notes that remain true: free-tier cold starts
(~50 s after 15 idle minutes), Atlas Network Access must stay `0.0.0.0/0`,
and test suites must never touch the live database (see Test quarantine
in `server/lib/db.mjs` — set after test rows were once written to Atlas
by local runs and cleaned up).

## Previous status (2026-10-13 audit, kept for the record): NOT DEPLOYED

This document has described a Railway deployment since it was written, but
**no API has ever been deployed**. Verified during the audit:

- No `.github/` directory and no CI workflow of any kind exists in the repo.
- No `railway.json` / `render.yaml` / `fly.toml` / `Procfile` / `Dockerfile`.
- No `RAILWAY*` / `RENDER*` / `VERCEL*` / `NETLIFY*` / `FLY*` credential is
  present on the deployment machine; the `railway` CLI is not installed;
  `gh secret list` is empty.
- Every hostname in this document is still the literal placeholder
  `https://<your-api>.up.railway.app`.
- The live site (`https://mouadhhhallem.github.io/dochess/`) serves static
  files only, and its deployed `index.html` contains no API base URL.

**Consequence:** on the live site the client's `apiBase()` returns `null`, so
friends, requests, invitations, presence and the global ranking all run in an
explicitly-labelled **device-local** mode. Nothing about the social or ranking
features is global in production until §1–§5 below are actually performed by
an operator with hosting credentials.

MongoDB Atlas is also unreachable from the build/audit machine (TCP 27017
connects, TLS handshake fails with `tlsv1 alert internal error`), so no
Atlas-backed verification could be performed here either.

## Architecture (what runs where)

| Piece | Host | Notes |
| --- | --- | --- |
| Static site (`index.html`, `*.js`, assets) | GitHub Pages (already live) | unchanged |
| API + static fallback (`server/`) | Railway service (primary) or Render | persistent Node process, automatic TLS |
| Permanent store | MongoDB Atlas (`dochess` database) | already provisioned |
| Rate limits + leaderboard cache | Upstash Redis REST | already provisioned |
| Identity | Clerk (`patient-service-325` dev instance → promote to production instance before public release) | JWT verification, no sessions on our server |
| Multiplayer transport | PeerJS public cloud rendezvous + direct WebRTC (unchanged) | no server component; see §WebRTC below |

No WebSocket server is required (decision record in `docs/BACKEND.md`).
The API is stateless except the in-memory rate-limit fallback, so one
process is enough to start; horizontal scaling needs no code changes.

## 1. Environment variables (Railway → service → Variables)

| Variable | Value / source |
| --- | --- |
| `MONGODB_URI` | Atlas connection string (Driver entry, includes password) |
| `MONGODB_DB` | `dochess` |
| `CLERK_SECRET_KEY` | Clerk dashboard → API keys → **Secret key** (use the **production** instance key for public release, not the `sk_test_` dev key) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash console |
| `PORT` | provided automatically by Railway — do **not** hardcode; the server reads `process.env.PORT` |
| `HOST` | `0.0.0.0` (Railway routes to the service port; `127.0.0.1` would be unreachable) |
| `CORS_ORIGIN` | `https://mouadhhhallem.github.io` (the Pages frontend) |
| `NODE_ENV` | `production` (arms the dev-auth boot refusal) |
| `DOCHESS_DEV_FILE_STORE` | `0` — refuse the local file fallback so a lost database fails loudly instead of silently forking state |
| `MAX_BODY_BYTES` | default `1500000` (leave unless abuse appears) |

Start command: `node server/index.mjs` (or `npm run api`). Health check path
for the host: `GET /api/health` (must return `productionReady: true`).

## 2. Frontend changes required for split-origin (manual, one-time)

The Pages frontend and the API will be on different origins. Two coordinated
edits are required (placeholders — fill in the real Railway domain):

1. `index.html` Content-Security-Policy `connect-src`: add
   `https://<your-api>.up.railway.app` next to the existing Clerk/PeerJS
   entries. Without this the browser blocks sync calls.
2. Clerk dashboard → the production instance → **Allowed origins**: add
   `https://mouadhhhallem.github.io` and `https://<your-api>.up.railway.app`.
   Clerk session cookies/JWTs only flow on listed origins.

Promote the Clerk instance first: development instances show dev-mode walls
and have dev-only rate limits. Create/use a **production** Clerk instance,
put its publishable key in `clerk-config.js` and its secret key in Railway.

3. **Point the frontend at the API.** Quick match used to need this; so do
   every social feature now. The client reads `localStorage.cc_api_base`
   first and otherwise assumes same-origin, which is wrong on GitHub Pages.
   For a one-off test, set it in the browser console:

   ```js
   localStorage.cc_api_base = 'https://<your-api>.up.railway.app'
   ```

   For a real release, set the same value **in the source** so every visitor
   gets it — the cleanest place is a new constant in `app.js`/`friends.js`
   next to `apiBase()`, e.g. a `DEFAULT_API_BASE` that is returned when no
   override is present. It is currently left empty on purpose: shipping a
   hard-coded hostname that does not resolve yet would make the client send
   every request into a black hole instead of honestly degrading to the
   labelled device-local mode.

## 3. Atlas network access, permissions, backups

- Railway/Render free tiers have **no static outbound IPs**, so Atlas IP
  Access List must be `0.0.0.0/0` (anywhere). Compensations (all required):
  - a 32+ character random password, stored only in Railway variables;
  - a database user scoped to **readWrite on `dochess` only** (Atlas →
    Database Access → Edit → Specific Privileges), not Atlas-admin;
  - tighten to static IPs if you later add one (VPS with fixed IP, or a
    static-egress add-on).
- Backups: M0 has no point-in-time restore. Take exports before every
  release and weekly:
  ```sh
  mongodump --uri="$MONGODB_URI" --db=dochess --out=backups/$(date +%F)
  mongorestore --uri="$MONGODB_URI" --db=dochess backups/<date>/dochess
  ```
  Moving to M10+ buys point-in-time recovery — do it before real scale.
- Indexes are created by the server on boot (`{userId:1,date:-1}`,
  unique `{userId:1,gameId:1}`, `{date:-1}`); all migrations so far are
  additive (new fields, new indexes) — safe to roll forward and back.

## 4. WebRTC rendezvous dependency

PeerJS public cloud (`0.peerjs.com`) is **rendezvous-only** (introduces the
two browsers; game traffic is direct WebRTC). It carries no game data, no
auth, and no SLA. Keep it for the controlled release; self-host PeerServer
(one more tiny process, same host) only if rendezvous outages bite.

## 5. Deploy procedure

1. `git` main is green: `npm test` fully passes locally (see README).
2. Push → Railway auto-deploys the service from the repo.
3. Watch deploy logs for `[doches api] api-1 listening` **without** any
   `not production-ready, still missing:` line.
4. Smoke test from your machine (replace the domain):
   ```sh
   curl https://<your-api>.up.railway.app/api/health
   # → {"ok":true,"productionReady":true,"missing":[],"auth":{"mode":"clerk",…},"db":{"kind":"mongo",…}}
   curl -s -o /dev/null -w "%{http_code}\n" https://<your-api>.up.railway.app/api/state
   # → 401
   curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer garbage" https://<your-api>.up.railway.app/api/state
   # → 401
   ```
5. Browser check: open the Pages site, sign in, play/complete any action,
   confirm the profile chip reads *Saved to your account*, reload, confirm
   persistence.

## 6. Rollback

- Code: redeploy the previous commit from the Railway dashboard
  (Deployments → … → Rollback), or `git revert` + push.
- Data: no destructive migrations exist — rolling back code never requires
  rolling back data. If a bad write slipped through, restore the affected
  collections from the §3 export (`mongorestore --nsInclude`).

## 7. Monitoring (minimum viable)

- Uptime poll on `/api/health` every 1–5 min (UptimeRobot/cron): alert when
  `ok` is false, `productionReady` is false, `db.error` / `auth.jwksError`
  is non-null, or `redis.ok === false` twice in a row (rate limits then run
  in-memory per instance — safe but degraded).
- Keep deploy logs 7+ days; never log request bodies, tokens, or env values
  (the server already logs modes, never secrets — verified by audit).
- Watch Atlas metrics (connections, disk) and Upstash command counts
  against free-tier quotas; the 429 rate is the early-warning signal for
  abuse (each 429 is logged client-side as sync `offline`).

## 8. Free-tier limits to respect

- Railway trial/usage credits and Atlas M0 (512 MB storage, low connection
  caps) comfortably cover a controlled release (tens of concurrent users),
  not open public scale. Upstash free tier covers rate limiting + 30 s
  leaderboard caches at that size. Re-check current quotas at release time;
  the `Scaling path` section of `docs/BACKEND.md` says what to change first
  (bigger Atlas tier, then more processes — never new infrastructure on a
  hunch).

## 9. Explicit non-goals for this release

- No WebSocket/multiplayer server (P2P is the tested transport).
- No `127.0.0.1:8787` exposed to the internet — local dev only.
- No user-data export tooling yet (Mongo exports cover it).
- No server-side anti-cheat beyond attribution hygiene (see the Game
  integrity section of `docs/BACKEND.md`).
