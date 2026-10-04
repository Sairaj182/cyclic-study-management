FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm turbo
WORKDIR /app
COPY . .
RUN turbo prune --scope=api --docker

FROM node:22-alpine AS installer
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@9.0.0 turbo
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo run build --filter=api

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 api

RUN echo '#!/bin/sh' > /usr/local/bin/dbstudio && \
    echo 'cd /app/packages/database && npm run db:studio' >> /usr/local/bin/dbstudio && \
    chmod +x /usr/local/bin/dbstudio

USER api

# Copy the entire monorepo from the installer stage (with built assets and node_modules)
COPY --from=installer --chown=api:nodejs /app .

EXPOSE 4000
ENV PORT=4000

WORKDIR /app
CMD ["node", "apps/api/dist/index.js"]
