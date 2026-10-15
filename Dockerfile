# DoChess API image: the same Node process that serves :8787 locally.
# No build step (static files ship as-is); no secrets baked in (.env is
# gitignored AND dockerignored — set them via `flyctl secrets set`).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# `install` (not `ci`) so a drifted lockfile degrades to a warning-free
# sync instead of failing the whole deploy with EUSAGE.
RUN npm install --omit=dev --no-audit --no-fund
# Containers must bind all interfaces: the platform injects $PORT and
# routes to it, while 127.0.0.1 would be unreachable from outside.
# (Explicit HOST env still wins — see server/lib/env.mjs.)
ENV HOST=0.0.0.0
COPY server/ server/
COPY *.js *.html *.css ./
COPY js/ js/
COPY assets/ assets/
COPY data/ data/
COPY vendor/ vendor/
EXPOSE 8080
CMD ["node", "server/index.mjs"]
