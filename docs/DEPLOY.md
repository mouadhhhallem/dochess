# DoChess production deployment guide

Target: a **controlled public release** of the API on a persistent-process
host, with the static site staying on GitHub Pages. Nothing here deploys
itself — every step below is manual and reviewable.

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

3. Quick match before the frontend points at the API: the client tries
   same-origin `/api/mm/*` only when the node server serves the page. On
   GitHub Pages it falls back to P2P bucket rendezvous (works, no server
   needed). To force the server queue on Pages, set
   `localStorage.cc_api_base = 'https://<your-api>.up.railway.app'` in the
   browser console (also needs the `connect-src` CSP entry from item 1).

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
