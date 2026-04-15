FROM node:20-alpine AS base

# ---- Dependencies ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# ---- Build ----
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=build-time-placeholder
ENV CRON_SECRET=build-time-placeholder
RUN npx prisma generate
RUN npm run build

# ---- Production ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Chromium for Puppeteer PDF generation + fonts.
#
# Font stack:
#   1. Arial (proprietary Microsoft font, COPY'd in a step below) — the
#      client's quote template references Arial explicitly and expects
#      Arial metrics and glyph shapes. Copied from a licensed Mac into
#      the image; only valid under the organization's Office/Windows
#      license, not for public redistribution.
#   2. font-liberation — Liberation Sans is metric-compatible with
#      Arial. Kept as the first fallback so if the Arial COPY fails
#      (file missing in the build context, etc.) the layout still
#      matches Arial's character widths and wrapping.
#   3. font-noto — final fallback covering any glyph the first two
#      don't carry, most notably the Turkish Lira sign (U+20BA).
#      Without it, TRY quotes render "?" boxes instead of the ₺ sign.
#
# fontconfig is required so `fc-cache` can register the Arial files
# after the COPY step below, and so Chromium can discover them at run
# time.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-liberation \
    font-noto \
    fontconfig

# Copy proprietary Arial fonts from the repo into the system fonts dir
# and refresh the font cache so Chromium/fontconfig can find them.
# These files live under `fonts/arial/` in the repo; see
# `fonts/arial/LICENSE-NOTES.md` for the legal context.
COPY fonts/arial/*.ttf /usr/share/fonts/TTF/
RUN fc-cache -f /usr/share/fonts/TTF/

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Standalone output includes server.js and required node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy full node_modules for Prisma CLI migrations (prisma has many transitive deps)
COPY --from=deps /app/node_modules ./node_modules

# Entrypoint script: run migrations then start server
COPY --chown=nextjs:nodejs <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "Migrations complete. Starting server..."
exec node server.js
EOF
RUN chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/entrypoint.sh"]
