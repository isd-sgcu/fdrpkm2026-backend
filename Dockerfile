ARG NODE_ENV=production

FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV}

COPY tsconfig.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app

ARG NODE_ENV
ENV NODE_ENV=${NODE_ENV} \
    HOST=0.0.0.0 \
    PORT=8080

COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/package.json ./package.json

USER bun
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const port = process.env.PORT || '8080'; const res = await fetch('http://127.0.0.1:' + port + '/v1/health'); if (!res.ok) process.exit(1);"]

CMD ["bun", "dist/index.js"]
