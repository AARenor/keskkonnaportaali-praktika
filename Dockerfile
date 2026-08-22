FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime

ARG SOURCE_COMMIT=development
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_REVISION=${SOURCE_COMMIT}
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

USER node
EXPOSE 3000

HEALTHCHECK --interval=1s --timeout=2s --start-period=20s --retries=3 \
  CMD wget -qO- 'http://127.0.0.1:3000/api/health/container-readiness' >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
