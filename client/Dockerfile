# Build from the REPO ROOT (npm workspaces need the root manifest):
#   docker build -f client/Dockerfile .
# docker-compose.yml does this for you.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
RUN npm ci --workspace client
COPY client/ client/
RUN npm run build --workspace client

# Static bundle served by nginx; /api is proxied to the api service so the
# SPA's relative URLs work unchanged (same-origin, no CORS).
FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
