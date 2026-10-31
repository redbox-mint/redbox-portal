# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

# Default builds need no additional context. Opt in with WEB_ASSETS=shared and
# --build-context web-assets=RESTORED_DIRECTORY (see ci-web-assets/README.md).
ARG WEB_ASSETS=local

FROM node:26.12.1-bookworm AS base

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

FROM base AS backend_builder

COPY . .

RUN npm ci --no-audit \
 && (cd packages/agenda-sqs-backend && npm ci --no-audit) \
 && (cd packages/sails-ng-common && npm ci --no-audit) \
 && (cd packages/raido && npm ci --no-audit) \
 && (cd packages/rva-registry && npm ci --no-audit) \
 && (cd packages/redbox-core && npm install --no-save --no-audit) \
 && (cd packages/sails-hook-redbox-storage-mongo && npm ci --no-audit)

RUN cd packages/agenda-sqs-backend && npm run build
RUN cd packages/raido && npm run build
RUN cd packages/rva-registry && npm run build
RUN cd packages/sails-ng-common && npm run compile
RUN cd packages/redbox-core && npx tsc -p tsconfig.json
RUN cd packages/redbox-dev-tools && npm install --include=dev --no-save --ignore-scripts --strict-peer-deps --no-audit && npm run build
RUN cd packages/sails-hook-redbox-storage-mongo && npm run compile
# redbox-hook-dev is a devDependency that supplies the demo record types/forms.
# Build its dist so the optional `test` image (below) can load it. It is pruned
# from node_modules for the pristine runtime image.
RUN cd packages/redbox-hook-dev && npm install --no-save --ignore-scripts --no-audit && npm run build
# Build the optional PDF hook from this checkout. The pdfgen runtime target
# installs this local package, so it does not depend on a separately released
# portal-core-compatible npm version.
RUN cd packages/sails-hook-redbox-pdfgen && npm install --include=dev --no-save --ignore-scripts --legacy-peer-deps --no-audit && npm run compile

RUN npx tsc --project tsconfig.json

FROM backend_builder AS web_assets_local

RUN chmod +x support/build/compileProductionAngular.sh \
 && support/build/compileProductionAngular.sh

RUN npm run webpack

# Give both branches a metadata directory; ordinary builds do not require a
# revision and do not claim to contain verified producer metadata.
RUN mkdir -p .redbox-ci

# A supplied named context overrides this empty stage. If it is omitted, shared
# builds fail on missing files instead of resolving an implicit registry image.
FROM scratch AS web-assets

FROM backend_builder AS web_assets_shared
ARG SOURCE_REVISION
ARG WEB_ASSETS_MANIFEST_SHA256
# Replace, never merge with the native checkout's assets or generated outputs.
RUN rm -rf assets .tmp/public .redbox-ci
COPY --from=web-assets /assets/ ./assets/
COPY --from=web-assets /.tmp/public/ ./.tmp/public/
COPY --from=web-assets /.redbox-ci/integration-assets.json ./.redbox-ci/integration-assets.json
COPY --from=web-assets /.redbox-ci/integration-image.json ./.redbox-ci/integration-image.json
RUN node support/build/docker-web-assets.cjs verify shared "${SOURCE_REVISION}" "${WEB_ASSETS_MANIFEST_SHA256}"

# BuildKit prunes the unselected branch, including its named-context dependency.
FROM web_assets_${WEB_ASSETS} AS builder

RUN chmod +x support/build/api-descriptors/generateAPIDescriptors.sh \
 && support/build/api-descriptors/generateAPIDescriptors.sh

# Preserve the published test image's historical overlay: development snapshots
# are copied over the production-installed graph, including its nested versions.
# A direct builder graph has different Companion Express/session resolution.
FROM builder AS test_dependencies
RUN cp -a node_modules /tmp/test-node_modules \
 && mkdir -p /tmp/test-package-node-modules/packages \
 && for package_path in \
      packages/agenda-sqs-backend \
      packages/raido \
      packages/rva-registry \
      packages/sails-ng-common \
      packages/redbox-core \
      packages/redbox-dev-tools \
      packages/sails-hook-redbox-storage-mongo \
      packages/redbox-hook-dev \
      packages/sails-hook-redbox-pdfgen; do \
      if [ -d "$package_path/node_modules" ]; then \
        mkdir -p "/tmp/test-package-node-modules/$package_path"; \
        cp -a "$package_path/node_modules" "/tmp/test-package-node-modules/$package_path/node_modules"; \
      fi; \
    done

FROM test_dependencies AS production_dependencies

# Reinstall the production graph after compilation. Removing nested dependency
# directories after npm prunes them also removes required runtime versions.
RUN rm -rf \
    packages/agenda-sqs-backend/node_modules \
    packages/redbox-core/node_modules \
    packages/redbox-dev-tools/node_modules \
    packages/sails-ng-common/node_modules \
    packages/raido/node_modules \
    packages/rva-registry/node_modules \
    packages/redbox-hook-dev/node_modules \
    packages/sails-hook-redbox-storage-mongo/node_modules \
    packages/sails-hook-redbox-pdfgen/node_modules \
    angular/node_modules \
    angular-legacy/node_modules \
    support/build/api-descriptors/node_modules \
 && npm ci --omit=dev --no-audit

FROM node:26.12.1-bookworm-slim AS runtime_application

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
COPY --from=builder --chown=node:node /opt/redbox-portal/.redbox-ci ./.redbox-ci
COPY --from=builder --chown=node:node /opt/redbox-portal/config ./config
COPY --from=builder --chown=node:node /opt/redbox-portal/bootstrap-data ./bootstrap-data
COPY --from=builder --chown=node:node /opt/redbox-portal/language-defaults ./language-defaults
COPY --from=builder --chown=node:node /opt/redbox-portal/views ./views

# Verify the final web copies, retaining the producer's metadata byte for byte.
# Bind native validation dependencies only for this RUN; dependency assembly in
# runtime/test/PDF remains below, unchanged. Nothing is installed in this layer.
ARG WEB_ASSETS
ARG SOURCE_REVISION
ARG WEB_ASSETS_MANIFEST_SHA256
RUN --mount=type=bind,from=builder,source=/opt/redbox-portal/support/build,target=/opt/redbox-portal/support/build \
    --mount=type=bind,from=builder,source=/opt/redbox-portal/node_modules,target=/opt/redbox-portal/node_modules \
    node support/build/docker-web-assets.cjs verify "${WEB_ASSETS}" "${SOURCE_REVISION}" "${WEB_ASSETS_MANIFEST_SHA256}"

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD ["sh", "-c", "curl -fsS \"http://localhost:${PORT:-1337}/\" >/dev/null"]

USER node

CMD ["node", "app.js"]

FROM runtime_application AS runtime

COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/packages ./packages
# These optional hooks must not be present in the pristine production image.
USER root
RUN rm -rf packages/redbox-hook-dev packages/sails-hook-redbox-pdfgen
USER node
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/node_modules ./node_modules

RUN node -e "const { createRequire } = require('module'); const corePath = require.resolve('@researchdatabox/redbox-core'); require(corePath); createRequire(corePath)('@uppy/companion')"

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
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/packages/sails-hook-redbox-pdfgen ./packages/sails-hook-redbox-pdfgen
RUN npm install --omit=dev --ignore-scripts --save --package-lock=true --no-audit \
    ./packages/sails-hook-redbox-pdfgen
RUN node -e "require('@researchdatabox/redbox-core'); require('@researchdatabox/sails-hook-redbox-pdfgen')"
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

# Published test/demo image: keep the baseline production-plus-snapshot overlay.
FROM runtime AS test
USER root
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/packages/redbox-hook-dev ./packages/redbox-hook-dev
COPY --from=production_dependencies --chown=node:node /tmp/test-node_modules ./node_modules
COPY --from=production_dependencies --chown=node:node /tmp/test-package-node-modules/packages ./packages
RUN ln -sfn ../packages/redbox-hook-dev node_modules/redbox-hook-dev \
 && chown -h node:node node_modules/redbox-hook-dev
USER node

# Experimental integration branch: the direct development graph intentionally
# remains isolated from the published test target. It is NOT graph-equivalent to
# the baseline overlay (notably Companion Express/session); see the build notes.
FROM runtime_application AS integration_development_dependencies
COPY --from=builder --chown=node:node /opt/redbox-portal/packages ./packages
COPY --from=builder --chown=node:node /opt/redbox-portal/node_modules ./node_modules
USER root
# Match the existing test payload: retain the PDF package's development dependency
# tree, but leave its source/compiled hook exclusive to the PDF runtime target.
RUN find packages/sails-hook-redbox-pdfgen -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} + \
 && ln -sfn ../packages/redbox-hook-dev node_modules/redbox-hook-dev \
 && chown -h node:node node_modules/redbox-hook-dev
USER node
RUN node -e "const { createRequire } = require('module'); const corePath = require.resolve('@researchdatabox/redbox-core'); require(corePath); createRequire(corePath)('@uppy/companion'); require('redbox-hook-dev')"

# Opt-in immutable integration payload. Neither the existing test/demo target nor
# publication/runtime targets depend on this branch. Retain source, declarations,
# maps, fixtures and each package's dependency graph for ts-node and nyc.
FROM integration_development_dependencies AS integration_payload
COPY --from=builder --chown=node:node /opt/redbox-portal/test ./test
COPY --from=builder --chown=node:node /opt/redbox-portal/support ./support
COPY --from=builder --chown=node:node /opt/redbox-portal/typescript ./typescript
COPY --from=builder --chown=node:node /opt/redbox-portal/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /opt/redbox-portal/app.integrationtest.js ./app.integrationtest.js
COPY --from=builder --chown=node:node /opt/redbox-portal/.sailsrc ./.sailsrc
# The metadata producer reads the application inventory, without needing Angular
# dependencies or a compiler in the final image.
COPY --from=builder --chown=node:node /opt/redbox-portal/angular/angular.json ./angular/angular.json
USER root
# The old bootstrap bind hid the production tree completely; replace, never merge.
# Make the application root writable too: the loader creates marker/debug files
# and directories in addition to rewriting existing api/config shims.
RUN rm -rf bootstrap-data \
 && cp -a support/resources/development/bootstrap-data bootstrap-data \
 && mkdir -p .tmp/junit/backend-mocha .tmp/logs .tmp/uploads .tmp/sessions \
      attachments reports coverage/mocha coverage/playwright \
      /attachments/staging /attachments/primary /attachments/figshare-staging \
      /tmp/coverage/mocha /tmp/coverage/playwright /tmp/nyc_output /tmp/nyc_output_playwright \
 && chown node:node . \
 && chown -R node:node bootstrap-data .tmp attachments reports coverage /attachments /tmp/coverage /tmp/nyc_output /tmp/nyc_output_playwright
USER node
# Required independent build input. Do not infer identity from copied metadata or
# Git (which is deliberately absent). All asset preparation/copies finished above.
ARG SOURCE_REVISION
RUN node support/build/docker-web-assets.cjs integration "${WEB_ASSETS}" "${SOURCE_REVISION}" "${WEB_ASSETS_MANIFEST_SHA256}" \
 && node --test support/build/integration-prebuilt-assets.test.cjs

FROM integration_payload AS integration_mocha
COPY --from=builder --chown=node:node /opt/redbox-portal/support/integration-testing/recordtype-solr-multi-core-example.js ./config/recordtype.js
COPY --from=builder --chown=node:node /opt/redbox-portal/support/integration-testing/solr-multi-core-example.js ./config/solr.js
COPY --from=builder --chown=node:node /opt/redbox-portal/test/resources/config/emailnotification.js ./config/emailnotification.js
RUN node support/build/ci-integration-image.cjs verify mocha "${SOURCE_REVISION}"

FROM integration_payload AS integration_playwright
COPY --from=builder --chown=node:node /opt/redbox-portal/test/resources/config/emailnotification.js ./config/emailnotification.js
RUN node support/build/ci-integration-image.cjs verify playwright "${SOURCE_REVISION}"

# Keep the vanilla (pristine) runtime image as the default build target.
FROM runtime
