# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
WORKDIR /app
# Match CI lockfile generation (npm 10)
RUN npm install -g npm@10.9.2
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g npm@10.9.2
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Default process when the host cannot override CMD (e.g. Instacloud).
# Override per service with env: PROCESS=api|realtime|worker
ENV PROCESS=api
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh
USER node
EXPOSE 3000 3001
ENTRYPOINT ["/bin/sh", "/app/docker/entrypoint.sh"]
