# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM node:26.8.2-bookworm AS base

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

FROM base AS builder

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

RUN chmod +x support/build/compileProductionAngular.sh \
 && support/build/compileProductionAngular.sh

RUN npm run webpack

RUN chmod +x support/build/api-descriptors/generateAPIDescriptors.sh \
 && support/build/api-descriptors/generateAPIDescriptors.sh

# Keep the builder's dependency tree for the test target. A separate stage
# prunes runtime dependencies without copying every development package twice.
FROM builder AS production_dependencies
RUN npm prune --omit=dev --no-audit \
 && rm -rf \
    node_modules/redbox-hook-dev \
    packages/redbox-core/node_modules \
    packages/sails-ng-common/node_modules \
    packages/raido/node_modules \
    packages/rva-registry/node_modules \
    packages/redbox-hook-dev/node_modules \
    packages/sails-hook-redbox-pdfgen/node_modules \
    angular/node_modules \
    angular-legacy/node_modules \
    support/build/api-descriptors/node_modules

FROM node:26.8.2-bookworm-slim AS runtime

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
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/app.js ./app.js
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/api ./api
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/assets ./assets
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/.tmp/public ./.tmp/public
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/config ./config
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/bootstrap-data ./bootstrap-data
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/language-defaults ./language-defaults
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/packages ./packages
RUN rm -rf packages/redbox-hook-dev packages/sails-hook-redbox-pdfgen
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/views ./views
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/node_modules ./node_modules

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD ["sh", "-c", "curl -fsS \"http://localhost:${PORT:-1337}/\" >/dev/null"]

USER node

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
COPY --from=production_dependencies --chown=node:node /opt/redbox-portal/packages/sails-hook-redbox-pdfgen ./packages/sails-hook-redbox-pdfgen
RUN npm install --omit=dev --ignore-scripts --save --package-lock=true --no-audit \
    ./packages/sails-hook-redbox-pdfgen
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

# Optional test/demo image: layers the development hook (redbox-hook-dev: demo
# record types, workflows, dashboards and forms) on top of the otherwise pristine
# runtime. Built with `--target test` and used by the integration test suites.
# The vanilla runtime image never includes it, so published/client images stay
# pristine. Restore the compiled hook and development dependencies directly
# from the unpruned builder, then link the hook for redbox-loader discovery.
FROM runtime AS test
USER root
# Mounted regression preparation uses the same pinned Angular build Node as
# the builder. Keep it out of every published runtime target.
COPY --from=builder /root/.nvm/versions/node /opt/redbox-build-node
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/redbox-hook-dev ./packages/redbox-hook-dev
COPY --from=builder --chown=node:node /opt/redbox-portal/node_modules ./node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/raido/node_modules ./packages/raido/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/rva-registry/node_modules ./packages/rva-registry/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/sails-ng-common/node_modules ./packages/sails-ng-common/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/redbox-core/node_modules ./packages/redbox-core/node_modules
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/sails-hook-redbox-pdfgen/node_modules ./packages/sails-hook-redbox-pdfgen/node_modules
RUN ln -sfn ../packages/redbox-hook-dev node_modules/redbox-hook-dev \
 && chown -h node:node node_modules/redbox-hook-dev
USER node

# Keep the vanilla (pristine) runtime image as the default build target.
FROM runtime
