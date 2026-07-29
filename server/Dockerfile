# Build from the REPO ROOT (npm workspaces need the root manifest):
#   docker build -f server/Dockerfile .
# docker-compose.yml does this for you.

FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/

# Full install + compile. Also the image for one-off prisma commands
# (migrate deploy, db seed) — it has the CLI, tsx, and the source.
FROM base AS build
RUN npm ci --workspace server
COPY server/ server/
RUN npm run prisma:generate --workspace server \
  && npm run build --workspace server

# Production node_modules only (no prisma CLI, no toolchain).
FROM base AS prod-deps
RUN npm ci --omit=dev --workspace server

# Lean runtime: compiled JS + prod deps. The generated Prisma client is
# compiled into dist/generated (Prisma 7 driver adapters — no engine binary).
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]
