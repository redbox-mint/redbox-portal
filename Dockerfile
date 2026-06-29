# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89

FROM node:24.16.0-bookworm AS base

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

RUN npm ci \
 && (cd packages/agenda-sqs-backend && npm ci) \
 && (cd packages/sails-ng-common && npm ci) \
 && (cd packages/raido && npm ci) \
 && (cd packages/rva-registry && npm ci) \
 && (cd packages/redbox-core && npm ci) \
 && (cd packages/sails-hook-redbox-storage-mongo && npm ci)

RUN cd packages/agenda-sqs-backend && npm run build
RUN cd packages/raido && npm run build
RUN cd packages/rva-registry && npm run build
RUN cd packages/sails-ng-common && npm run compile
RUN cd packages/redbox-core && npx tsc -p tsconfig.json
RUN cd packages/sails-hook-redbox-storage-mongo && npm run compile
# redbox-hook-dev is a devDependency that supplies the demo record types/forms.
# Build its dist so the optional `test` image (below) can load it. It is pruned
# from node_modules for the pristine runtime image.
RUN cd packages/redbox-hook-dev && npm install --no-save --ignore-scripts && npm run build

RUN npx tsc --project tsconfig.json

RUN chmod +x support/build/compileProductionAngular.sh \
 && support/build/compileProductionAngular.sh

RUN npm run webpack

RUN chmod +x support/build/api-descriptors/generateAPIDescriptors.sh \
 && support/build/api-descriptors/generateAPIDescriptors.sh

RUN cp -a node_modules /tmp/test-node_modules \
 && mkdir -p /tmp/test-package-node-modules/packages \
 && for package_path in \
      packages/agenda-sqs-backend \
      packages/raido \
      packages/rva-registry \
      packages/sails-ng-common \
      packages/redbox-core \
      packages/sails-hook-redbox-storage-mongo \
      packages/redbox-hook-dev; do \
      if [ -d "$package_path/node_modules" ]; then \
        mkdir -p "/tmp/test-package-node-modules/$package_path"; \
        cp -a "$package_path/node_modules" "/tmp/test-package-node-modules/$package_path/node_modules"; \
      fi; \
    done

RUN npm prune --omit=dev \
 && npm cache clean --force \
 && rm -rf \
    packages/redbox-core/node_modules \
    packages/sails-ng-common/node_modules \
    packages/raido/node_modules \
    packages/rva-registry/node_modules \
    packages/redbox-hook-dev/node_modules \
    angular/node_modules \
    angular-legacy/node_modules \
    support/build/api-descriptors/node_modules

FROM node:24.16.0-bookworm-slim AS runtime

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
COPY --from=builder --chown=node:node /opt/redbox-portal/packages ./packages
RUN rm -rf packages/redbox-hook-dev
COPY --from=builder --chown=node:node /opt/redbox-portal/views ./views
COPY --from=builder --chown=node:node /opt/redbox-portal/node_modules ./node_modules

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
RUN npm install --omit=dev --save --package-lock=true \
    @researchdatabox/sails-hook-redbox-pdfgen@0.0.1-beta.105
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
COPY --from=builder --chown=node:node /opt/redbox-portal/packages/redbox-hook-dev ./packages/redbox-hook-dev
COPY --from=builder --chown=node:node /tmp/test-node_modules ./node_modules
COPY --from=builder --chown=node:node /tmp/test-package-node-modules/packages ./packages
RUN ln -sfn ../packages/redbox-hook-dev node_modules/redbox-hook-dev \
 && chown -h node:node node_modules/redbox-hook-dev
USER node

# Keep the vanilla (pristine) runtime image as the default build target.
FROM runtime
