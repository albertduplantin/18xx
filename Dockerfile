# ── Stage 1: install dependencies ──────────────────────────────────────────
FROM node:22-alpine AS deps
RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc* ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/games/package.json packages/games/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm build

# ── Stage 3: production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN npm install -g pnpm
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed to run
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/games/package.json packages/games/
COPY apps/server/package.json apps/server/

# Install prod deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/engine/dist packages/engine/dist
COPY --from=builder /app/packages/games/dist packages/games/dist
COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# The server resolves web/dist relative to itself by default
# (../../web/dist from apps/server/dist/index.js = apps/web/dist)

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
