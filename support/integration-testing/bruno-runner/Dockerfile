FROM node:24-alpine

# Ensure global modules are resolvable by require()
ENV NODE_PATH=/usr/local/lib/node_modules
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV CI=true

# Basic tools for health checks
RUN apk add --no-cache curl

# Preinstall Bruno CLI and common test deps to avoid npm ci during tests
RUN npm i -g @usebruno/cli@1.34.1 cheerio@1.0.0-rc.12 \
  && npm cache clean --force

# Pre-bake Bruno test dependencies to leverage Docker layer cache
WORKDIR /opt/bruno-tests
# Copy only package manifests first to maximize cache hits
COPY test/bruno/package*.json ./
RUN if [ -f package.json ]; then npm ci; fi
# Copy the remaining bruno tests (not strictly required for runtime, but useful for cache locality)
COPY test/bruno ./

# Make both global and baked test node_modules resolvable
ENV NODE_PATH=/usr/local/lib/node_modules:/opt/bruno-tests/node_modules

# Default shell for compatibility
SHELL ["/bin/sh", "-lc"]
