# syntax=docker/dockerfile:1.7

FROM node:24.13.1-bullseye AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    python2 \
    python3 \
    python-is-python3 \
    curl \
    ca-certificates \
    tzdata \
    openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/*

ENV PYTHON=/usr/bin/python2
ENV npm_config_python=/usr/bin/python2
ENV NVM_DIR=/root/.nvm
RUN bash -lc "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"

WORKDIR /opt/redbox-portal
SHELL ["bash", "-o", "pipefail", "-c"]

FROM base AS builder

COPY . .

RUN npm ci \
 && (cd packages/redbox-core-types && npm ci) \
 && (cd packages/sails-ng-common && npm ci) \
 && (cd packages/raido && npm ci) \
 && (cd packages/rva-registry && npm ci) \
 && (cd packages/sails-hook-redbox-storage-mongo && npm ci)

RUN cd packages/raido && npm run build
RUN cd packages/rva-registry && npm run build
RUN cd packages/sails-ng-common && npm run compile
RUN cd packages/redbox-core-types && npx tsc -p tsconfig.json
RUN cd packages/sails-hook-redbox-storage-mongo && npm run compile

RUN npx tsc --project tsconfig.json

RUN chmod +x support/build/compileProductionAngular.sh \
 && support/build/compileProductionAngular.sh

RUN npm run webpack

RUN chmod +x support/build/api-descriptors/generateAPIDescriptors.sh \
 && support/build/api-descriptors/generateAPIDescriptors.sh

RUN npm prune --omit=dev \
 && npm cache clean --force \
 && rm -rf \
    packages/redbox-core-types/node_modules \
    packages/sails-ng-common/node_modules \
    packages/raido/node_modules \
    packages/rva-registry/node_modules \
    angular/node_modules \
    angular-legacy/node_modules \
    support/build/api-descriptors/node_modules

FROM node:24.13.1-bullseye-slim AS runtime

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
COPY --from=builder --chown=node:node /opt/redbox-portal/redbox-loader.js ./redbox-loader.js
COPY --from=builder --chown=node:node /opt/redbox-portal/api ./api
COPY --from=builder --chown=node:node /opt/redbox-portal/assets ./assets
COPY --from=builder --chown=node:node /opt/redbox-portal/.tmp/public ./.tmp/public
COPY --from=builder --chown=node:node /opt/redbox-portal/config ./config
COPY --from=builder --chown=node:node /opt/redbox-portal/form-config ./form-config
COPY --from=builder --chown=node:node /opt/redbox-portal/bootstrap-data ./bootstrap-data
COPY --from=builder --chown=node:node /opt/redbox-portal/language-defaults ./language-defaults
COPY --from=builder --chown=node:node /opt/redbox-portal/packages ./packages
COPY --from=builder --chown=node:node /opt/redbox-portal/views ./views
COPY --from=builder --chown=node:node /opt/redbox-portal/node_modules ./node_modules

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD ["sh", "-c", "curl -fsS \"http://localhost:${PORT:-1337}/\" >/dev/null"]

USER node

CMD ["node", "app.js"]

# Plugin-augmented runtime variants for common release tags.
FROM runtime AS runtime_datastream_cloud
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends git
USER node
RUN npm install --omit=dev --no-save --package-lock=false \
    @researchdatabox/sails-hook-redbox-datastream-cloud
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

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
RUN npm install --omit=dev --no-save --package-lock=false \
    @researchdatabox/sails-hook-redbox-pdfgen
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

FROM runtime_puppeteer_base AS runtime_cloud_pdfgen
RUN npm install --omit=dev --no-save --package-lock=false \
    @researchdatabox/sails-hook-redbox-datastream-cloud \
    @researchdatabox/sails-hook-redbox-pdfgen
USER root
RUN apt-get purge -y --auto-remove git \
 && rm -rf /var/lib/apt/lists/*
USER node

# Keep the vanilla runtime image as the default build target.
FROM runtime
