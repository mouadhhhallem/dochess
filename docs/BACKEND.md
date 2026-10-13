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
| `POST /api/games` | Clerk session | append a finished game (idempotent per user+`gameId`) |
| `GET /api/games?limit&before` | Clerk session | paginated history, newest first |
| `GET /api/leaderboard?cat=` | Clerk session | top players per rating category (30 s Redis cache) |
| `POST /api/mm/join` | Clerk session | quick-match queue join (pairs closest ELO, any gap — testing mode) |
| `GET /api/mm/poll?ticket=` | Clerk session | queue position or `{code, role, opp}` match |
| `POST /api/mm/leave` | Clerk session | leave the quick-match queue |
| `POST /api/friends/add` | Clerk session | add edge (mutual edges = confirmed) |
| `POST /api/friends/remove` | Clerk session | remove edge |
| `GET /api/friends/list` | Clerk session | my edges with confirmed flags |
| `POST /api/presence` | Clerk session | heartbeat (90 s TTL) |
| `GET /api/friends/status?uids=` | Clerk session | online/recent map |
| `GET /api/directory?q=` | Clerk session | player directory search: local touchpoints + every registered Clerk user (3+ letters, max 20, names+photos only) |
| `POST /api/notify` | Clerk session | queue an inbox event for a user (optional data envelope: room code etc.) |
| `GET /api/notify` | Clerk session | inbox items + unread count |
| `POST /api/notify/ack` | Clerk session | mark inbox read |
| `POST /api/rank/publish` | Clerk session | publish best rating per category |
| `GET /api/rank?cat=&friends=` | Clerk session | my rank + named friends, strangers anonymous |
| `POST /api/hall/join` | Clerk session | claim a first-1000 seat |
| `GET /api/hall` | Clerk session | the hall-of-fame registry |
| `POST /api/events/ticket` | Clerk session | one-time ticket for the push stream (60 s) |
| `GET /api/events?ticket=` | ticket (no session header; EventSource cannot set headers) | Server-Sent Events fan-out: notify / friends / game-invite, auto-reconnect |
| `*` | none | static files from the project root |

`server/`, `node_modules/`, `.git`, `skills/` and the screenshot folders are
**never** served statically, and `.env` is gitignored.

## What is stored

MongoDB collections (see `server/lib/db.mjs`):

- `users` — `{_id: <clerk user id>, profile, sections:{…}, updatedAt}`
- `games` — one document **per player per finished game**:
  `{userId, gameId, result, termination, plies, moves[UCI…], control,
  opp, delta, ratingBefore, ratingAfter, date, endedAt}`.
  Indexes: `{userId:1,date:-1}`, unique `{userId:1,gameId:1}`, `{date:-1}`.
  Both players post their own copy under the shared game id, so a host and
  a joiner never overwrite each other; re-posting the same game is a no-op
  (`{ok:true, duplicate:true}`). The legacy global-unique `{gameId:1}` index
  is dropped on boot. Move lists replay from the standard start position
  (online games always start there); clock ticks are never written.

`PUT /api/state` merges per section with per-section atomicity: concurrent
writes from one account (background sync + a manual save, two devices) only
`$set` the sections they merged, each guarded so an older writer cannot
overwrite a newer section that landed mid-merge. Last-writer-wins holds per
section timestamp, not per document — a lost race re-reads and retries
instead of dropping data. Proven by the 10-parallel-PUT test (see Tests).

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
- Identity is per-account end to end: sync fingerprints live under
  `dochess:sync:v1:<uid>` (never one shared record). The two global keys
  that hold per-learner progress (`dochess:v1`, `dochess:puzzles:v1`) are
  stashed per account on every sign-in / sign-out / switch and restored on
  return — so accounts never inherit each other's local board, and guest
  work survives logout intact. Device-scoped keys are deliberately NOT
  swapped: `ccr_board` is already keyed per player (union merge resolves
  conflicts), and settings are device preferences governed by LWW.
- A brand-new account (empty on the server, absent on the device) adopts the
  anonymous device state once (lessons, ratings, study, games, playtime);
  existing accounts never absorb guest data. Achievements recompute from the
  adopted stores via the normal evaluate path.
- Local edits are stamped when detected, so offline work always lands on
  push. When the server holds genuinely newer data it still wins — and the
  client says so: a `dochess:conflict` event fires and the profile chip
  reads *Synced — newer progress kept* (with the section list) until the
  next clean sync.
- Match finalize: `_onlineFinish` calls `DoChessSync.recordGame()` with the
  finished game's UCI moves, termination and rating bookends. Best-effort —
  a failed POST is queued against the recording account and retried with
  backoff on later flushes (max 10 tries, dropped past 24 h); the
  device-local history (`ccgh_`) stays the fallback underneath.
- Signed-out learners, `file://`, and any host without the API simply stay
  local — the course is fully usable with the backend down.
- The Profile dossier shows a `Saved to your account` / `Offline — will retry`
  chip so the learner always knows where their progress lives.

## Game integrity: what the server checks (and does not)

The API is an **authenticated per-user history store, not a referee**.
Game outcomes are decided by the peers (host-authoritative move validation
over WebRTC); the server never sees a live game, so result claims below are
about attribution and hygiene, never about truth.

Enforced for every write:
- Identity and ownership come only from the verified JWT `sub` — no user id
  from the body is ever trusted, and one account cannot write another's
  documents (proven by `test-auth-e2e` 4/6).
- `POST /api/games` is idempotent per user+`gameId`; both players' copies of
  one shared game coexist, retries never duplicate, pagination is bounded.
- Field shapes and sizes are validated (`sanitizeGameRecord`, 600 KB per
  section, 1.5 MB bodies); unknown sections are dropped; section ids can
  never become Mongo field paths.
- Rate limits (30 state-PUTs/min/user, 120 other calls) with 429s.

NOT protected (by design, same trust level as the device-local stores this
mirrors): a signed-in client can submit arbitrary moves, results, ratings
or deltas **for its own account**. Nothing on the server replays games,
re-derives Elo, or cross-checks the two players' copies. Do not present
server-stored outcomes as independently verified; the follow-up if abuse
appears is cross-copy agreement checks (same `gameId`, mirrored results),
not silent trust.

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

## Realtime multiplayer: decision record (audited, no new server)

Audit outcome: **no WebSocket server is built** — the existing transport is
reused, and match data is recorded server-side at game end.

- Transport today is **WebRTC DataChannels via vendored PeerJS**
  (`online.js`, lazy-loaded; PeerJS public cloud is rendezvous-only, game
  traffic is direct peer-to-peer). Host-tab authority with epoch fencing,
  6-letter share codes, joiner auto-reconnect, host re-host resume, and
  per-move idempotency are implemented and covered by the online specs
  (`test-online-*.spec.js`, `test-elo-*.spec.js`).
- A `ws` + TypeScript server was evaluated and rejected for now: the product
  ships on **static hosting (GitHub Pages)**, there is no production host
  that could run a realtime server, and P2P already delivers responsive play
  with a tested reconnection story. Adding a server would add hosting,
  auth-surface and ops burden with no workload justifying it.
- What a server would buy (and the triggers to revisit): global matchmaking,
  spectators, and server-authoritative anti-cheat. Those need a host with
  persistent WebSocket support first — until then, completed P2P games are
  durably recorded via `POST /api/games` (both players, idempotent).
- Durability contract: acknowledged API writes (state sections, game
  records) are in MongoDB before the 200 response. In-flight move traffic
  stays peer-to-peer and is never blocked on the database; if the API is
  down mid-game, the device-local history is the fallback and syncs later.

## Measured performance (no projections)

Environment: Node v22.15.0, Windows 11, loopback API → Atlas M0 free tier,
Upstash Redis, Edge headless via Playwright. Scratch Clerk users and test
databases were created and deleted by the harness. Reproduce: run the
`test-auth-e2e.spec.js` suite (covers the API paths) and time any row below
with the same setup.

| What | Measured |
| --- | --- |
| Engine: legal-move gen + apply, per ply (200 plies, client) | **0.19 ms** |
| `PUT /api/state` authed round-trip (Atlas write), p50 / p95 (n=5) | **187 ms / 693 ms** (one M0 outlier) |
| `GET /api/state` authed round-trip, p50 / p95 (n=5) | **93 ms / 94 ms** |
| 10 parallel `PUT`s, one section each | **10× 200, all 10 sections present** (proves the per-section atomicity fix) |
| 5 parallel `PUT`s, same section, increasing timestamps | **newest won** regardless of arrival order (LWW guards hold) |
| Full sync flush cycle (dirty → `saved` chip state) | **411 ms** |
| `GET /api/health` ×200 parallel | **200/200 in 141 ms wall, 0 failures** |
| Rate limiter under burst (30 PUT/min/user) | **429 returned correctly** on the 31st write |

Not measured (needs production traffic, not invented): concurrent games at
scale, server CPU/RAM under sustained load, cross-region latency. The API is
stateless except the in-memory rate-limit fallback (Upstash covers
multi-instance); add monitoring before claiming headroom.

## Tests

```sh
npm run test:merge     # merge rules + http-boundary unit tests (node --test, no secrets)
npm test               # curriculum gate + unit gates + Playwright suite
```

- `test-auth-e2e.spec.js` — signed-in flows against **real Clerk + real
  Atlas** (own API on `:8799`, isolated `dochess_e2e` DB, test users
  created/deleted, DB dropped): 401 matrix, save→reload, isolation,
  logout, impersonation resistance, game finalize + idempotency, both-player
  dedupe, leaderboard with real rating objects, `_onlineFinish` wiring,
  prod-boot refusal, 413/429 enforcement, CORS fail-closed, health
  disclosure, 60 s token expiry enforcement.
- `test-sync-accounts.spec.js` — account isolation: hermetic stash/swap and
  guest-continuity tests on `file://`, plus server-backed adoption,
  conflict-honesty, outage-retry-across-restart, and the 10-parallel /
  same-section race proofs (own API on `:8800`, `dochess_e2e_sync` DB).
- Both files **skip** cleanly without `.env` secrets instead of faking
  results. Production deployment itself: see `docs/DEPLOY.md` (guide only —
  nothing here deploys).

`test-auth-e2e.spec.js` runs the signed-in flows against **real Clerk +
real Atlas**, self-contained:

- Spawns its own API on `127.0.0.1:8799` with `MONGODB_DB=dochess_e2e`
  (the dev `dochess` database is never touched).
- Creates Clerk test users via the Backend API, signs browsers in with
  single-use sign-in tickets (the production session-token path), and
  **deletes the users + drops the e2e database afterwards**.
- Covers: signed-out 401s, invalid/malformed/legacy-header rejection,
  save→reload persistence, cross-account isolation, logout state clearing,
  impersonation resistance, game finalize round-trip + idempotency,
  per-user game copies, leaderboard with real rating objects, and the
  `_onlineFinish` → `recordGame` wiring.
- Needs `.env` with `MONGODB_URI` + `CLERK_SECRET_KEY`; without them the
  file **skips** instead of faking results.

## Production deployment checklist

- [ ] Host with persistent-process support (VPS, Render, Railway, Fly —
  **not** static hosting, **not** `127.0.0.1` exposed to the internet).
- [ ] `NODE_ENV=production`, `HOST` bound behind a reverse proxy with TLS;
  browsers must use HTTPS/WSS origins.
- [ ] Secrets via the host's secret manager: `MONGODB_URI`, `CLERK_SECRET_KEY`,
  `UPSTASH_REDIS_REST_URL/_TOKEN`. Never commit `.env`.
- [ ] Atlas: IP allowlist for the host, M0→M10 when connection/load limits
  bite, scheduled backups (M10+ point-in-time; M0: export snapshots).
- [ ] `DOCHESS_DEV_NO_AUTH` unset (the server refuses to boot with it in
  production); `DOCHESS_DEV_FILE_STORE=0` if the file fallback must never
  engage silently (health reports the live store either way).
- [ ] Verify `/api/health` reports `productionReady: true` from the public
  URL; monitor `db.error`, `auth.jwksError`, `redis.ok`.
- [ ] If the player base outgrows the 500-candidate leaderboard scan,
  normalize a numeric rating field with a descending index (noted in code).
