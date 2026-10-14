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

## 2c. Asset and encoding round ("still a lot of things are not working")

Rather than guess, every screen of the **deployed** site was driven in a real
browser (desktop 1280×860 and phone 390×844), clicking the real navigation and
recording console errors, page errors, HTTP failures, broken images and layout
overflow. That sweep found three genuine defects.

### Dead piece artwork — the biggest one

The chess artwork lives inside a **set folder**:

```
assets/pieces/pieces-main/white-knight.svg   ← real file
assets/pieces/pieces-second/white-knight.svg ← real file
assets/pieces/white-knight.svg              ← does NOT exist
```

Eight code sites built the third form:

| Where | Consequence when it fired |
| --- | --- |
| `styles.css` (profile knight watermark) | **404 on every single page load**, and the watermark was simply absent |
| `app.js`, `home.js`, `puzzles.js`, `study.js`, `js/board.js`, `js/learn.js` (×2) | Only ran when `window.DoChessPieces` failed to load — invisible in normal use, but when it happened **every board on that screen lost its pieces** |

All eight now name a real folder, and the CSS follows both the classic and
modern piece sets.

### Missing Grandmaster badge

`achievements.js` declares a `grandmaster` tier (2100+) with no SVG. The badge
would have 404'd at the exact moment a player earned it. `badge-grandmaster.svg`
added in the same visual language as the other 50.

### Corrupted UTF-8 in six source files

`home.js`, `puzzles.js`, `study.js`, `js/learn.js`, `js/learn.bundle.js` and
`server/lib/db.mjs` had been through a UTF-8 → cp1252 → UTF-8 round trip, which
mangled every em dash and arrow in their comments. Caught by three Playwright
assertions that expected a literal star glyph in the Learn screen and received
its mojibake equivalent. Restored; no behaviour changed.

### New guards, wired into `npm test`

| Guard | Prevents |
| --- | --- |
| `tools/check-piece-paths.mjs` | any piece path that does not resolve on disk, or that omits the set folder |
| `tools/check-badge-art.mjs` | any tier/badge id without its SVG |
| `tools/check-encoding.mjs` | mojibake or a BOM in any tracked text file |

`tools/fix-piece-paths.mjs` and `tools/repair-mojibake.mjs` are kept as the
documented, repeatable form of both repairs.

### Verification

`npm test`: **92 passed, 0 failed**, 23 skipped. `node --test`: **57/57**.

Post-deploy sweep of the live site: **0 problems** across every screen, both
viewports. Functional check on the live site:

```
OK  home board pieces load — 32/32
OK  profile knight watermark loads — loaded
OK  learn picker populated
OK  a level opens with squares — 64 squares
OK  board responds to a click — move log 45 chars
OK  online lobby renders — presets=6
OK  adding a friend works offline (no false error) — 1 row, 0 undelivered
OK  ranking renders offline
OK  hall renders offline
console/page errors: 0
```

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
| `9817820`–`63f70e0` | Failed-send honesty + retry, global hall/ladder, device-board copy |
| `1f64b88`–`88fa863` | Piece-artwork, badge, mojibake repairs + guards + live sweep |

Deployed: `88fa863` (Pages build `built` at this commit, verified
2026-10-14).

---

## 14. Re-verification 2026-10-14 (this mission)

Re-ran everything instead of trusting the notes above:

- Unit/integration gates: bundle fresh, curriculum 94/94, elo 14/14,
  draws 14/14, perft 5/5, `node --test` **57/57**.
- Full Playwright suite: **92 passed, 0 failed, 23 skipped**
  (Atlas+Clerk unreachable, suites skip with reason — not counted green).
- Friends E2E (two independent contexts): **14/14**.
- Live site: 200, Pages `built` at `88fa863`, frontend in sync with
  `origin/master`, working tree clean — **no deployment was needed and
  none was performed** (pushing an empty commit would only churn the
  build).
- Secret scan of tracked files: clean. `.env` stays gitignored.
- Result: **no new bugs, no regressions, no code changes required.**
  Backend deployment remains blocked on operator action (§10/§11) —
  unchanged, and reported honestly rather than fabricated.

---

## 15. Sender auto-join, full-registry ladder, open hall of fame (2026-10-14)

Three user-reported items, all reproduced first, then fixed and verified:

1. **Sender stranded on the friends panel.** The recipient's accept went
   straight to the board, but the sender — who is hosting the room — got no
   signal and had to walk Friends → Online by hand. Root cause: `GET
   /api/invites` returned only RECEIVED invites, nothing polled the sender's
   pending invite, and the `invite-accepted` push was handled by re-pulling
   received invites only. Fix: the response now carries `sent` (own invites
   with live status + recipient name); the client watches them on every
   poll/push/boot (`watchSentInvite`). On accept the sender is taken to the
   live waiting room — or, if a reload killed the room, the SAME code is
   re-hosted (same control) and then shown. Decline clears silently (the
   server inbox note carries the news); expiry clears with an honest
   message. Proven by new E2E test 11 (real UI: Invite → picker → send →
   accept → sender on board; plus the decline case).
2. **Ladder missing registered users who never synced.** The board was built
   from the `users` collection only, so ~10 real Clerk accounts (Mohamed
   Jebahi, Mossab Hallem, archie, …) were invisible. Fix: `clerkListUsers`
   paginates the full Clerk registry (120 s cache, `{list, complete}`
   honesty reporting); rank/hall union it under the users collection
   (collection wins conflicts; ratings still replay from games). Verified
   live against the real Clerk API: `scope=all`, all 10 accounts on the
   ladder at 800. Ladder stranger privacy unchanged (first name, no
   uid/photo).
3. **Hall of fame hid names.** Per explicit owner decision the hall now
   shows the FIRST 1000 accounts with FULL names + avatars, unblurred
   (contract `naming: full`; no uid/email; signed-in-only). Client blur
   removed in the hall only.

Test deltas: `node --test` **61/61** (+4: Clerk pagination, incomplete
reporting, registry union, sent-invite lifecycle); full Playwright suite
**93 passed, 0 failed, 23 skipped** (Atlas-only skips); friends E2E
**15/15** (+test 11). Asset re-keyed (`friends.js?v=7`).

---

## 16. Streaks that survive, true presence, photos, 100/page, rapid-first, XP (2026-10-15)

A second user batch, each reproduced before fixing:

1. **Friend streak reset to 0 after refresh.** Day stamps lived only in
   the browser shelf. Now `POST /api/games` carries `oppUid` and the
   server stamps the shared day for BOTH players from EITHER copy (new
   `streaks` collection, one shared day per calendar day); the snapshot
   carries the day map + exact count back and the client unions
   (per-day max, `max(local run, server count)`). Same-game-same-day
   never double-counts. The daily/login streak in the hero now unions
   Learn activity + achievements play-days + game history instead of
   Learn-only (game-only players stared at 0).
2. **Presence inversions + no durations.** Background tabs skipped the
   heartbeat (shown offline mid-game); tab close left a ~2 min ghost
   "online". Now: heartbeat runs in hidden tabs, `pagehide` fires a
   keepalive goodbye, sign-out awaits `presence/leave`, the row is
   deleted at once, and "last seen" prefers the server timestamp with
   full granularity (seconds → minutes → hours → days → weeks →
   months). The friends grid repaints presence every 30 s while open.
3. **Missing avatars on the ladder.** Two root causes: the ladder
   serializer never sent photos for self/friends, and the account
   profile photo went stale while presence photos stayed fresh. Now the
   ladder carries self/friend photos (strangers: still none), every
   heartbeat refreshes the account photo, and board rows prefer the
   server photo.
4. **100 per page + live totals.** Ladder and hall request 100-row
   pages (server max), pagers step 100, and the hall auto-refreshes on
   the same 30 s cadence as the ladder. New signups appear via the
   Clerk-registry union (120 s cache) with `scope` honesty.
5. **Rapid-first Elo.** Rapid is now the default category server-side
   (`cleanCat`), in the ranking tabs (Rapid/Blitz/Bullet), in the hero
   and first in the profile. Per-control separation was verified
   end to end (rapid win moves rapid only; new E2E asserts blitz
   untouched). Game records carry per-game control ids as before.
6. **Experience with fixed amounts.** Server ledger (`GET /api/xp`):
   games 20/10/5, friend-streak milestones 50/150/400/1000, win-streak
   milestones 15/40/100/250, first puzzle solve +10 (`POST
   /api/puzzles/solve`). Duplicates/retries never double-pay. The hero
   shows the combined total (Learn + server) with a per-source
   breakdown and Learn's level rule.

Test deltas: `node --test` **69/69** (+8: streak stamp/both-sides,
no-pay cases, win-streak milestones, 7-day milestone once-per-run,
puzzle idempotency, touchProfile, presence leave, ladder photos);
friends unit spec covers server-count healing + the full last-seen
scale; new E2E test 16 (record on both sides → wipe local days →
snapshot heals to 1 on both browsers; XP totals; rapid/blitz
separation; leave clears instantly). Full Playwright suite: **94
passed, 23 skipped, 1 flaky** (`quickmatch` P2P pairing failed once
under full-suite load, green alone and green as a file — timing, not
a regression). Assets re-keyed (`friends.js?v=8`, `app.js?v=54`,
`puzzles.js?v=5`).

---

## 17. Names, test-junk purge, instant presence, XP on the card (2026-10-15)

A third user batch from the live local server:

1. **Friend list showed my own name.** Root cause, confirmed in the
   production data: the accept path mirrored the requester's VIEW of
   the accepter under BOTH friendship keys, so the accepter read
   their own name (`names: {both: "Mouadh"}`). Fix: names are stored
   self-keyed (accepter asserts their live name, requester's real name
   is read from their profile/presence); `listFriends` resolves
   `names[other] → profile → presence`, distrusts mirror-damaged rows
   (identical value under both keys) in favour of profile/presence,
   and never falls back to `names[self]`. The live row was repaired
   from the account docs.
2. **Test accounts on the hall of fame.** Oct 12–13 manual-test runs
   left 10 junk accounts (Alice Wonder ×3, Bobby Tables ×2, Final
   Alice/Bob, Rank Alice, devsmoke) plus their requests/inbox rows in
   `server/.data`. Purged with a backup kept (`server/.data.bak-*`,
   gitignored); real accounts, games, friendships, invites, streaks,
   XP and presence untouched. Test spawns that could fall back to the
   dev data dir now pin isolated temp dirs.
3. **Email addresses as display names.** Clerk users whose only name
   is an email username showed the full address on ladder/hall/
   directory. Email-like usernames now resolve to `Player`.
4. **Presence instantly both ways.** The tab-close beacon now fires
   synchronously with the cached token (pagehide cannot await a fresh
   one — that was the 5-minute ghost); sign-out awaits
   `presence/leave`; the first heartbeat retries every poll until it
   lands (Clerk sessions resolve seconds after boot), so "online now"
   appears immediately too.
5. **XP where play happens.** The game-over card now shows `+N XP`
   beside the rating move (same ledger for friend games and
   quick-match: win +20 / draw +10 / loss +5), and opening the Online
   screen refreshes the ledger. Nothing is granted for merely sending
   an invite — only finished games, streaks and puzzle solves pay.

Test deltas: `node --test` **71/71** (+2 name-convention tests);
E2E test 16 extended with both-sides snapshot-name assertions.
Assets re-keyed (`friends.js?v=9`, `app.js?v=55`).

---

## 18. Presence that is actually instant (2026-10-15)

"Offline still not instant": two deeper root causes beneath the beacon.

1. **The goodbye listener was on the wrong target.** `pagehide`
   fires at the WINDOW, but the beacon was registered on
   `document` — so it never ran anywhere, production included.
   Now `window.addEventListener('pagehide', …)` with a synchronously
   fired keepalive fetch (cached token only — pagehide cannot await
   a fresh one). Any sign-out path (own button, Clerk menu, expired
   session detected by the shelf watcher) also fires the goodbye.
2. **Nothing pushed to the friend's screen.** The observer repainted
   presence every 30 s, so even a working goodbye read late. Now the
   server fans `presence` events out to all friends on leave AND on a
   real return (first beat after minutes away; repeat beats stay
   silent), and the open friends screen repaints on arrival —
   typically 1–2 s. The push payload is stashed so "last seen just
   now" renders even though the server row is already deleted.

New E2E test 17 proves the user's exact complaint on pixels: B parks
on the friends screen; A comes online → B reads "online now" with no
reload; A leaves → B reads "last seen …" with no reload; firing
pagehide clears A's server row far inside the ~90 s TTL. Assets
re-keyed (`friends.js?v=10`).

---

## 19. Search faces, request names, re-add names (2026-10-15)

One family — "each has its name, don't mix things": every string
about a counterpart is now resolved to the right person.

1. **Search showed names without pdp.** The directory merge was
   first-win, so a local `{name:'', img:null}` friend placeholder
   shadowed the presence/Clerk rows carrying the real face. The merge
   now UNIONS fields per uid (first real name wins, first real photo
   wins, friends surface first, still capped at 20), and the client
   backfills server photos into the shelf plus overlays them on
   search rows that lack one.
2. **"MY name wants to be your friend".** The request inbox note and
   the recipient's request row used the request row's stored name —
   which is the requester's VIEW of the target, i.e. the recipient's
   own name back at them (plus a null photo). Now the request row
   stores the requester's SELF-assertion (`fromName`/`fromImg`,
   alongside the target view kept for the sender's Sent list);
   inbox titles, recipient rows and the invite-decline note resolve
   requester → `myName` → stored self-assertion → live profile →
   presence (the invite-decline note previously read `undefined` as
   "Player"). Email-like usernames resolve to `Player`, never the
   address.
3. **Remove → re-add → accept showed my name until refresh.** Same
   root as (2): the accepter's local row was built from the wrongly
   named request. Fixed at the root — new E2E test 18 drives remove
   (real click + confirm), re-add and accept with NO refresh and
   asserts each side reads the other person's name.

Also purged earlier in this round: 10 Oct 12–13 manual-test accounts
removed from the live dev store (backup kept, gitignored); test
spawns that could fall back to the dev data dir now pin isolated
temp dirs.

Test deltas: `node --test` **74/74**; friends E2E **18/18** (+18).
Assets re-keyed (`friends.js?v=11`).