FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runtime

ARG SOURCE_COMMIT=development
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_REVISION=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

USER node
EXPOSE 3000

HEALTHCHECK --interval=1s --timeout=2s --start-period=20s --retries=3 \
  CMD wget -qO- 'http://127.0.0.1:3000/api/health/container-readiness' >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
