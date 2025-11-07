# syntax=docker/dockerfile:1.7

FROM node:24-bullseye AS base

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    python3 \
    curl \
    ca-certificates \
    tzdata \
    openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/*

ENV NVM_DIR=/root/.nvm
RUN bash -lc "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"

WORKDIR /opt/redbox-portal
SHELL ["bash", "-o", "pipefail", "-c"]

FROM base AS builder

COPY . .

RUN npm ci \
 && npm --prefix core ci \
 && npm --prefix packages/sails-ng-common ci \
 && npm --prefix support/raido ci

RUN cd core && npx tsc -p tsconfig.json
RUN cd packages/sails-ng-common && npm run compile
RUN cd support/raido && npm run pregenerate && npm run generate
RUN npx tsc --project tsconfig.json

RUN chmod +x support/build/compileProductionAngular.sh \
 && support/build/compileProductionAngular.sh

RUN chmod +x support/build/compileProductionAngularLegacy.sh \
 && support/build/compileProductionAngularLegacy.sh

RUN npm run webpack

RUN chmod +x support/build/api-descriptors/generateAPIDescriptors.sh \
 && support/build/api-descriptors/generateAPIDescriptors.sh

RUN npm prune --omit=dev \
 && npm cache clean --force \
 && rm -rf \
    core/node_modules \
    packages/sails-ng-common/node_modules \
    support/raido/node_modules \
    angular/node_modules \
    angular-legacy/node_modules \
    support/build/api-descriptors/node_modules

FROM node:24-slim AS runtime

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
COPY --from=builder --chown=node:node /opt/redbox-portal/core ./core
COPY --from=builder --chown=node:node /opt/redbox-portal/form-config ./form-config
COPY --from=builder --chown=node:node /opt/redbox-portal/language-defaults ./language-defaults
COPY --from=builder --chown=node:node /opt/redbox-portal/packages ./packages
COPY --from=builder --chown=node:node /opt/redbox-portal/views ./views
COPY --from=builder --chown=node:node /opt/redbox-portal/node_modules ./node_modules

EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD ["sh", "-c", "curl -fsS \"http://localhost:${PORT:-1337}/\" >/dev/null"]

USER node

CMD ["node", "app.js"]
