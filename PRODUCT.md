# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

General beginners of all ages learning chess self-paced, typically at a desktop or phone browser. Neutral tone for kids and adults alike; no classroom or instructor workflow.

## Product Purpose

Teach chess from zero through 10 interactive board lessons plus a free game against the computer. Success is a learner finishing the course and playing real games — this course is the foundation of a larger future system with chess.com-style features (accounts, online play, puzzles — all explicitly undecided, not promised).

## Positioning

Guided exercises with instant auto-check on a real playable board plus a built-in computer opponent and locked progression — a course and a practice board in one static package.

## Operating Context

Self-paced solo use. Runs by double-clicking `index.html` (file://) with no server or build step. Progress persists in browser localStorage. Verified with Playwright (`npx playwright test`).

## Capabilities and Constraints

Confirmed: 10 lessons (9 guided single-move exercises, 1 free game vs CPU), exercise auto-check with locked Complete button, promotion picker, castling/en-passant/promotion rules, check/checkmate/stalemate detection, move log, progress screen, custom SVG piece set in `assets/pieces/`, keyboard-operable squares, reduced-motion support. Optional Clerk client-side auth (publishable key in `clerk-config.js`, null by default): signed-in learners get progress namespaced per Clerk user id, anonymous learners keep the legacy shared key; the course works fully offline without a key. Rated online friend games over P2P WebRTC (`online.js`, PeerJS rendezvous): 6-letter share codes, host-tab authority, host-owned clocks, Elo per time control stored per user, device-local leaderboard. Correctness: per-move durable log + portable clock snapshots, epoch fencing per code, ply/move_id idempotency, joiner auto-reconnect with backoff, host re-host resume with paused-clock policy, abort-before-2-plies unrated. No spectators/chat/tournaments/anti-cheat (parked). Constraints: static files only, no backend (hence no secret keys anywhere), English-only UI. Undecided: global matchmaking/leaderboard servers, puzzles, engine strength options.

## Brand Commitments

Renamed to **DoChess** by the user (was "Chess Course"). Otherwise none binding — the user explicitly allowed changing anything for the better. Incumbent non-binding traits: tagline "Learn Chess Academy", dark navy + emerald surfaces, Inter type, custom piece artwork, knight-clock logo (white version on dark chrome, black version on light).

## Evidence on Hand

Real assets (do not fabricate replacements): `assets/pieces/` (12-piece SVG set), `assets/teacher1.svg`, `assets/teacher2.svg`, `assets/teacher3.svg`, `assets/player.svg`. No testimonials, benchmarks, or claims on hand — do not invent any.

## Product Principles

1. The board is the lesson: every concept is demonstrated with a legal move, never described only in text.
2. One correct move unlocks the next step: progression is earned per lesson, never granted upfront.
3. Static and self-contained: the course must run offline-capable from plain files with zero setup.
4. Neutral for all ages: clear without condescension, no child-only or expert-only language.
5. Foundation first: new features must not break the 10-lesson path that everything else builds on.

## Accessibility & Inclusion

No mandated standard. Established in-session: board squares focusable and keyboard-operable (Enter/Space), visible focus ring, `prefers-reduced-motion` support, 44px minimum touch targets on controls.
