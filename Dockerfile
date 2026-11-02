# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM node:26.12.1-bookworm@sha256:3b764117159bda01d2396391e7789b6a9106af9729cfd001ef55e98557868310 AS base

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

FROM base AS manifests

# Local file dependencies need their manifests and the patched Agenda tarball.
COPY package.json package-lock.json ./
COPY packages/agenda-sqs-backend/package.json packages/agenda-sqs-backend/package-lock.json ./packages/agenda-sqs-backend/
COPY packages/sails-ng-common/package.json packages/sails-ng-common/package-lock.json ./packages/sails-ng-common/
COPY packages/raido/package.json packages/raido/package-lock.json ./packages/raido/
COPY packages/rva-registry/package.json packages/rva-registry/package-lock.json ./packages/rva-registry/
COPY packages/redbox-core/package.json packages/redbox-core/package-lock.json ./packages/redbox-core/
COPY packages/sails-hook-redbox-storage-mongo/package.json packages/sails-hook-redbox-storage-mongo/package-lock.json ./packages/sails-hook-redbox-storage-mongo/
COPY packages/redbox-dev-tools/package.json packages/redbox-dev-tools/package-lock.json ./packages/redbox-dev-tools/
COPY packages/redbox-hook-dev/package.json packages/redbox-hook-dev/package-lock.json ./packages/redbox-hook-dev/
COPY packages/sails-hook-redbox-pdfgen/package.json packages/sails-hook-redbox-pdfgen/package-lock.json ./packages/sails-hook-redbox-pdfgen/
COPY packages/agenda-patched/*.tgz ./packages/agenda-patched/

FROM manifests AS prod-deps
# A clean production graph, independent of compilation and its dev dependencies.
# npm configuration is an install input too; mount it without copying source.
RUN --mount=type=bind,source=.npmrc,target=/opt/redbox-portal/.npmrc npm ci --omit=dev --no-audit \
 && find packages -mindepth 2 -maxdepth 2 -type f -delete

FROM manifests AS dev-deps
RUN --mount=type=bind,source=.npmrc,target=/opt/redbox-portal/.npmrc npm ci --no-audit \
 && (cd packages/agenda-sqs-backend && npm ci --no-audit) \
 && (cd packages/sails-ng-common && npm ci --no-audit) \
 && (cd packages/raido && npm ci --no-audit) \
 && (cd packages/rva-registry && npm ci --no-audit) \
 && (cd packages/redbox-core && npm install --no-save --no-audit) \
 && (cd packages/sails-hook-redbox-storage-mongo && npm ci --no-audit) \
 && (cd packages/redbox-dev-tools && npm install --include=dev --no-save --ignore-scripts --strict-peer-deps --no-audit) \
 && (cd packages/redbox-hook-dev && npm install --no-save --ignore-scripts --no-audit) \
 && (cd packages/sails-hook-redbox-pdfgen && npm install --include=dev --no-save --ignore-scripts --legacy-peer-deps --no-audit)

# Compile the only shared package imported by Angular and the asset wrapper.
FROM dev-deps AS shared-builder
COPY packages/sails-ng-common/package*.json ./packages/sails-ng-common/
COPY packages/redbox-dev-tools/config/tsconfig.base.json ./packages/redbox-dev-tools/config/
COPY packages/sails-ng-common/tsconfig*.json ./packages/sails-ng-common/
RUN --mount=type=bind,source=.npmrc,target=/opt/redbox-portal/.npmrc cd packages/sails-ng-common && npm ci --no-audit
COPY packages/sails-ng-common/src ./packages/sails-ng-common/src
RUN cd packages/sails-ng-common && npm run compile
# No redbox-core/backend source enters this stage's cache key.
FROM shared-builder AS angular-builder
COPY angular ./angular
COPY support/build/compileProductionAngular.sh ./support/build/
RUN bash support/build/compileProductionAngular.sh

# The existing wrapper supports loading these hook/config sources with ts-node.
# Keep its exact webpack behavior while excluding unrelated backend sources.
FROM shared-builder AS assets-builder
COPY tsconfig.json ./
COPY packages/redbox-core/tsconfig.json ./packages/redbox-core/
COPY packages/redbox-core/src/config/webpack.config.ts ./packages/redbox-core/src/config/
COPY packages/redbox-core/src/hooks/webpack.ts ./packages/redbox-core/src/hooks/
COPY packages/redbox-core/src/sails.ts ./packages/redbox-core/src/
COPY packages/redbox-dev-tools/bin/wrapper-webpack.js ./packages/redbox-dev-tools/bin/
COPY assets ./assets
COPY typescript/assets ./typescript/assets
COPY typescript/styles.d.ts ./typescript/
RUN npx tsc --project tsconfig.json
# The original webpack ran after Angular npm ci updated this shared graph.
RUN rm -rf packages/sails-ng-common/node_modules
COPY --from=angular-builder /opt/redbox-portal/packages/sails-ng-common/node_modules ./packages/sails-ng-common/node_modules
COPY --from=angular-builder /opt/redbox-portal/assets/angular ./assets/angular
RUN npm run webpack

FROM dev-deps AS builder
COPY . .
COPY --from=dev-deps /opt/redbox-portal/packages/agenda-sqs-backend/package-lock.json ./packages/agenda-sqs-backend/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/sails-ng-common/package-lock.json ./packages/sails-ng-common/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/raido/package-lock.json ./packages/raido/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/rva-registry/package-lock.json ./packages/rva-registry/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/redbox-core/package-lock.json ./packages/redbox-core/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/sails-hook-redbox-storage-mongo/package-lock.json ./packages/sails-hook-redbox-storage-mongo/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/redbox-dev-tools/package-lock.json ./packages/redbox-dev-tools/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/redbox-hook-dev/package-lock.json ./packages/redbox-hook-dev/package-lock.json
COPY --from=dev-deps /opt/redbox-portal/packages/sails-hook-redbox-pdfgen/package-lock.json ./packages/sails-hook-redbox-pdfgen/package-lock.json

# npm skips local-package bin links while only their manifests exist. Re-link
# after source arrives, without lifecycle scripts or a second dependency install.
RUN npm rebuild --ignore-scripts \
 && (cd packages/redbox-hook-dev && npm rebuild --ignore-scripts) \
 && (cd packages/sails-hook-redbox-pdfgen && npm rebuild --ignore-scripts)

RUN cd packages/agenda-sqs-backend && npm run build
RUN cd packages/raido && npm run build
RUN cd packages/rva-registry && npm run build
RUN cd packages/sails-ng-common && npm run compile
RUN cd packages/redbox-core && npx tsc -p tsconfig.json
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


COPY --from=assets-builder /opt/redbox-portal/assets ./assets
COPY --from=assets-builder /opt/redbox-portal/.tmp/public ./.tmp/public
RUN bash support/build/api-descriptors/generateAPIDescriptors.sh

FROM builder AS runtime-files
# Drop per-package dev dependencies without snapshotting them into another layer.
RUN find packages -type d -name node_modules -prune -exec rm -rf '{}' +
COPY --from=prod-deps /opt/redbox-portal/packages ./packages

FROM node:26.12.1-bookworm-slim@sha256:88e480776c6149ff1d098cd304f44bf18057fb5d284a3329b78162d29821e28c AS runtime

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

COPY --from=builder --chown=node:node /opt/redbox-portal/package*.json ./
COPY --from=builder --chown=node:node /opt/redbox-portal/app.js ./app.js
COPY --from=builder --chown=node:node /opt/redbox-portal/api ./api
COPY --from=builder --chown=node:node /opt/redbox-portal/assets ./assets
COPY --from=builder --chown=node:node /opt/redbox-portal/.tmp/public ./.tmp/public
COPY --from=builder --chown=node:node /opt/redbox-portal/config ./config
COPY --from=builder --chown=node:node /opt/redbox-portal/bootstrap-data ./bootstrap-data
COPY --from=builder --chown=node:node /opt/redbox-portal/language-defaults ./language-defaults
COPY --from=runtime-files --chown=node:node /opt/redbox-portal/packages ./packages
RUN rm -rf packages/redbox-hook-dev packages/sails-hook-redbox-pdfgen
COPY --from=builder --chown=node:node /opt/redbox-portal/views ./views
COPY --from=prod-deps --chown=node:node /opt/redbox-portal/node_modules ./node_modules

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD ["sh", "-c", "curl -fsS \"http://localhost:${PORT:-1337}/\" >/dev/null"]

USER node

# Repair links in the assembled production graph, independently of the builder.
# Development-only CLI packages are intentionally omitted from this graph.
RUN npm rebuild --ignore-scripts

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
COPY --from=runtime-files --chown=node:node /opt/redbox-portal/packages/sails-hook-redbox-pdfgen ./packages/sails-hook-redbox-pdfgen
RUN npm install --omit=dev --ignore-scripts --save --package-lock=true --no-audit \
    ./packages/sails-hook-redbox-pdfgen
RUN node -e "require('@researchdatabox/redbox-core'); require('@researchdatabox/sails-hook-redbox-pdfgen')"
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

# Optional test/demo image: layers the development hook (redbox-hook-dev: demo
# record types, workflows, dashboards and forms) on top of the otherwise pristine
# runtime. Built with `--target test` and used by the integration test suites.
# The vanilla runtime image never includes it, so published/client images stay
# pristine. The hook's dist was built in the builder stage and copied in via the
# packages/ directory; here we only re-link it into node_modules so the
# redbox-loader discovers it (it was pruned from node_modules for `runtime`).
FROM runtime AS test
USER root
COPY --from=runtime-files --chown=node:node /opt/redbox-portal/packages/redbox-hook-dev ./packages/redbox-hook-dev
COPY --from=builder --chown=node:node /opt/redbox-portal/node_modules ./node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/agenda-sqs-backend/node_modules ./packages/agenda-sqs-backend/node_modules
# Angular npm ci owns the final shared-package dev graph (its lockfile differs
# from the standalone package lock), matching the pre-refactor test snapshot.
COPY --from=angular-builder --chown=node:node /opt/redbox-portal/packages/sails-ng-common/node_modules ./packages/sails-ng-common/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/raido/node_modules ./packages/raido/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/rva-registry/node_modules ./packages/rva-registry/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/redbox-core/node_modules ./packages/redbox-core/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/sails-hook-redbox-storage-mongo/node_modules ./packages/sails-hook-redbox-storage-mongo/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/redbox-dev-tools/node_modules ./packages/redbox-dev-tools/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/redbox-hook-dev/node_modules ./packages/redbox-hook-dev/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/sails-hook-redbox-pdfgen/node_modules ./packages/sails-hook-redbox-pdfgen/node_modules
RUN ln -sfn ../packages/redbox-hook-dev node_modules/redbox-hook-dev \
 && chown -h node:node node_modules/redbox-hook-dev
USER node

# Keep the vanilla (pristine) runtime image as the default build target.
FROM runtime
