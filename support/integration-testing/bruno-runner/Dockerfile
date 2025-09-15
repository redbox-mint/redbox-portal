FROM node:24-alpine

# Ensure global modules are resolvable by require()
ENV NODE_PATH=/usr/local/lib/node_modules
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV CI=true

# Preinstall Bruno CLI and test deps to avoid npm ci during tests
RUN npm i -g @usebruno/cli@1.34.1 cheerio@1.0.0-rc.12 \
  && npm cache clean --force

# Default shell for compatibility
SHELL ["/bin/sh", "-lc"]

