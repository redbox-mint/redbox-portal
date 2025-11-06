FROM node:24.8.0@sha256:82a1d74c5988b72e839ac01c5bf0f7879a8ffd14ae40d7008016bca6ae12852b AS base

# Find the current stable chome version here: https://googlechromelabs.github.io/chrome-for-testing/
ARG CHROME_TARGET_VERSION="142.0.7444.61"

USER root
RUN mkdir -p /opt/redbox-portal
WORKDIR /opt/redbox-portal


FROM base AS install-deps-compile-core

# Install deps
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=core/package.json,target=core/package.json \
    --mount=type=bind,source=core/package-lock.json,target=core/package-lock.json \
    cd core \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

COPY core/package.json \
    core/package-lock.json \
    core/tsconfig.json \
    /opt/redbox-portal/core/
COPY core/src /opt/redbox-portal/core/src

# Compile
RUN --mount=type=cache,target=/root/.npm \
    cd core \
    && npm exec --no -- tsc


FROM base AS install-deps-compile-sails-ng-common

# Install deps
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=packages/sails-ng-common/package.json,target=packages/sails-ng-common/package.json \
    --mount=type=bind,source=packages/sails-ng-common/package-lock.json,target=packages/sails-ng-common/package-lock.json \
    ls -la \
    && mkdir -p packages/sails-ng-common \
    && cd packages/sails-ng-common \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

COPY packages/sails-ng-common/package.json \
    packages/sails-ng-common/package-lock.json \
    packages/sails-ng-common/tsconfig.json \
    /opt/redbox-portal/packages/sails-ng-common/
COPY packages/sails-ng-common/src /opt/redbox-portal/packages/sails-ng-common/src
COPY packages/sails-ng-common/test /opt/redbox-portal/packages/sails-ng-common/test

# Compile
RUN --mount=type=cache,target=/root/.npm \
    cd packages/sails-ng-common \
    && npm exec --no -- tsc


FROM base AS install-deps-compile-raido

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

# Install deps
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/opt/openapitools \
    --mount=type=bind,source=support/raido/package.json,target=support/raido/package.json \
    --mount=type=bind,source=support/raido/package-lock.json,target=support/raido/package-lock.json \
    cd support/raido \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

COPY support/raido/package.json \
    support/raido/package-lock.json \
    support/raido/tsconfig.json \
    support/raido/openapitools.json \
    /opt/redbox-portal/support/raido/

# Generate src and compile
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/opt/openapitools \
    cd support/raido \
    && npm run generate \
    && npm exec --no -- tsc


FROM base AS install-deps-compile-sails

COPY --from=install-deps-compile-core /opt/redbox-portal/core/ /opt/redbox-portal/core/
COPY --from=install-deps-compile-sails-ng-common /opt/redbox-portal/packages/sails-ng-common/ /opt/redbox-portal/packages/sails-ng-common/
COPY --from=install-deps-compile-raido /opt/redbox-portal/support/raido/ /opt/redbox-portal/support/raido/

# Install deps
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund

COPY package.json \
    package-lock.json \
    tsconfig.json \
    /opt/redbox-portal/
COPY typescript /opt/redbox-portal/typescript
RUN --mount=type=cache,target=/root/.npm \
    npm exec --no -- tsc


FROM base AS install-deps-compile-angular

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

# Install angular deps
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=angular/package.json,target=angular/package.json \
    --mount=type=bind,source=angular/package-lock.json,target=angular/package-lock.json \
    cd angular \
    && npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
# Copy angular project files
COPY angular/angular.json \
     angular/angular-custom.json \
     angular/package.json \
     angular/package-lock.json \
     angular/tsconfig.json \
    /opt/redbox-portal/angular/
COPY angular/projects /opt/redbox-portal/angular/projects
COPY support/build/angular-i18next-index.d.ts angular/node_modules/angular-i18next/index.d.ts
RUN chown -R node:node /opt/redbox-portal/angular
RUN mkdir -p /opt/redbox-portal/assets \
    && chown -R node:node /opt/redbox-portal/assets
USER node

#FROM install-deps-compile-angular AS install-deps-compile-angular-portal-ng-common
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/portal-ng-common
## && npm exec --no -- ng test --browsers=ChromeHeadless @researchdatabox/portal-ng-common --no-watch --no-progress --code-coverage

#FROM install-deps-compile-angular-portal-ng-common AS install-deps-compile-angular-portal-ng-form-custom
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/portal-ng-form-custom

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-app-config
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/app-config
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/app-config

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-dashboard
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/dashboard
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/dashboard

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-deleted-records
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/deleted-records
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/deleted-records

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-export
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/export
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/export

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-form
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/form
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/form

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-local-auth
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/local-auth
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/local-auth

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-manage-roles
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/manage-roles
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/manage-roles

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-manage-users
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/manage-users
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/manage-users

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-report
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/report
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/report

#FROM install-deps-compile-angular-portal-ng-form-custom AS install-deps-compile-angular-translation
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,from=install-deps-compile-sails-ng-common,source=/opt/redbox-portal/packages/sails-ng-common,target=packages/sails-ng-common \
    cd angular \
    && npm exec --no -- ng build --configuration production @researchdatabox/translation
#    && npm exec --no -- ng test --browsers=ChromeHeadless --no-watch --no-progress --code-coverage @researchdatabox/translation


FROM node:14@sha256:a158d3b9b4e3fa813fa6c8c590b8f0a860e015ad4e59bbce5744d2f6fd8461aa AS install-deps-compile-angular-legacy

USER root
RUN mkdir -p /opt/redbox-portal
WORKDIR /opt/redbox-portal

COPY ./angular-legacy/ /opt/redbox-portal/angular-legacy/
COPY ./support/development/compileDevAngularLegacy.sh /opt/redbox-portal/support/development/compileDevAngularLegacy.sh

RUN cd ./angular-legacy \
    && npm ci --legacy-peer-deps


FROM install-deps-compile-sails AS redbox-test-mocha

# Copy build angular apps
COPY --from=install-deps-compile-angular /opt/redbox-portal/assets/angular/ /opt/redbox-portal/assets/angular/

# Copy app files
COPY ./api/ /opt/redbox-portal/api/
COPY ./config/ /opt/redbox-portal/config/
COPY ./form-config/ /opt/redbox-portal/form-config/
COPY ./language-defaults/ /opt/redbox-portal/language-defaults/
COPY ./views/ /opt/redbox-portal/views/
COPY ./assets/ /opt/redbox-portal/assets/
COPY ./support/build/wrapper-webpack.js /opt/redbox-portal/support/build/wrapper-webpack.js

# Copy tests files
COPY ./test/ /opt/redbox-portal/test/

# Copy test runner config files
COPY ./support/integration-testing/recordtype-solr-multi-core-example.js /opt/redbox-portal/config/recordtype.js
COPY ./support/integration-testing/solr-multi-core-example.js /opt/redbox-portal/config/solr.js
COPY ./test/resources/ /opt/redbox-portal/test/resources/

# Build webpack
RUN --mount=type=bind,from=install-deps-compile-angular-legacy,source=/opt/redbox-portal/angular-legacy,target=angular-legacy \
    --mount=type=bind,from=install-deps-compile-angular,source=/opt/redbox-portal/angular,target=angular \
    NODE_ENV=docker WEBPACK_CSS_MINI=true node /opt/redbox-portal/support/build/wrapper-webpack.js
