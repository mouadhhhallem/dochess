# DoChess — Production fix report

Commit: **`d64e6c1`** (parent `d2bba0a`) on `master`.
Audit + fixes performed 2026-10-13. Companion document:
[`PRODUCTION_AUDIT.md`](PRODUCTION_AUDIT.md).

---

## 1. Headline finding (read this first)

**DoChess has never had a production backend.** The live site is static GitHub
Pages. Every server-backed feature — global ranking, persistent friendships,
server-side friend requests, durable match invitations, presence — is
**disabled in production**, because `apiBase()` deliberately returns `null`
on `*.github.io`.

Verified, not assumed:

| Check | Result |
| --- | --- |
| Live site | `https://mouadhhhallem.github.io/dochess/` → 200, static only |
| `gh api repos/mouadhhhallem/dochess/pages` | legacy Pages build from `master`, no custom domain |
| CI workflows | **none** (no `.github/` directory) |
| Deploy manifests | **none** (`railway.json`, `render.yaml`, `fly.toml`, `Procfile`, `Dockerfile` all absent) |
| Deploy credentials | **none** (no `RAILWAY*`/`RENDER*`/`VERCEL*`/`NETLIFY*`/`FLY*` env var, no `railway` CLI, `gh secret list` empty) |
| MongoDB Atlas from this machine | **unreachable** — TCP 27017 connects (`65.62.241.102`), every TLS handshake fails with `tlsv1 alert internal error` / `SSL alert number 80` |

So: the frontend was deployed and fixed. **The backend could not be
deployed from this environment** — no hosting credential exists, and no
Atlas-backed verification was possible. Section 10 lists exactly what an
operator must do. Nothing in this report claims a production backend check
that did not happen.

---

## 2. Bugs confirmed and fixed

Full detail with root causes and reproduction in `PRODUCTION_AUDIT.md`.

| ID | Bug | Root cause | Fix |
| --- | --- | --- | --- |
| S1-1 | Friendships/requests/presence/inbox/ranking lost on every restart | `server/lib/friends.mjs` held everything in process-memory `Map`s; docs claimed MongoDB | New `server/lib/social.mjs`, persisted through `lib/db.mjs`; `friends.mjs` deleted |
| S1-2 | Removal left a phantom one-way edge → phantom friend requests | `removeEdge` deleted only one direction | Friendships are undirected: one canonical row per pair, `f:<a>\|<b>` |
| S1-3 | **Declined requests came back** | `declineFriend` never called the server; requests were *derived* from edge asymmetry, so the requester's edge re-created them every ≤5 s poll | Explicit `requests` rows with a terminal status; decline is sent and reported in `resolved` |
| S1-4 | Removed friends re-created by polling | `pullEdges()` was additive-only — it never deleted | `pullSnapshot()` is authoritative: friends the server doesn't list are removed locally |
| S1-5 | Removal reported success regardless of outcome | fire-and-forget `api(...).catch(() => {})` | `removeFriend()` awaits, restores the row and reports an honest error on failure |
| S1-6 | **Removed friend came back after re-auth** | `adoptGuestShelf()` imported the never-cleared `ccf_guest` shelf into any empty account | guest shelf is stamped as adopted (once per browser) and honours tombstones |
| S1-10 | Invitations had no identity, expiry, status or authorization | an invite was just a `{code}` payload inside a notification; expiry was a client constant; anyone could push one at anyone | New invitation entity with server-minted match id, validated control, expiry, status; recipient-only accept; idempotent |
| S1-11 | Recipient "must visit the Online page" | accept called `showOnline()` and the popup was inbox-driven | popup is fed by `/api/invites` and is global (Home/Profile/Learn); accept goes straight to the board |
| S2-7 | Ladder was not global, not paginated, not deterministic | built from in-memory maps; `slice(0,100)`; tie-break on name | built from the `users` collection; `limit`/`offset`; `(rating desc, uid asc)` |
| S2-8 | A client could set its own ladder rating | `POST /api/rank/publish` stored `Math.max(prev, clientRating)` | endpoint removed; ratings replayed server-side from recorded games |
| S2-9 | Privacy leaks in the API | `/api/leaderboard` returned `{uid,name,image}` for everyone to everyone; `/api/hall` dumped every uid; `/api/friends/status` accepted any uid list; `/api/notify` accepted any recipient + an actionable `game-invite` kind | per-viewer **server-side** serialization; hall removed; presence restricted to counterparties; notify relationship-gated and non-actionable |
| S2-12 | "Invite sent" shown when delivery never happened | success message rendered before delivery, never revised | delivery reported only after a confirmed server write; honest offline message otherwise |
| S2-15 | Deploy-blocking encoding regression (uncommitted) | working-tree `index.html` was double-encoded, had a BOM and CRLF | restored to UTF-8, no BOM, LF; the 2 genuine CSS fixes kept |
| S3-13 | No time-control picker; mislabelled categories; rating/rank in the control menu | invite silently reused `localStorage.cc_control`; duration-based bucketing made 3 of 6 options read "Blitz" | real picker with the 6 required options, each once, grouped Bullet/Blitz/Rapid, no rating/rank |
| S3-14 | Stale assets after deploy | `max-age=300` with no `must-revalidate` | HTML `no-cache, must-revalidate`; assets `max-age=300, must-revalidate`; changed assets re-keyed |
| — | Suite red at step 1 | `js/learn.bundle.js` stale | rebuilt |
| — | New registration invisible on the ladder until it saved something | `updateUser` returned early without creating the doc | `ensureUser()` on `PUT /api/state` |
| — | Authenticated suites hard-failed instead of skipping | they `throw` when Atlas is unreachable | they `test.skip()` with the reason printed |

### Bugs found in my own new code (caught by the new tests, then fixed)

1. **`ensureUser` was a no-op** — `const existing = this.getUser(userId)` returned a Promise, which is always truthy, so the account was never created. Found by the "new account appears on the ladder" scenario.
2. **Inconsistent time-control units** — `TIME_CONTROLS` mixed seconds and minutes (`1+0 → base 60` vs `5+0 → base 5`), so `1+0` was rejected. Now minutes everywhere, category derived with the client's own rule.
3. **Optimistic-request flicker** — the authoritative delete removed a locally-optimistic outbound request when a snapshot landed between the optimistic write and the server write.
4. **Decline tombstone blocked re-requests** — a declined uid stayed tombstoned forever, so a legitimate later request was invisible. An explicit server `pending` row now supersedes the tombstone.
5. **Typed search wiped by re-render** — a background reconcile re-rendered the friends screen and cleared the search box; the query is now preserved in module state and re-applied.
6. **`declineFriend` misclassified** as `no-request` when the caller was actually the sender; now `not-recipient`.

---

## 2b. Follow-up round: the reported "Could not send request", the hall, and the ladder

Reported after the first deploy: *"when I invite someone — Could not send
request. The server refused the request?"*, plus *"the hall of fame should have
all the people from the database with their picture"* and *"the ranking should
have you and your friends and the rest from the database, but showing others
with blurry effects, and it should always be reloading because someone new may
have just registered"*.

### The "Could not send request" bug

Root cause, reproduced against a live API: **`POST /api/friends/request`
returns 401 whenever there is no valid Clerk session token.** The client
collapsed every failure into one message and — worse — **deleted the row the
user had just created**. So a signed-out user (or a transient token failure)
lost their action and was told a server that had merely refused a token had
"refused the request".

Four further defects surfaced while fixing it:

| Defect | Fix |
| --- | --- |
| One generic message for every failure | `explainFailure()` classifies 401 → *Sign in to use friends*, transport → *Cannot reach DoChess*, 409 → *Already friends*, 400 → *That player is not reachable*, 5xx → offline. The phrase "the server refused the request" is gone |
| A failed send **deleted the user's row** | The row is kept and flagged `unsent`, rendered as *"not delivered — nothing was sent"* with a **Retry** button; the authoritative snapshot preserves those rows instead of pruning them |
| **`authState` latched to "signed-out" after one 401**, permanently blocking every later retry for a user who *was* signed in | `isSignedOut()` now returns false whenever a live Clerk identity exists; only 401 (not 403) marks a session gone |
| An **inverted condition** in the snapshot cleared the `unsent` flag on every poll — found by the new test, not by review | The flag clears only once the server actually lists the request as pending |

### Hall of fame

Previously a **device-local list** titled "First 1000 through the door", and
the removed server endpoint had leaked every member's uid + full name to every
caller. Now `GET /api/hall` returns **every registered account** from the
authoritative `users` collection, **with avatars**, paginated, filtered by the
same per-viewer privacy rule as the ladder (strangers: first name only, no uid,
no full name). Without a backend it stays local and says so.

Avatars in the hall disclose nothing new: `/api/directory` already serves a
display name and avatar for any registered player to any signed-in account.

### Ladder

- `GET /api/rank` now also returns **every friend with their real global rank**,
  so a friend ranked outside the visible page is never lost (previously the
  "you and your friends" view truncated silently).
- One board in **true rank order**; friends show in full, strangers are
  **blurred**. The blur is presentation only — the server has already reduced a
  stranger to a first name, so nothing is hidden that was sent.
- **Auto-refresh every 30 s** while the tab is visible, on tab focus, and on
  demand via **Refresh now** — a player who just registered appears without a
  reload.
- A live backend that errors now reports *"unavailable"* instead of silently
  degrading to the device board, which would have shown a two-player local list
  as the global ladder.

### Verification for this round

- `npm test`: **92 passed, 0 failed, 23 skipped**. `node --test`: **57/57**.
- `test-friends-e2e.spec.js` grew from 11 to **14** scenarios; the three new
  ones cover exactly the reported symptoms (failed send kept + explained +
  retried, hall from the database with pictures, ladder with you/friends/
  blurred strangers in rank order and a new registration appearing on refresh).
- `test-friends.spec.js`: two tests updated from "strangers are not blurred"
  to the new contract.

---

## 3. Files changed

**Server**
- `server/lib/social.mjs` — **new**, 782 lines. The authoritative store.
- `server/lib/friends.mjs` — **deleted** (321 lines of in-memory Maps).
- `server/lib/db.mjs` — generic document API on both drivers (`getDoc`/`putDoc`/`delDoc`/`listDocs`/`findDocs`/`listUserIdentities`), `$or`/`$in` in the file store, `ensureUser`, `listAllGames`, 6 new Mongo indexes, lazily-resolved data dir.
- `server/index.mjs` — new routes, removed routes, per-viewer ranking, relationship-gated presence/inbox, server-composed lifecycle notifications, cache headers.
- `server/lib/env.mjs` — `DOCHESS_DATA_DIR` (test isolation).

**Client**
- `friends.js` — +1019/−? lines: tombstones, authoritative snapshot, awaited removal, guest-adoption marker, invitation entity, time-control picker, honest delivery, paginated ranking.
- `styles.css` — `#tc-overlay` picker + `.fr-pager`.
- `index.html` — encoding restored, `friends.js?v=5`, `app.js?v=52`.
- `js/learn.bundle.js` — rebuilt.

**Tests**
- `server/test/social.test.mjs` — **new**, 26 tests.
- `test-friends-e2e.spec.js` — **new**, 11 scenarios / two browser contexts.
- `test-friends.spec.js` — 5 tests updated to the new contract.
- `test-auth-e2e.spec.js`, `test-sync-accounts.spec.js` — skip honestly when Atlas is unreachable.
- `server/test/events-e2e.test.mjs` — rewritten around the real lifecycle.
- `server/test/friends.test.mjs` — deleted with its subject.

**Docs**
- `docs/PRODUCTION_AUDIT.md` — **new**.
- `docs/BACKEND.md` — route table, storage model, corrected deployment-status and performance claims.
- `docs/DEPLOY.md` — explicit "NOT DEPLOYED" banner and verified evidence.

---

## 4. Database / API migrations

All **additive** — new collections and indexes, no destructive change, no
data rewrite. Safe to roll forward; code rollback never requires a data
rollback.

New MongoDB collections (created lazily by the driver):
`friends`, `requests`, `invites`, `presence`, `notify`.

New indexes (created on boot by `MongoStore.connect`):
```
friends  {a:1}  {b:1}
requests {to:1} {from:1}
invites  {to:1} {expiresAt:1}
notify   {to:1, at:-1}
```

Removed routes (callers updated in the same commit):
`POST /api/friends/add`, `GET /api/friends/list`, `GET /api/friends/requests`,
`POST /api/rank/publish`, `POST /api/hall/join`, `GET /api/hall`.

New routes: `POST /api/friends/request`, `POST /api/friends/respond`,
`POST /api/friends/cancel`, `GET /api/friends/snapshot`, `POST /api/invites`,
`GET /api/invites`, `POST /api/invites/respond`.

> The previous in-memory graph has no on-disk representation, so there is
> nothing to migrate from it. Existing `users`/`games` documents are
> untouched; accounts that never synced still do not appear on the ladder
> until their first `PUT /api/state`.

---

## 5. Security and privacy changes

| Issue | Before | After |
| --- | --- | --- |
| Ladder privacy | `/api/leaderboard` returned `{uid, name, image}` for every player to every caller; the browser stripped it | Per-viewer serialization in `social.mjs:serializeRow`. A stranger's row has **no uid, full name, photo or email in the response** — the fields are never selected |
| Forged friend list | `?friends=<uid>` from the client widened the view | No client-supplied friend list parameter exists; the server derives friends from its own rows |
| Self-rated ladder | `POST /api/rank/publish` → `Math.max(prev, clientRating)`, so any account could set itself 4000 | Endpoint removed; ratings replayed from recorded games |
| Forged invitations | `POST /api/notify` accepted `kind: 'game-invite'` with an attacker-chosen room code from **any** account to **any** uid | Actionable kinds are not caller-selectable; invitations require friendship via `POST /api/invites` |
| Inbox spam | `POST /api/notify` to any uid, arbitrary title/body | Relationship-gated (friends or request counterparties); titles for lifecycle events are composed server-side |
| Presence enumeration | `GET /api/friends/status?uids=` accepted any uid list | Intersected with the caller's friends + request counterparties |
| Global uid dump | `GET /api/hall` returned every member's uid + full name | Removed; the hall is device-local and labelled as such |
| One-way removal | `removeEdge` left the other direction intact | Undirected model |
| Secret scanning | — | Staged diff scanned: no `sk_`/`pk_`/Atlas URI/Upstash token/GitHub token. `.env` is gitignored and uncommitted |

---

## 6. Test results (real, reproducible)

### `npm test` — full suite, exit 0

| Gate | Command | Result |
| --- | --- | --- |
| Learn bundle freshness | `tools/build-learn.mjs --check` | **PASS** (`learn bundle up to date`) |
| Curriculum gate | `tools/check-batch1.mjs` | **PASS** 94/94 |
| Elo unit gate | `test-elo.js` | **PASS** 14/14 |
| Draw gate | `test-draws.js` | **PASS** 14/14 |
| Move generator | `perft.js` | **PASS** 5/5 (startpos d4 197281; kiwipete d3 97862; …) |
| Server units/integration | `node --test server/test/*.test.mjs` | **PASS** 55/55, 0 skipped |
| Browser E2E | `playwright test` | **89 passed, 0 failed, 23 skipped** |

The 23 skips are `test-auth-e2e.spec.js` (14) and `test-sync-accounts.spec.js`
(9). They need a **reachable MongoDB Atlas + Clerk** and print the reason:

```
sync e2e needs a reachable MongoDB Atlas; db.kind=none db.error=<tls alert>
```

They did not run, and are not counted as passing.

### New server coverage — `server/test/social.test.mjs` (26/26)

Undirected removal + durability across a new store instance · persistence of
friendships across instances · decline permanence across repeated polls ·
accept clearing the pending request · duplicate accept idempotent + racing
decline not undoing it · recipient-only respond · self-request and duplicate
request rejection · explicit re-ask after a decline · cancel durability ·
already-friends rejection · hostile uid rejection · invitation carrying
match id/control/expiry · persisted across instances · friendship required to
invite · only the six controls accepted · recipient-only accept · double-accept
= one match · expired/unknown/malformed rejection · decline clearing the
queue · presence TTL + ghost sweep · ladder completeness + pagination without
gaps or duplicates · new account at 800 · ordering stability · ratings derived
from games · Elo replay determinism · stranger row carrying no uid/name/photo
/email · friend-facing visibility · forged friend list rejected · tiers ·
six unique time controls.

### New E2E — `test-friends-e2e.spec.js` (11/11), two browser contexts

Real Node API + real HTTP + two `browser.newContext()` identities with
separate cookies and separate localStorage.

| # | Scenario | Covered |
| --- | --- | --- |
| 1 | A → B request | pending on B, never a friendship, sender shows Sent |
| 2 | B declines; both refresh | still declined; no friendship; **3 poll cycles do not resurrect it** |
| 3 | re-request + accept; both refresh | friendship on both sides |
| 4 | A removes B; refresh + **full re-auth in brand-new contexts** | removed on both sides; no phantom request |
| 4b | **API restarted mid-suite** | friendship survives → persistence proven, not memory |
| 5 | 5 registered accounts on the ladder | all present, incl. two who never played |
| 6 | new registration | appears immediately, rating 800, tier bronze |
| 7 | privacy | first name only; **no `uid`/`img` key**; no full names, no `@`, no `Bearer` anywhere in the payload |
| 8 | all six time controls | each creates a valid invitation with the exact control |
| 9 | recipient on Home / Profile / Learn | popup appears; Online screen is **not** active |
| 10 | accept | lands on the same room code without visiting Online |
| 12-13 | decline, expire, malformed, duplicate, unauthorized | each rejected distinctly; double-accept idempotent |
| 14 | API returns 503 on removal | UI **rolls back** and shows an honest error; server still has the friendship |
| 14b | stale snapshot vs newer local state | the removal stands; the stale response cannot resurrect |
| 15 | **no backend configured** | `apiBase() === null`, board labelled "Device board", no "Global ladder" |
| 6b | presence | stranger's presence withheld, friend's returned |
| — | inbox | a stranger cannot write to anyone's inbox |

---

## 7. Two-browser multiplayer verification

**Verified locally against a real backend.** `test-friends.spec.js` +
`test-friends-e2e.spec.js` drive two independent authenticated contexts: the
sender hosts a live PeerJS room and the recipient receives the invitation
while parked on Home/Profile/Learn, accepts, and both reach the **same room
code** (`window.app.online.code === 'CCC333'`) with the invitation accepted
server-side first. Existing P2P coverage (`test-online-clocks`,
`test-quickmatch`, `test-elo-*`) still passes: the two browsers agree on
position, turn and clock (worst measured cross-device drift **1.9 ms**),
rating deltas are applied per player (`800 → 820` / `800 → 780`).

**Not verified in production** — that needs a deployed backend and a second
real browser session, and neither is available here (section 1).

---

## 8. Global leaderboard verification with real accounts

**Verified locally** with five real accounts registered through
`PUT /api/state` (Alice, Bob, Carol, Dave, Eve) against a real API process:
all five appear, the viewer is highlighted, unrated accounts sit at 800,
pagination covers every rank exactly once, ordering is stable across
requests, and a stranger's row carries no identifier.

**Not verified against production Atlas** — unreachable from this machine.

---

## 9. Production deployment

### Frontend — deployed and verified

| | |
| --- | --- |
| Live URL | `https://mouadhhhallem.github.io/dochess/` |
| Commits pushed | `d64e6c1` → `6aa617f` → `5fcf95d` → **`0145388`** |
| Pages build | `status: built` at commit `0145388a88379896214eab3a3650aaf29413ba85` (39.5 s) |
| Deployed commit hash | `0145388a88379896214eab3a3650aaf29413ba85` |
| Branch | `master` (Pages builds from `master` root) |

### Backend — NOT deployed (blocker, not an omission)

No hosting credential exists on this machine and no host was provisioned.
`docs/DEPLOY.md` has the full manual procedure; section 10 below lists the
exact steps.

---

## 10. Live verification actually performed (real browser, production URL)

Run against `https://mouadhhhallem.github.io/dochess/index.html` after the
Pages build at `0145388` completed:

| Check | Result |
| --- | --- |
| `window.DoChessFriends.version` | **4** → the new build is live, not a cached old bundle |
| `apiBase()` | **null** → correctly in device-local mode |
| Ranking header text | `#2 Self Player 2 players on this device · blitz · you hold 800 BRONZE` — pluralisation correct, and it says *players on this device*, not *registered players* |
| Claims "Global ladder"? | **false** — a device board is never presented as global |
| Says "Device board" + explains why | **true** — *"This browser is not connected to the ranking service, so only players this device has met are listed."* |
| `/api/*` requests attempted | **0** — the sync health probe no longer fires pointlessly on static hosting |
| **Console errors** | **0** |
| **Failed network requests** | **0** |
| Deployed `index.html` encoding | no BOM, **0 mojibake sequences**, `<title>` contains U+2014 (em dash) correctly |
| Deployed assets contain the new code | `tc-overlay`, `pickTimeControl`, `invites/respond`, `friends/snapshot`, `pullSnapshot`, `adoptGuestShelf` all present in the served `friends.js` |

Three defects were found **only** by this live check and then fixed and
re-deployed:

1. `js/sync.js` fired a same-origin `/api/health` probe on every page load
   even with no backend → 404 + a red console error for every visitor.
2. The ranking header said "registered players" on a device board.
3. My own fix for (2) produced "2 player on this devices" — caught live,
   fixed, and now covered by a regression assertion.

**Not verified live** (needs a backend that does not exist):
two-browser multiplayer against production, and a global leaderboard of real
registered accounts against production Atlas. Those are proven locally
against a real API process and are explicitly blocked in production.

---

## 11. Exact manual actions required

To make the platform genuinely global, in order:

1. **Deploy the API.** Create a Node service (Railway / Render / Fly / a
   VPS) from this repo with start command `node server/index.mjs`.
2. **Set host variables:** `MONGODB_URI`, `MONGODB_DB=dochess`,
   `CLERK_SECRET_KEY` (**production** instance), `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`, `HOST=0.0.0.0`, `NODE_ENV=production`,
   `CORS_ORIGIN=https://mouadhhhallem.github.io`,
   `DOCHESS_DEV_FILE_STORE=0`. Leave `PORT` to the host.
3. **Verify** `curl https://<api>/api/health` → `productionReady: true`,
   `db.kind: "mongo"`, `auth.mode: "clerk"`.
4. **Promote Clerk to a production instance** and put its publishable key in
   `clerk-config.js` (currently a `pk_test_` dev key) and its secret key on
   the host. Add both origins to Clerk → Allowed origins.
5. **Point the frontend at the API.** Add a `DEFAULT_API_BASE` constant in
   `app.js` / `friends.js` next to `apiBase()` and return it when no
   `cc_api_base` override exists. It is deliberately left unset so the app
   degrades honestly instead of firing requests at a dead host.
6. **Add the host to the CSP.** `index.html:12` already allows
   `https://*.up.railway.app` and `https://*.onrender.com`; add your domain
   if it differs.
7. **Atlas:** IP allow-list for the host, least-privilege DB user scoped to
   `dochess`, scheduled backups (M0 has no point-in-time restore).
8. **Re-run the gated suites** once Atlas is reachable:
   `npx playwright test test-auth-e2e.spec.js test-sync-accounts.spec.js`.
   They currently skip; 23 tests have not been executed.
9. **Redis** is optional; without it rate limits fall back to per-instance
   in-memory windows (correct for one instance, degraded for several).

---

## 12. Remaining blockers and unresolved items

**Blockers (environmental, not code):**
- No backend host credential → the global features cannot be live.
- MongoDB Atlas unreachable from this environment → the 23 authenticated
  tests have not run; no Atlas-backed claim is made.

**Known limitations I did not change (deliberate, documented):**
- **No server-authoritative anti-cheat.** The server is still an
  authenticated history store, not a referee. Ratings are derived from
  *recorded* results, so a client can still report a false result for its own
  account. Fixing this needs a WebSocket authority; that decision stands.
- **The quick-match queue and the SSE bus are process-local.** The queue
  (`lib/mm.mjs`) and subscriber set do not survive a restart and are not
  shared across instances. Documented; not load-bearing for the reported bugs.
- **Match transport is still PeerJS/P2P.** A 3-minute client TTL applies only
  to the device-local fallback; server invitations expire server-side after
  10 minutes.
- **Cross-device clock/board consistency in P2P games** rests on the host
  tab's authority and epoch fencing. Measured drift is 1.9 ms, but there is
  no server referee.
- **The hall of fame is device-local** and labelled as such. It was a global
  uid dump before; making it genuinely global is a product decision, not a
  bug fix, so I removed the leak rather than inventing a registry.
- **`dream-canvas-player/`** is an unrelated untracked sub-project that was
  already in the working tree. It was deliberately **not** committed.

---

## 13. Commits

| Commit | Contents |
| --- | --- |
| `d64e6c1` | The audit fixes (server social graph, ladder, invitations, client reconcile, tests, docs) |
| `6aa617f` | `docs/PRODUCTION_FIX_REPORT.md` |
| `5fcf95d` | Live-check fixes: sync health probe, device-board copy |
| `0145388` | Pluralisation fix (caught live, not by the unit suite) |

Deployed: `0145388`.