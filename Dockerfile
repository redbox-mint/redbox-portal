# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

ARG REDBOX_BUILD_PLATFORM=$TARGETPLATFORM
FROM --platform=$REDBOX_BUILD_PLATFORM node:26.12.1-bookworm@sha256:5c4012d11d9857c42713ba511fbc19645cac1706bb710d51d42b0d301dff7f88 AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    python3 \
    python-is-python3 \
    curl \
    ca-certificates \
    tzdata \
    openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python3
ENV NVM_DIR=/root/.nvm
RUN bash -lc "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"

WORKDIR /opt/redbox-portal
SHELL ["bash", "-o", "pipefail", "-c"]

# Install from the pinned manifests before copying application source. Runtime
# fixes must not invalidate the complete strict dependency tree during qualification.
FROM base AS dependencies
COPY package*.json .npmrc ./
COPY packages/agenda-sqs-backend/package*.json ./packages/agenda-sqs-backend/
COPY packages/sails-ng-common/package*.json ./packages/sails-ng-common/
COPY packages/raido/package*.json ./packages/raido/
COPY packages/rva-registry/package*.json ./packages/rva-registry/
COPY packages/redbox-core/package*.json ./packages/redbox-core/
COPY packages/redbox-dev-tools/package*.json ./packages/redbox-dev-tools/
COPY packages/sails-hook-redbox-storage-mongo/package*.json ./packages/sails-hook-redbox-storage-mongo/
COPY packages/redbox-hook-dev/package*.json ./packages/redbox-hook-dev/
COPY packages/sails-hook-redbox-pdfgen/package*.json ./packages/sails-hook-redbox-pdfgen/

# Subproject npm invocations do not inherit the application's .npmrc. Keep the
# same strict, script-free install policy at every package boundary; the explicit
# builds below own compilation and Prisma generation.
RUN npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/agenda-sqs-backend && npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/sails-ng-common && npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/raido && npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/rva-registry && npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/redbox-core && npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/sails-hook-redbox-storage-mongo && npm ci --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/redbox-dev-tools && npm install --include=dev --no-save --ignore-scripts --strict-peer-deps --legacy-peer-deps=false --no-audit
RUN cd packages/redbox-hook-dev && npm install --no-save --ignore-scripts --no-audit
RUN cd packages/sails-hook-redbox-pdfgen && npm install --include=dev --no-save --ignore-scripts --legacy-peer-deps --no-audit

FROM dependencies AS builder
COPY . .

RUN cd packages/agenda-sqs-backend && npm run build
RUN cd packages/raido && npm run build
RUN cd packages/rva-registry && npm run build
RUN cd packages/sails-ng-common && npm run compile
RUN --network=none cd packages/redbox-core && npm run check:prisma && npm run build
RUN cd packages/redbox-dev-tools && npm run build
RUN cd packages/sails-hook-redbox-storage-mongo && npm run compile
# redbox-hook-dev is a devDependency that supplies the demo record types/forms.
# Build its dist so the optional `test` image (below) can load it. It is pruned
# from node_modules for the pristine runtime image.
RUN cd packages/redbox-hook-dev && npm run build
# Build the optional PDF hook from this checkout. The pdfgen runtime target
# installs this local package, so it does not depend on a separately released
# portal-core-compatible npm version.
RUN cd packages/sails-hook-redbox-pdfgen && npm run compile

RUN npx tsc --project tsconfig.json

RUN chmod +x support/build/compileProductionAngular.sh \
 && support/build/compileProductionAngular.sh

RUN npm run webpack

RUN chmod +x support/build/api-descriptors/generateAPIDescriptors.sh \
 && support/build/api-descriptors/generateAPIDescriptors.sh

# Install native dependencies for the target even when the portable application
# outputs were compiled on the worker's architecture. Start with a clean tree of
# the six packages linked by the production lock and their shipped files.
FROM node:26.12.1-bookworm@sha256:5c4012d11d9857c42713ba511fbc19645cac1706bb710d51d42b0d301dff7f88 AS production_dependencies
WORKDIR /opt/redbox-portal
COPY package*.json .npmrc ./
COPY --parents --from=builder \
    /opt/redbox-portal/./packages/agenda-sqs-backend/package.json \
    /opt/redbox-portal/./packages/agenda-sqs-backend/dist \
    /opt/redbox-portal/./packages/raido/package.json \
    /opt/redbox-portal/./packages/raido/dist \
    /opt/redbox-portal/./packages/redbox-core/package.json \
    /opt/redbox-portal/./packages/redbox-core/dist \
    /opt/redbox-portal/./packages/redbox-core/types \
    /opt/redbox-portal/./packages/redbox-core/src \
    /opt/redbox-portal/./packages/redbox-core/bin \
    /opt/redbox-portal/./packages/redbox-core/logfmt-transport.cjs \
    /opt/redbox-portal/./packages/rva-registry/package.json \
    /opt/redbox-portal/./packages/rva-registry/dist \
    /opt/redbox-portal/./packages/sails-hook-redbox-storage-mongo/package.json \
    /opt/redbox-portal/./packages/sails-hook-redbox-storage-mongo/dist \
    /opt/redbox-portal/./packages/sails-ng-common/package.json \
    /opt/redbox-portal/./packages/sails-ng-common/dist/src \
    /opt/redbox-portal/./packages/sails-ng-common/dist/esm \
    ./
RUN --mount=type=bind,source=support/tooling/fastify-retirement,target=/tmp/runtime-tools \
    npm ci --omit=dev --no-audit \
 && node /tmp/runtime-tools/prune-runtime.cjs

FROM node:26.12.1-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe AS runtime

ENV NODE_ENV=production
ENV TZ=Australia/Brisbane

WORKDIR /opt/redbox-portal

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo $TZ > /etc/timezone

COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/package*.json ./
COPY --from=builder --chown=node:node /opt/redbox-portal/app.js ./app.js
COPY --from=builder --chown=node:node /opt/redbox-portal/portal.cjs ./portal.cjs
COPY --from=builder --chown=node:node /opt/redbox-portal/api ./api
COPY --from=builder --chown=node:node /opt/redbox-portal/assets ./assets
COPY --from=builder --chown=node:node /opt/redbox-portal/.tmp/public ./.tmp/public
COPY --from=builder --chown=node:node /opt/redbox-portal/config ./config
COPY --from=builder --chown=node:node /opt/redbox-portal/bootstrap-data ./bootstrap-data
COPY --from=builder --chown=node:node /opt/redbox-portal/language-defaults ./language-defaults
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/packages ./packages
COPY --from=builder --chown=node:node /opt/redbox-portal/views ./views
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/node_modules ./node_modules

EXPOSE 1500

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=5 \
  CMD ["sh", "-c", "curl -fsS --max-time 4 \"http://localhost:${REDBOX_PORT:-1500}/readyz\" >/dev/null"]

USER node

RUN node -e "const { createRequire } = require('module'); const corePath = require.resolve('@researchdatabox/redbox-core'); require(corePath); createRequire(corePath)('@uppy/companion')"

CMD ["node", "app.js"]

FROM runtime AS runtime_puppeteer_base
USER root
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      git \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libc6 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libexpat1 \
      libfontconfig1 \
      libgcc-s1 \
      libgdk-pixbuf-2.0-0 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libstdc++6 \
      libx11-6 \
      libx11-xcb1 \
      libxcb1 \
      libxcomposite1 \
      libxcursor1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxi6 \
      libxrandr2 \
      libxrender1 \
      libxss1 \
      libxtst6 \
      procps \
      xdg-utils; \
    rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Puppeteer only understands "chrome" and "firefox" for downloads; we preinstall Chromium.
ENV PUPPETEER_PRODUCT=chrome
ENV PUPPETEER_SKIP_DOWNLOAD=1
USER node

FROM runtime_puppeteer_base AS runtime_pdfgen
COPY --parents --from=builder --chown=node:node \
    /opt/redbox-portal/./packages/sails-hook-redbox-pdfgen/package.json \
    /opt/redbox-portal/./packages/sails-hook-redbox-pdfgen/dist \
    /opt/redbox-portal/./packages/sails-hook-redbox-pdfgen/src/api/configmodels \
    ./
RUN --mount=type=bind,source=support/tooling/fastify-retirement,target=/tmp/runtime-tools \
    npm install --omit=dev --ignore-scripts --save --package-lock=true --strict-peer-deps --legacy-peer-deps=false --no-audit \
    ./packages/sails-hook-redbox-pdfgen \
 && node /tmp/runtime-tools/prune-runtime.cjs
RUN node -e "require('@researchdatabox/redbox-core'); require('@researchdatabox/sails-hook-redbox-pdfgen')"
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

# Local upgrade-rehearsal artifact: the bundled development forms act as the
# institution stand-in, installed in the production graph with the PDF hook.
# It intentionally retains the runtime dependency tree, never the builder's dev tree.
FROM runtime_pdfgen AS rehearsal
COPY --parents --from=builder --chown=node:node \
    /opt/redbox-portal/./packages/redbox-hook-dev/package.json \
    /opt/redbox-portal/./packages/redbox-hook-dev/dist \
    ./
RUN --mount=type=bind,source=support/tooling/fastify-retirement,target=/tmp/runtime-tools \
    npm install --omit=dev --ignore-scripts --save-prod --strict-peer-deps --legacy-peer-deps=false --no-audit \
    ./packages/redbox-hook-dev \
 && node /tmp/runtime-tools/prune-runtime.cjs
RUN node -e "require('@researchdatabox/redbox-core/portal'); require('redbox-hook-dev/extension'); require('@researchdatabox/sails-hook-redbox-pdfgen/extension')"

# Development/test artifact. Reuse the clean builder's dependency layers instead
# of copying and chowning the complete development graph into a second tree.
# This target includes build tools and runs as root for the existing mounted CI
# workflows; release qualification separately exercises the node-user runtime.
FROM builder AS test
ENV NODE_ENV=development
ENV TZ=Australia/Brisbane
RUN ln -s /root/.nvm/versions/node /opt/redbox-build-node
EXPOSE 1500
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=5 \
  CMD ["sh", "-c", "curl -fsS --max-time 4 \"http://localhost:${REDBOX_PORT:-1500}/readyz\" >/dev/null"]
CMD ["node", "app.js"]

# Keep the vanilla (pristine) runtime image as the default build target.
FROM runtime
