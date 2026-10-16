/* ── Clerk authentication config ────────────────────────────────
   1. Create a free application at https://dashboard.clerk.com
   2. Open API keys → copy your Publishable Key (starts with pk_).
   3. Paste it below. This key is public by design and safe in
      client code. Never put a Secret Key (sk_) in this file —
      there is no backend here to keep one in.
   Leave it null to run the course without accounts. */
window.CHESS_CLERK_KEY = 'pk_test_cGF0aWVudC1zZXJ2YWwtMzI1LmNsZXJrLmFjY291bnRzLmRldiQ';

/* ── Production API origin ────────────────────────────────────────
   Empty ('') means: no backend configured — the app runs in the
   explicitly labelled device-local mode (GitHub Pages today).
   Set this to the deployed API origin (e.g. the Fly.io URL) and every
   server feature (friends, ranking, invites, presence, sync) lights up
   in production exactly like on localhost:8787. Public by design: it
   is just an origin, all auth still rides Clerk JWTs per request. */
window.DOCHESS_API_BASE = 'https://dochess-api.onrender.com';
