FROM node:24.8.0@sha256:82a1d74c5988b72e839ac01c5bf0f7879a8ffd14ae40d7008016bca6ae12852b AS base

# Find the current stable chome version here: https://googlechromelabs.github.io/chrome-for-testing/
ARG CHROME_TARGET_VERSION="142.0.7444.61"

USER root
RUN mkdir -p /opt/redbox-portal \
    && chown node:node /opt/redbox-portal
WORKDIR /opt/redbox-portal

# install codecov cli
RUN mkdir -p /tmp/.codecov-cli \
    && cd /tmp/.codecov-cli \
    && curl https://keybase.io/codecovsecurity/pgp_keys.asc | gpg --no-default-keyring --keyring trustedkeys.gpg --import \
    && curl -Os https://cli.codecov.io/latest/linux/codecov \
    && curl -Os https://cli.codecov.io/latest/linux/codecov.SHA256SUM \
    && curl -Os https://cli.codecov.io/latest/linux/codecov.SHA256SUM.sig \
    && gpgv codecov.SHA256SUM.sig codecov.SHA256SUM \
    && shasum -a 256 -c codecov.SHA256SUM \
    && chmod +x codecov \
    && mv codecov /usr/local/bin/codecov \
    && codecov --help

# Install apt dependencies for installing chrome
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get --no-install-recommends install -y wget

# Install Chrome
RUN mkdir -p /opt/chrome \
    && wget -q -O /opt/chrome/chrome-linux64.zip "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_TARGET_VERSION}/linux64/chrome-linux64.zip" \
    && unzip /opt/chrome/chrome-linux64.zip -d /opt/chrome/ \
    && ln -s /opt/chrome/chrome-linux64/chrome /usr/local/bin/google-chrome

# Install chromedriver
RUN wget -q -O /opt/chrome/chromedriver-linux64.zip "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_TARGET_VERSION}/linux64/chromedriver-linux64.zip" \
    && unzip /opt/chrome/chromedriver-linux64.zip -d /opt/chrome/ \
    && ln -s /opt/chrome/chromedriver-linux64/chromedriver /usr/local/bin/chromedriver

# Install Chrome dependencies
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    while read pkg; do apt-get satisfy -y --no-install-recommends "${pkg}"; done < /opt/chrome/chrome-linux64/deb.deps

# Install Java - Eclipse Adoptium - Temurin
# From: https://adoptium.net/en-GB/installation/linux
# For generating raido from openapi definition
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get --no-install-recommends install -y wget apt-transport-https gpg \
    && wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor | tee /etc/apt/trusted.gpg.d/adoptium.gpg > /dev/null \
    && echo "deb https://packages.adoptium.net/artifactory/deb $(awk -F= '/^VERSION_CODENAME/{print$2}' /etc/os-release) main" | tee /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt --no-install-recommends install -y temurin-21-jre

USER node

FROM base AS install-deps-compile-core

# Install deps
COPY --chown=node:node core/package.json core/package-lock.json /opt/redbox-portal/core/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd core \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# Compile
COPY --chown=node:node core/tsconfig.json /opt/redbox-portal/core/
COPY --chown=node:node core/src /opt/redbox-portal/core/src/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd core \
    && npm exec --no -- tsc


FROM base AS install-deps-compile-sails-ng-common

# Install deps
COPY --chown=node:node packages/sails-ng-common/package.json packages/sails-ng-common/package-lock.json \
    /opt/redbox-portal/packages/sails-ng-common/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd packages/sails-ng-common \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# Compile
COPY --chown=node:node packages/sails-ng-common/tsconfig.json /opt/redbox-portal/packages/sails-ng-common/
COPY --chown=node:node packages/sails-ng-common/src /opt/redbox-portal/packages/sails-ng-common/src/
COPY --chown=node:node packages/sails-ng-common/test /opt/redbox-portal/packages/sails-ng-common/test/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd packages/sails-ng-common \
    && npm exec --no -- tsc


FROM base AS install-deps-compile-raido

# Install deps
COPY --chown=node:node support/raido/package.json \
    support/raido/package-lock.json \
    /opt/redbox-portal/support/raido/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    --mount=type=cache,target=/opt/openapitools,uid=1000,gid=1000 \
    cd support/raido \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# Generate src and compile
COPY --chown=node:node support/raido/tsconfig.json support/raido/openapitools.json \
    /opt/redbox-portal/support/raido/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    --mount=type=cache,target=/opt/openapitools,uid=1000,gid=1000 \
    cd support/raido \
    && npm run generate \
    && npm exec --no -- tsc


FROM base AS install-deps-compile-angular

# Install angular deps
COPY --chown=node:node angular/package.json \
     angular/package-lock.json \
    /opt/redbox-portal/angular/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd angular \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# Copy angular project files
COPY --chown=node:node angular/angular.json \
     angular/angular-custom.json \
     angular/tsconfig.json \
    /opt/redbox-portal/angular/
COPY --chown=node:node angular/projects /opt/redbox-portal/angular/projects
COPY --chown=node:node support/build/angular-i18next-index.d.ts angular/node_modules/angular-i18next/index.d.ts
RUN mkdir -p /opt/redbox-portal/assets

COPY --chown=node:node --from=install-deps-compile-sails-ng-common /opt/redbox-portal/packages/sails-ng-common /opt/redbox-portal/packages/sails-ng-common

RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd angular \
    export NG_FORCE_TTY=false \
    && node_modules/.bin/ng build --configuration production @researchdatabox/portal-ng-common \
    && node_modules/.bin/ng build --configuration production @researchdatabox/portal-ng-form-custom \
    && node_modules/.bin/ng build --configuration production @researchdatabox/app-config \
    && node_modules/.bin/ng build --configuration production @researchdatabox/dashboard \
    && node_modules/.bin/ng build --configuration production @researchdatabox/deleted-records \
    && node_modules/.bin/ng build --configuration production @researchdatabox/export \
    && node_modules/.bin/ng build --configuration production @researchdatabox/form \
    && node_modules/.bin/ng build --configuration production @researchdatabox/local-auth \
    && node_modules/.bin/ng build --configuration production @researchdatabox/manage-roles \
    && node_modules/.bin/ng build --configuration production @researchdatabox/manage-users \
    && node_modules/.bin/ng build --configuration production @researchdatabox/report \
    && node_modules/.bin/ng build --configuration production @researchdatabox/translation


FROM base AS install-deps-compile-sails

# Copy app files
COPY --chown=node:node ./api/ /opt/redbox-portal/api/
COPY --chown=node:node ./config/ /opt/redbox-portal/config/
COPY --chown=node:node ./form-config/ /opt/redbox-portal/form-config/
COPY --chown=node:node ./language-defaults/ /opt/redbox-portal/language-defaults/
COPY --chown=node:node ./views/ /opt/redbox-portal/views/
COPY --chown=node:node ./assets/ /opt/redbox-portal/assets/
COPY --chown=node:node ./support/build/wrapper-webpack.js /opt/redbox-portal/support/build/wrapper-webpack.js

# Copy tests files
COPY --chown=node:node ./test/resources/ /opt/redbox-portal/

COPY --chown=node:node --from=install-deps-compile-core /opt/redbox-portal/core/ /opt/redbox-portal/core/
COPY --chown=node:node --from=install-deps-compile-sails-ng-common /opt/redbox-portal/packages/sails-ng-common/ /opt/redbox-portal/packages/sails-ng-common/
COPY --chown=node:node --from=install-deps-compile-raido /opt/redbox-portal/support/raido/ /opt/redbox-portal/support/raido/
COPY --chown=node:node --from=install-deps-compile-angular /opt/redbox-portal/assets/angular/ /opt/redbox-portal/assets/angular/

# Install deps
COPY --chown=node:node package.json package-lock.json \
    /opt/redbox-portal/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# compile
COPY --chown=node:node tsconfig.json /opt/redbox-portal/
COPY --chown=node:node typescript/ /opt/redbox-portal/typescript/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm exec --no -- tsc


FROM node:14.21.3 AS install-deps-compile-angular-legacy

USER root

RUN mkdir -p /opt/redbox-portal \
    && chown node:node /opt/redbox-portal
WORKDIR /opt/redbox-portal

USER node

COPY --chown=node:node ./angular-legacy/ /opt/redbox-portal/angular-legacy/
COPY --chown=node:node ./support/development/compileDevAngularLegacy.sh /opt/redbox-portal/support/development/compileDevAngularLegacy.sh

RUN cd ./angular-legacy \
    && npm ci --legacy-peer-deps


# -------------------------------
# Docker builds for customising supporting services
# -------------------------------

FROM quay.io/keycloak/keycloak:17.0.1 AS redbox-keycloak

# See: https://quay.io/repository/keycloak/keycloak/manifest/sha256:1996203d4278fe6218b73c60583a0e8a7a8d4a9e2b2865bf1c3d3ead8e117cf8
COPY --chown=1000:1000 support/integration-testing/keycloakdb/data /opt/keycloak/data


# -------------------------------
# Definitions used in the compose.yml file
# -------------------------------

FROM install-deps-compile-sails AS redbox-test-base

# Build webpack
RUN --mount=type=bind,from=install-deps-compile-angular-legacy,source=/opt/redbox-portal/angular-legacy,target=angular-legacy \
    NODE_ENV=docker WEBPACK_CSS_MINI=true node /opt/redbox-portal/support/build/wrapper-webpack.js


FROM redbox-test-base AS redbox-test-mocha

# Copy tests files
COPY --chown=node:node ./test/ /opt/redbox-portal/test/

# Copy test runner config files
COPY --chown=node:node ./support/integration-testing/recordtype-solr-multi-core-example.js /opt/redbox-portal/config/recordtype.js
COPY --chown=node:node ./support/integration-testing/solr-multi-core-example.js /opt/redbox-portal/config/solr.js


FROM redbox-test-base AS redbox-test-bruno-oidc

# Install Bruno packages
COPY --chown=node:node test/bruno/package.json test/bruno/package-lock.json test/bruno/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd test/bruno \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# Copy test runner config files
COPY --chown=node:node ["./test/bruno/bruno.json", "/opt/redbox-portal/test/bruno/bruno.json"]
COPY --chown=node:node ["./test/bruno/package.json", "/opt/redbox-portal/test/bruno/package.json"]
COPY --chown=node:node ["./test/bruno/package-lock.json", "/opt/redbox-portal/test/bruno/package-lock.json"]
COPY --chown=node:node ["./test/bruno/attachment.png", "/opt/redbox-portal/test/bruno/attachment.png"]
COPY --chown=node:node ["./test/bruno/environments","/opt/redbox-portal/test/bruno/environments"]
COPY --chown=node:node ["./test/bruno/5 - OpenID Connect Denied","/opt/redbox-portal/test/bruno/5 - OpenID Connect Denied"]
COPY --chown=node:node ["./test/bruno/6 - OpenID Connect Allowed","/opt/redbox-portal/test/bruno/6 - OpenID Connect Allowed"]


FROM redbox-test-base AS redbox-test-bruno-general

# Install Bruno packages
COPY --chown=node:node test/bruno/package.json test/bruno/package-lock.json test/bruno/
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    cd test/bruno \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

# Copy test runner config files
COPY --chown=node:node ["./test/bruno/bruno.json", "/opt/redbox-portal/test/bruno/bruno.json"]
COPY --chown=node:node ["./test/bruno/package.json", "/opt/redbox-portal/test/bruno/package.json"]
COPY --chown=node:node ["./test/bruno/package-lock.json", "/opt/redbox-portal/test/bruno/package-lock.json"]
COPY --chown=node:node ["./test/bruno/attachment.png", "/opt/redbox-portal/test/bruno/attachment.png"]
COPY --chown=node:node ["./test/bruno/environments","/opt/redbox-portal/test/bruno/environments"]
COPY --chown=node:node ["./test/bruno/1 - REST API", "/opt/redbox-portal/test/bruno/1 - REST API"]
COPY --chown=node:node ["./test/bruno/2 - AJAX calls", "/opt/redbox-portal/test/bruno/2 - AJAX calls"]
COPY --chown=node:node ["./test/bruno/3 - OpenID Connect", "/opt/redbox-portal/test/bruno/3 - OpenID Connect"]
COPY --chown=node:node ["./test/bruno/4 - General", "/opt/redbox-portal/test/bruno/4 - General"]

RUN rm -rf "/opt/redbox-portal/test/bruno/1 - REST API/10 - Translation"

FROM redbox-test-base AS redbox-test-web

COPY --chown=node:node app.integrationtest.js app.js ./
