# DoChess backend — API, database, sync

Phase-2 foundation for server-side persistence. The **static site keeps working
exactly as before** (localStorage, `file://`, offline); the backend is an
optional layer that mirrors progress into MongoDB for signed-in learners.

## What runs

```
node server/index.mjs        # or: npm run api
```

One Node process serves **both** the static site and the API on `PORT`
(default `8787`). No framework — `node:http` plus `mongodb` and `jose`.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/health` | none | config + dependency report (never leaks secrets) |
| `GET /api/state` | Clerk session | the signed-in user's saved sections |
| `PUT /api/state` | Clerk session | merge `{sections, profile?}` in, merged doc out |
| `POST /api/games` | Clerk session | append a finished game (idempotent on `gameId`) |
| `GET /api/games?limit&before` | Clerk session | paginated history, newest first |
| `GET /api/leaderboard?cat=` | none | top players per rating category (30 s Redis cache) |
| `*` | none | static files from the project root |

`server/`, `node_modules/`, `.git`, `skills/` and the screenshot folders are
**never** served statically, and `.env` is gitignored.

## What is stored

MongoDB collections (see `server/lib/db.mjs`):

- `users` — `{_id: <clerk user id>, profile, sections:{…}, updatedAt}`
- `games` — one document per finished game, indexes `{userId:1,date:-1}`
  and unique `{gameId:1}` (duplicate POSTs are no-ops).

Sections mirrored from the browser (`server/lib/merge.mjs` is the contract):

| Section | Local key | Merge |
| --- | --- | --- |
| `learn` | `dochess:v1` | last writer wins |
| `lessons` | `ccp_v4[_<uid>]` | last writer wins |
| `achievements` | `cca_v1_<uid>` | last writer wins |
| `ratings` | `ccr_<uid>` | last writer wins |
| `puzzles` | `dochess:puzzles:v1` | last writer wins |
| `playtime` | `cc_time_<uid>` | last writer wins |
| `study` | `dcstudy_v1_<uid>` | last writer wins |
| `settings` | theme / mute / board skin / time control / piece style | last writer wins |
| `games` | `ccgh_<uid>` | union by `gameId`, newest first, capped at 200 |
| `leaderboard` | `ccr_board` | union per player, newer rating wins |

Every section carries its own `updatedAt`. On conflict the newer side wins;
`games` and `leaderboard` merge instead of overwriting, so a game finished on
one device is not erased by a sync from another.

## Client

`js/sync.js` (`window.DoChessSync`) mirrors the table above.

- localStorage stays the local source of truth; sync only mirrors.
- Push is debounced (4 s) and also runs on `visibilitychange`/`pagehide`.
- A 30 s heartbeat re-checks for changes.
- Signed-out learners, `file://`, and any host without the API simply stay
  local — the course is fully usable with the backend down.
- The Profile dossier shows a `Saved to your account` / `Offline — will retry`
  chip so the learner always knows where their progress lives.

Identity comes from `Clerk.session.getToken()`. **The user id is never taken
from the request body** — `server/lib/auth.mjs` reads it from the verified
JWT's `sub` claim.

## Configuration

Copy `.env.example` → `.env` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | **production** | Atlas connection string (M0 free tier is enough) |
| `MONGODB_DB` | no | default `dochess` |
| `CLERK_SECRET_KEY` | **production** | `sk_…` from the Clerk dashboard; used to fetch JWKS |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | recommended | rate limits + leaderboard cache |
| `PORT`, `HOST` | no | `8787`, `127.0.0.1` |
| `CORS_ORIGIN` | no | only for a split-origin dev setup |
| `DOCHESS_DEV_NO_AUTH` | **dev only** | `1` accepts `x-doChess-user` instead of Clerk |
| `DOCHESS_DEV_FILE_STORE` | no | `0` refuses the file fallback when Mongo is missing |

### Current state on this machine

`GET /api/health` is the single source of truth. With real credentials in
`.env` (Atlas + Clerk, never committed) it reports:

- `productionReady: true`, `missing: []`
- `db.kind = "mongo"` — data lives in the Atlas cluster (`MONGODB_DB`,
  default `dochess`). The `server/.data/` file store only takes over if the
  Mongo dial fails at boot, and health reports which one is live.
- `auth.mode = "clerk"` — every `/api/state`, `/api/games` and
  `/api/leaderboard` call must carry a Clerk session JWT (Bearer); the
  `x-doChess-user` dev header is rejected.

The dev escape hatch (`DOCHESS_DEV_NO_AUTH=1`) stays **off** in `.env`;
uncomment it only to exercise the API without a browser session. The server
**refuses to boot** if `DOCHESS_DEV_NO_AUTH=1` while `NODE_ENV=production`.

No credential was invented: the publishable key matches `clerk-config.js`,
and the secret key was verified against Clerk's JWKS endpoint before use.

## Local development

```sh
cp .env.example .env      # fill MONGODB_URI + CLERK_SECRET_KEY (kept out of git)
npm install
npm run api               # http://127.0.0.1:8787
```

Open `http://127.0.0.1:8787` (not `file://`) so the browser can reach the API.
Sign in with Clerk; the profile chip flips to *Saved to your account*.

Quick smoke test without a browser:

```sh
curl http://127.0.0.1:8787/api/health
# → {"ok":true,"productionReady":true,"missing":[],"auth":{"mode":"clerk",…},"db":{"kind":"mongo",…}}
```

## Security notes

- Secrets live only in `.env` (gitignored) or the host's secret manager.
- Clerk JWTs are verified server-side against Clerk's JWKS (`jose`), with a
  one-shot JWKS refresh on signature failure and `clockTolerance: 30`.
- Bodies are capped (`MAX_BODY_BYTES`, and 600 KB per section); unknown
  sections are dropped rather than stored.
- Rate limits: 30 `PUT /api/state` per user per minute, 120 other calls.
  Upstash enforces them across instances; an in-memory window covers a Redis
  outage.
- Game records are sanitised (`sanitizeGameRecord`): fixed field set, capped
  numbers, control characters stripped.
- Static serving blocks `server/`, `node_modules/`, dotfiles and path
  traversal.

## Scaling path

1. **Now (one instance):** this process. Redis for rate limits; MongoDB for
   durability. Enough for the launch.
2. **Two+ instances:** nothing in the API is instance-local except the
   in-memory rate-limit fallback, which Upstash replaces in real
   deployments. Run N stateless processes behind a load balancer with
   sticky-free routing; WebRTC peer connections never touch this server.
3. **Live games with a server authority (future):** add a WebSocket service
   that reuses `lib/auth.mjs` and `lib/db.mjs`; keep move validation in
   `chess.js`; hold transient clocks in Redis, persist meaningful state
   transitions and completed games to MongoDB.
4. **When to split:** only when a measured bottleneck (not a guess) shows
   API CPU, Mongo connections or static bandwidth dominating. Do not add a
   second database, queue or cache before that.

## Tests

```sh
npm run test:merge     # pure merge-rule unit tests (node --test)
npm test               # curriculum gate + unit gates + Playwright suite
```
