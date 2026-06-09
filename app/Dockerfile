# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* .npmrc* yarn.lock* pnpm-lock.yaml* ./
COPY prisma ./prisma

# Vendored IronRDP web client (custom WASM build — package.json references it via file:vendor/*.tgz).
# Must be present before the install step so npm ci can resolve the file: dependencies.
COPY vendor ./vendor

RUN corepack enable 2>/dev/null || true

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Generate Prisma client
RUN npx prisma generate

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# ffmpeg/ffprobe — offline compose of the screen-share recording (screen-audio mode):
# mux the screen-share track segment(s) over a timeline + the mixed audio into one MP4.
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
