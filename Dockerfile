# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:22-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S remix -u 1001 -G nodejs

WORKDIR /app

# Copy only what's needed to run
# Note: static assets are in build/client/ (Remix Vite output), not a separate public/ dir
COPY --from=builder --chown=remix:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=remix:nodejs /app/build ./build
COPY --from=builder --chown=remix:nodejs /app/package.json ./package.json

# Copy shopify config files needed at runtime
COPY --from=builder --chown=remix:nodejs /app/shopify.app.toml ./shopify.app.toml

USER remix

ENV NODE_ENV=production
# PORT is injected by Render/Fly at runtime — do not hardcode here

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# remix-serve starts Express and binds to process.env.PORT (set by Render/Fly)
CMD ["node_modules/.bin/remix-serve", "./build/server/index.js"]
