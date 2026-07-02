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
COPY --from=builder --chown=remix:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=remix:nodejs /app/build ./build
COPY --from=builder --chown=remix:nodejs /app/public ./public
COPY --from=builder --chown=remix:nodejs /app/package.json ./package.json

# Copy shopify config files needed at runtime
COPY --from=builder --chown=remix:nodejs /app/shopify.app.toml ./shopify.app.toml

USER remix

# Remix serve listens on 3000 by default; Fly.io expects 8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Health check — Fly.io also checks /api/health via fly.toml
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "./build/server/index.js"]
