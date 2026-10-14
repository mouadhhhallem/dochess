# DoChess — Production audit

Audit of commit `d2bba0a` on `master` (working tree also inspected).
Date: 2026-10-13. Auditor: senior full-stack review of the actual repository,
not the previous implementation notes.

Every item below was **confirmed by reading the code**, and the root causes
were **reproduced** where the environment allowed (local Node API + dev file
store + Playwright). Where a claim could not be verified in production, that is
stated explicitly instead of being asserted.

---

## 0. Executive summary

The three reported bugs are **not three bugs**. They are three symptoms of one
root cause plus two independent client-state bugs:

| # | Reported symptom | Actual root cause |
| --- | --- | --- |
| 1 | Removing a friend "works", then the friend is back after refresh | **No backend is deployed**, so nothing is persisted off-device; plus three independent client resurrection paths (`adoptGuestShelf`, `pullEdges` never deletes, fire-and-forget removal) |
| 2 | Ranking shows only me and my friend | `apiBase()` is `null` on GitHub Pages, so the app renders **tier 3**, the device-local `ccr_board` |
| 3 | Invitee must visit the Online page to join | No match-invitation entity exists anywhere; delivery is a best-effort PeerJS dial, and accept calls `showOnline()` |
| 4 | Declining a request comes back after refresh | A decline is **never sent to the server**; requests are *derived* from edge asymmetry, so the requester's edge re-creates the request on the next poll (≤5 s) |

The single most important finding is architectural:

> **DoChess has never had a production backend.** The site is static GitHub
> Pages. Every server-backed feature is disabled in production.

`docs/DEPLOY.md` describes a Railway deployment, but every value in it is a
literal placeholder (`https://<your-api>.up.railway.app`), there is no CI
workflow, no `.github/` directory, no Railway/Render/Heroku configuration, and
no deployment token anywhere on this machine. `docs/BACKEND.md` claims
`productionReady: true` against "the Atlas cluster"; that claim could not be
reproduced — see §7.

---

## 1. The deployment-shaped root cause (Severity: **Critical**)

### 1.1 `apiBase()` returns `null` on the production host

`friends.js:113-122` and `app.js:2303-2314` are identical:

```js
function apiBase() {
    try {
        const ov = localStorage.getItem('cc_api_base');
        if (ov) return String(ov).replace(/\/+$/, '');
    } catch (_) {}
    try {
        if (location.protocol.indexOf('http') === 0 && !/\.github\.io$/.test(location.hostname)) return '';
    } catch (_) {}
    return null;
}
```

The production host is `mouadhhhallem.github.io` (verified: `GET
https://mouadhhhallem.github.io/dochess/index.html` → 200, and `gh api
repos/mouadhhhallem/dochess/pages` → `html_url:
https://mouadhhhallem.github.io/dochess/`). The `*.github.io` guard therefore
matches, no `/api` origin exists, and `cc_api_base` is never set by the build.

**Every one of these is a no-op in production** (all guarded by
`apiBase() !== null`):

- `POST /api/friends/add`, `/api/friends/remove`, `/api/friends/list`, `/api/friends/requests`
- `GET /api/rank`, `GET /api/leaderboard`, `GET /api/directory`
- `POST /api/notify`, `POST /api/presence`, `GET /api/events` (SSE)
- `POST /api/mm/*`, `POST /api/rank/publish`

Confirmed on the live site: the deployed `index.html` contains no
`cc_api_base` reference at all, so no user can configure it without devtools.

**Consequence:** the production product is a single-device, localStorage-only
application. "Global ranking", "friend requests", "instant invites" and
"presence" do not exist in production. The app is honest about *some* of this
(`friends.js:1271` says "Device board — connect the API for the global
ladder.") but the invitation and notification flows still print success
messages for deliveries that never happened (§4.3).

**Reproduction:** open `https://mouadhhhallem.github.io/dochess/`, sign in,
open Friends → Ranking. The header reads *Device board*, and the ladder
contains only players this browser has met (`ccr_board`).

### 1.2 No backend is deployed anywhere

- No `.github/` directory, no CI workflow of any kind (searched: zero `*.yml`
  outside `skills/`).
- `docs/DEPLOY.md` is a manual guide full of `<your-api>` placeholders; the
  repository contains no `railway.json`, `render.yaml`, `fly.toml`,
  `Procfile` or Dockerfile.
- No deployment credential on this machine: `RAILWAY*`, `RENDER*`, `VERCEL*`,
  `NETLIFY*`, `FLY*`, `SUPABASE*` environment variables are all absent, the
  `railway` CLI is not installed, and `gh secret list` is empty.
- The only GitHub credential present is `gh` (scopes `gist, read:org, repo`),
  which can publish the **static site** but cannot host a Node process.

**This is the hard blocker on §3 and §5 of the mission.** Everything else is
fixable in code; this is not fixable without an operator action (§12 of the
fix report).

---

## 2. Confirmed defects

Severity: **S1** = breaks a reported user-facing feature; **S2** = data
integrity / privacy; **S3** = correctness or robustness.

### S1-1 — The friend graph is process-memory, not a database (**S2**, critical)

`server/lib/friends.mjs` stores *everything* in JavaScript `Map`s:

```js
const edges = new Map();      // friendships
const presence = new Map();   // online users
const directory = new Map();  // searchable players
const inboxes = new Map();    // notifications
const ranks = new Map();      // the "global ladder"
const hallRows = [];          // hall of fame
```

`server/index.mjs:252` instantiates it once per process. **Nothing is ever
written to MongoDB.** A restart, a redeploy, or a second instance silently
loses every friendship, request, notification, rating and presence record —
while `docs/BACKEND.md:48-67` describes MongoDB collections for `users` and
`games` only and never mentions that the social graph has no persistence at
all.

This alone makes "remove a friend" non-durable on any server-backed
deployment: the moment the process recycles, the graph is empty and the two
clients disagree.

### S1-2 — `removeEdge` deletes only one direction (**S2**)

`server/lib/friends.mjs:113-118`:

```js
function removeEdge(uid, friendUid) {
    uid = cleanUid(uid); friendUid = cleanUid(friendUid);
    if (!uid || !friendUid) return false;
    const m = edges.get(uid);
    return m ? m.delete(friendUid) : false;
}
```

After A removes B, **B still lists A**. `inboundRequests()` then reports A to B
as a pending inbound request (because B's list has no A), so:

- B sees a phantom friend request from someone A has deleted;
- B accepting it silently re-creates the friendship A just removed.

### S1-3 — A decline is never sent to the server, and requests are derived from edge asymmetry (**S1**, critical)

`server/lib/friends.mjs:137-157` derives inbound requests from the graph:

```js
for (const [otherUid, otherMap] of edges) {
    if (otherUid === uid) continue;
    if (!otherMap || !otherMap.has(uid)) continue;   // they list me
    if (mine.has(otherUid)) continue;                // I already list them
    ...push...
}
```

The client, `friends.js:219-226`:

```js
function declineFriend(uid) {
    S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
    try { serverNotify(uid, 'friend-decline', ...); } catch (_) {}   // only a notification
    save(); renderBell();
}
```

**`declineFriend` never calls `friends/remove`**, so the requester's edge
survives. `pullRequests()` (`friends.js:267-287`) is called from
`watchInbox()` every 5 s, from `open()`, from `acceptFriend()` and from every
SSE `friends` event; it has **no declined-list**, so it re-creates the
`pendingIn` entry. **The declined request returns within one poll cycle** —
precisely the reported symptom.

Reproduction (server-backed): A sends request → B declines → B refreshes →
request is back.

### S1-4 — `pullEdges()` is additive-only, so it resurrects deleted friends (**S1**)

`friends.js:234-262` walks the server edge list and **creates** missing local
records (`friends.js:244`) but never deletes a local record that the server no
longer knows about. Any removal that fails server-side (offline, 5xx, timeout
at `friends.js:128-144`) is therefore silently undone on the next poll.

### S1-5 — Removal is fire-and-forget with no error handling (**S1**)

`friends.js:227-233`:

```js
function removeFriend(uid) {
    delete S.friends[uid];
    S.pendingOut = S.pendingOut.filter((x) => x !== uid);
    S.pendingIn = S.pendingIn.filter((p) => p.uid !== uid);
    save(); renderBell();
    try { if (apiBase() !== null) api('friends/remove', { friendUid: uid }).catch(() => {}); } catch (_) {}
}
```

The UI updates instantly and permanently regardless of whether the server
accepted the mutation. `.catch(() => {})` swallows every failure. This is
literally "appears to work, then comes back".

### S1-6 — `adoptGuestShelf()` resurrects removed friends on the next sign-in (**S1**)

`friends.js:79-98` copies the guest shelf into any **empty** account shelf and
**never marks `ccf_guest` as migrated**:

```js
function adoptGuestShelf() {
    const g = JSON.parse(localStorage.getItem('ccf_guest') || 'null');
    ...
    if (Object.keys(S.friends).length || S.pendingIn.length || S.inbox.length) return; // hands off
    for (const [fid, f] of Object.entries(guestFriends)) { if (!S.friends[fid]) S.friends[fid] = { ...f }; }
```

Exact reproduction of the reported "friend removal doesn't stick":

1. Signed out as guest, add friend X → `ccf_guest.friends.X`.
2. Sign in to account A → X is adopted into `ccf_A`; **`ccf_guest` keeps X**.
3. While signed in as A, press **Remove** on X → only `ccf_A` is edited.
4. Sign out, then sign in to any fresh account B → `shelfUid` walks
   `A → guest → B`; `B`'s shelf is empty, so `ccf_guest` (which still lists X)
   is adopted wholesale. **X is a friend again.**

The same path re-imports `pendingIn` and up to 20 inbox items, so a
previously **declined** request can also reappear here.

### S2-7 — The global leaderboard is not global and is not paginated (**S2**)

`server/lib/friends.mjs:245-285` builds the ladder from the in-memory
`ranks` / `directory` / `presence` maps, i.e. from accounts that have touched
*this process since it started*. Consequences:

- It is **not** the set of registered accounts — it cannot be, because it
  never reads the `users` collection.
- Every restart empties it.
- `total` is the number of *known* users, not of registered users.
- `board: rows.slice(0, 100)` — hard truncation, no `limit`/`offset`, no stable
  cursor, and `sort` is `(rating desc, name asc)` which is **not a stable
  deterministic tie-break** (two players with the same first name have no
  defined order, so ranks can shuffle between requests).
- The viewer is force-injected into `uni` even if unknown (`friends.mjs:268`),
  which inflates the total.

### S2-8 — Ratings on the global ladder are client-supplied (**S2**)

`POST /api/rank/publish` (`server/index.mjs:361-366`) takes the rating
straight from the request body, and `publishRank`
(`server/lib/friends.mjs:232-243`) stores it with `Math.max(prev, rating)`:

```js
const rec = { uid, name: cleanName(name), cat, rating: prev ? Math.max(prev.rating, rating) : rating, at: Date.now() };
```

A signed-in client can therefore raise its own rating to the 4000 ceiling with
one HTTP call and never lower it. The ladder is not derived from game results.

`GET /api/leaderboard` (`server/index.mjs:219-234`) has the same problem in a
different form: it reads `sections.ratings.data.cats.<cat>` — a value the
client pushed via `PUT /api/state` — so it is equally self-attested.

### S2-9 — Privacy leaks in the ranking and directory APIs (**S2**)

The mission requires server-side field selection, not client-side hiding. The
API violates this:

- `GET /api/leaderboard` (`server/index.mjs:240`) returns
  `{ uid, name, image, rating }` for **every** player to **any** signed-in
  user. `friends.js:889-913` then strips it down in the browser. The full uid,
  full name and photo of every player are therefore in the network response.
- `GET /api/rank` (`friends.mjs:279-283`) is the correct shape (strangers get
  `uid: null` + first name only), but it is never reached in production, and
  friends/self still receive their raw Clerk uid.
- `GET /api/hall` (`server/index.mjs:435`) returns `{uid, name, position}` for
  every member to every signed-in user — a global uid + full-name dump.
- `GET /api/friends/status?uids=` (`server/index.mjs:329-333`) accepts **any**
  list of uids from **any** signed-in user and returns their online state. No
  friendship check. Presence is user data; it must not be enumerable.
- `GET /api/directory` returns `uid` for arbitrary strangers, which combined
  with `POST /api/friends/add` means any account can generate a friend request
  to any user id it has ever seen (spam / harassment vector).
- `POST /api/notify` (`server/index.mjs:335-353`) lets any signed-in user push
  an arbitrary `{toUid, kind, title, body, data}` into any other user's inbox —
  including a `game-invite` carrying an attacker-chosen room code that the
  victim will be prompted to join. There is no friendship check, no
  self-check, and no rate limit tighter than 120/min.

### S1-10 — There is no match-invitation entity (**S1**, critical)

Nothing in the repository models an invitation. The closest thing is a
notification payload (`server/lib/friends.mjs:179-191` `cleanData`) carrying
`{code, control, fromName, rating, img}`. There is:

- **no match id** (the only handle is a 6-character room code, which is the
  PeerJS peer id `ccg-<code>`, `online.js:58`);
- **no server-side expiry** — `INVITE_TTL_MS` is a client constant
  (`friends.js:607`), so a client that wants to can accept a 3-hour-old invite;
- **no status** (`pending` / `accepted` / `declined` / `expired`);
- **no recipient authorization** — `OnlineNet.validInvite` (`online.js:76-88`)
  validates only *shape* (`fromUid` regex, code regex, rating range). Any
  signed-in peer that learns a uid can dial `cci-<uid>` and pop an invite;
- **no idempotency** — three accepted notifications for the same room create
  three invites; `friends.js:717-724` only dedupes *per browser tab* by code;
- **no cleanup** of abandoned invitations.

### S1-11 — Accepting an invite navigates to the Online screen (**S1**)

`friends.js:663-672`:

```js
window.app.showOnline();
setTimeout(() => { try { window.app._onlineJoin(code); } catch (_) {} }, 600);
```

`showOnline()` (`app.js:1832-1839`) switches to the `#online-screen` route
first, then the join is attempted. The recipient therefore *lands on the Online
page* before/while joining, which is exactly the reported behaviour. The join
itself is real (`OnlineNet.join` → peer `ccg-<code>` → `hello`/`welcome`),
but the navigation is what the user sees.

Side effect: accept also overwrites the recipient's **global** lobby time
control (`friends.js:661`, `localStorage.cc_control`), silently changing a
setting they did not choose.

### S2-12 — "Invite sent" is shown when delivery was never confirmed (**S2**)

`friends.js:1419-1432`:

```js
const deliverInvite = (toUid, fr, code, cid) => {
    try { serverNotify(...); } catch (_) {}                       // swallows failure
    notifyLocal('note', `Invite sent to ${fr ? fr.name : 'friend'}`, ...);   // unconditional success
    try { sendP2PInvite(toUid, code, cid).then((ok) => { if (ok) return; ... }); } catch (_) {}
};
```

The success message is rendered **before** delivery is attempted and is shown
regardless of the outcome. `serverNotify` itself returns early when
`apiBase() === null`, and `sendP2PInvite` resolves `false` when the peer is
unreachable — yet the user has already been told "Invite sent".

### S3-13 — The time-control selector is wrong in three ways (**S3**)

- **There is no time-control selector in the invite flow at all.**
  `friends.js:1435-1460` silently reuses whatever is in `localStorage.cc_control`,
  so "choose the time control" (step 3 of the sender flow in the mission) is
  not implemented.
- **The lobby picker mislabels controls.** `app.js:1949-1958` renders
  `[1,0] [3,0] [5,0] [3,2] [10,0] [15,10]`. `_catFor` (`app.js:1792-1796`)
  buckets by duration, so **three different buttons are labelled "Blitz"**
  (`3+0`, `5+0`, `3+2`) and two are labelled "Rapid" (`10+0`, `15+10`). The
  mission's required labels are Bullet / Blitz / Rapid with no duplication —
  `5+0` appearing under an ambiguous "Blitz" bucket next to two other "Blitz"
  rows is what reads as a duplicate option.
- **Rating and rank are injected into the time-control menu.**
  `app.js:1971-1979` puts `presetHTML` and `_wheelSummaryHTML` in the same
  "Time control" section, and `app.js:1820-1825` renders
  `<span class="ws-rating">` plus `DoChessAchievements.rankChipHTML()`
  inside that summary — exactly what the mission forbids.

### S3-14 — Static assets are served with a 5-minute cache and no version discipline (**S3**)

`server/index.mjs:101` sets `Cache-Control: public, max-age=300` for every
non-HTML file, and the ETag is `size-mtime` (`index.mjs:93`). After a deploy a
browser can serve a 5-minute-old `app.js` against a fresh `index.html`. The
HTML does use `?v=` query strings (`index.html:939-963`) but nothing verifies
that they are bumped, and `chess.js?v=15`, `app.js?v=51`, `friends.js?v=4`
have been reused across many behavioural changes in the git history.

### S2-15 — Uncommitted deploy-breaking encoding regression in the working tree (**S2**, critical)

The working tree contains a modified, uncommitted `index.html` that is:

- **double-encoded** (UTF-8 bytes decoded as Windows-1252 and re-encoded): every
  `—`, `→`, `─`, `•` in comments **and in the `<title>`** is now `—`,
  `â†’`, `•`, `→`;
- prefixed with a **UTF-8 BOM** (`index.html` is 72319 bytes vs 69841 at HEAD);
- converted to **CRLF** line endings (964 CRLF vs 0 at HEAD).

Verified: `git show HEAD:index.html` → `DoChess — Master the Game of Kings`;
the working tree → `DoChess — Master the Game of Kings`.

437 lines differ; after undoing the double encode only **2 genuine edits**
remain, both CSS mobile-overflow fixes (`calc(100dvw - 12px)` added to
`#play-board-wrap` and `.lv-focus #play-board-wrap`). Deploying the working
tree as-is would ship a corrupted title and a BOM to production.

### S3-16 — `js/learn.bundle.js` is stale — `npm test` fails at step 1 (**S3**)

`js/learn.js` has an uncommitted edit (the level-open scroll behaviour) and the
generated bundle was not rebuilt:

```
$ node tools/build-learn.mjs --check
STALE js/learn.bundle.js — run: node tools/build-learn.mjs
exit=1
```

`npm test` runs this first, so the entire suite is red before any Playwright
spec executes.

---

## 3. Baseline test results (before any change)

| Gate | Command | Result |
| --- | --- | --- |
| Learn bundle freshness | `node tools/build-learn.mjs --check` | **FAIL** — `STALE js/learn.bundle.js` |
| Curriculum gate | `node tools/check-batch1.mjs` | PASS — 94/94 |
| Elo unit gate | `node test-elo.js` | PASS — 14/14 |
| Draw detection gate | `node test-draws.js` | PASS — 14/14 |
| Move generator | `node perft.js` | PASS — 5/5 positions |
| Server unit/integration | `node --test "server/test/*.test.mjs"` | PASS — 40/40 |

The Playwright suite was **not** run to completion before the audit: with the
bundle stale, `npm test` aborts at step 1, and the two signed-in E2E files
(`test-auth-e2e.spec.js`, `test-sync-accounts.spec.js`) require MongoDB Atlas +
Clerk, which are unreachable from this machine (§7).

---

## 4. Environment blockers (verified, not assumed)

| Blocker | Evidence | Consequence |
| --- | --- | --- |
| **No backend host credentials** | No `RAILWAY*`/`RENDER*`/`VERCEL*`/`NETLIFY*`/`FLY*` env vars; `railway` CLI absent; `gh secret list` empty | The Node API **cannot be deployed** from here |
| **MongoDB Atlas unreachable** | TCP 27017 to the shard succeeds (`65.62.241.102`), but every TLS handshake fails with `tlsv1 alert internal error` / `SSL alert number 80`, for both hostname and IP | No production DB read/write, no real-Clerk E2E, no `/api/health` `productionReady: true` proof |
| **Static-only hosting** | `gh api repos/mouadhhhallem/dochess/pages` → legacy Pages build from `master`, no custom domain, no server | Server-side ranking cannot be implemented in the frontend |

These are recorded so that no part of this audit is mistaken for a verified
production result.

---

## 5. Planned fixes

Ordered by severity. Each is listed with the file it lands in.

**F1 — Restore `index.html` encoding** (S2-15). Re-encode to UTF-8 without BOM,
LF endings, keeping the two genuine CSS mobile fixes. Then verify the byte-level
diff against `HEAD` is exactly those two lines.

**F2 — Persistent social store** (S1-1). Replace `createFriendStore()` with a
store-backed module so friendships, requests, invitations and presence live in
the same permanent store as `users`/`games` (Mongo in production, the dev file
store locally), with an in-process write-through cache for speed.

**F3 — Undirected friendship + explicit request lifecycle** (S1-2, S1-3).
Model a friendship as a single canonical document keyed by the sorted uid pair
(so there is only ever one edge and no asymmetry to get wrong), and model a
request as an explicit document with a terminal `status`. Decline writes
`status: 'declined'`; that is permanent and the request is never re-derived.
Accept is idempotent; concurrent accept/decline resolves deterministically.

**F4 — Authoritative client reconcile** (S1-4, S1-5). Make the server list
authoritative: `pullEdges` must **remove** local friends the server no longer
knows; `removeFriend` must await the server, roll back and show an honest
error on failure, and record a tombstone so a stale response cannot resurrect
the friend.

**F5 — Guest-shelf migration marker** (S1-6). Stamp `ccf_guest` as adopted so
the same shelf is never imported twice, and never import a uid the current
account has explicitly removed.

**F6 — Global ranking from the authoritative account store** (S2-7, S2-8).
Build the ladder from the `users` collection (every registered account, default
rating 800 for users with no recorded game), with deterministic
`(rating desc, uid asc)` ordering, real `limit`/`offset` pagination, and
explicit per-viewer field selection. Ratings come from recorded game results,
not from client-published values.

**F7 — Privacy by serialization** (S2-9). `/api/rank` and the leaderboard emit
only the fields the viewer is entitled to (rank, first name, rating, tier for
strangers; friend-facing name for friends; self highlighted). No uid, email,
photo or internal id for strangers in the response at all — not fetched and
then hidden. Presence and inbox endpoints require a relationship.

**F8 — Invitation entity** (S1-10, S1-12, S1-11). `POST /api/invites`,
`GET /api/invites`, `POST /api/invites/respond`. Server-validated match id,
time control, sender, recipient, expiry and status. Only the recipient may
accept. Expired / duplicated / malformed / unauthorized invites are rejected
with distinct errors. Accept navigates the player straight to the board
without routing them through the Online screen.

**F9 — Time-control picker in the invite flow** (S3-13). A real selection UI
with the six required options, each rendered once and labelled
Bullet / Blitz / Rapid, kept separate from rating and rank information.

**F10 — Honest delivery reporting** (S2-12). "Invite sent" only after a
confirmed delivery; explicit "could not reach" states otherwise.

**F11 — Cache discipline** (S3-14). Versioned asset URLs plus a
`must-revalidate` policy so a deploy can never serve an incompatible bundle
indefinitely.

**F12 — Tests.** `node --test` units for the new store (both drivers), plus
Playwright E2E with two genuinely independent authenticated contexts covering
the 15 required scenarios, running against the local API.

---

## 6. What this audit does *not* claim

- It does not claim the production site was fixed. The live site is GitHub
  Pages and can only be updated with static files; the backend-dependent
  behaviour cannot be verified in production from this environment.
- It does not claim any real-Clerk or real-MongoDB test ran. Both were
  unreachable; the affected suites skip rather than fake.
- It does not claim the previous implementation's "Live invites without
  backend (P2P inbox…)" commit delivered working production invites. The
  transport has no durability, no delivery acknowledgement and no
  authorization, and the recipient-side tab must hold the `cci-<uid>` PeerJS id
  for delivery to work at all.