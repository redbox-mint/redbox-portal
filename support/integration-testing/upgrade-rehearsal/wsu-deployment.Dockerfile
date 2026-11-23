FROM redbox-fm044:r5-980c2f3a1e

USER root
RUN --mount=type=bind,source=wsu.tgz,target=/tmp/wsu.tgz \
    --mount=type=bind,source=xmlbuilder.tgz,target=/tmp/xmlbuilder.tgz \
    mkdir node_modules/redbox-hook-wsu node_modules/xmlbuilder \
 && tar -xzf /tmp/wsu.tgz -C node_modules/redbox-hook-wsu --strip-components=1 \
 && tar -xzf /tmp/xmlbuilder.tgz -C node_modules/xmlbuilder --strip-components=1 \
 && npm pkg set 'dependencies.redbox-hook-wsu=2.0.0-v6.0' \
 && node -e 'const assert = require("node:assert/strict"); assert.equal(require("redbox-hook-wsu").registerRedboxExtension().apiVersion, 2); assert.equal(typeof require("redbox-hook-wsu/deployment").createWsuPortal, "function");'
USER node
CMD ["node", "node_modules/redbox-hook-wsu/support/v6/app.cjs"]
