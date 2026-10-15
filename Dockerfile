# DoChess API image: the same Node process that serves :8787 locally.
# No build step (static files ship as-is); no secrets baked in (.env is
# gitignored AND dockerignored — set them via `flyctl secrets set`).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ server/
COPY *.js *.html *.css ./
COPY js/ js/
COPY assets/ assets/
COPY data/ data/
COPY vendor/ vendor/
EXPOSE 8080
CMD ["node", "server/index.mjs"]
