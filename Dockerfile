# Stage 1: build
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/server/ apps/server/
COPY apps/client/ apps/client/
RUN pnpm install --frozen-lockfile --filter @se/server... --filter @se/client...
RUN pnpm --filter @se/server build
RUN VITE_SERVER_URL=wss://scorched-earth-web.fly.dev pnpm --filter @se/client build

# Stage 2: runtime
FROM node:20-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/apps/server/dist/index.js ./dist/index.js
COPY --from=build /app/apps/client/dist/ ./public/
COPY --from=build /app/apps/server/node_modules/@sentry ./node_modules/@sentry
RUN echo '{"name":"scorched-earth-server","version":"0.0.0","type":"module"}' > package.json
USER app
EXPOSE 2567
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
