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
# Provider fallback chain for this deployment. The gateway lists several
# providers; when the first model's account is spent, the next one answers the
# same grounded request instead of dropping the reader to the deterministic
# card. Override or empty this in the receiving deployment's own environment.
ENV LLM_MODEL_FALLBACKS="mistral/deepseek-v4-1-flash-1017,opencode-go/hy4-flash-free"
LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
WORKDIR /app

# PDF text extraction runs inside this image, not in the builder: the server
# executes `pdfinfo` and `pdftotext` from poppler-utils while converting an
# approved public PDF in the background. Both binaries have to exist in the
# runtime layer, the read only root filesystem still allows the subprocess, and
# `/tmp` is the tmpfs the converter's private working directory lives on.
RUN apk add --no-cache poppler-utils

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts/audit-corpus-coverage.mjs ./scripts/audit-corpus-coverage.mjs

USER node
EXPOSE 3000

HEALTHCHECK --interval=1s --timeout=2s --start-period=20s --retries=3 \
  CMD wget -qO- 'http://127.0.0.1:3000/api/health/container-readiness' >/dev/null || exit 1

CMD ["node", "server/index.mjs"]
