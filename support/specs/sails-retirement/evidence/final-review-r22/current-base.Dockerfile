FROM redbox-portal:sr-p8-5088f4a7a-test AS current_test
USER root
COPY redbox-core/dist /opt/redbox-portal/packages/redbox-core/dist
COPY redbox-core/package.json redbox-core/logfmt-transport.cjs /opt/redbox-portal/packages/redbox-core/
COPY path-to-regexp /opt/redbox-portal/packages/redbox-core/node_modules/path-to-regexp
COPY redbox-dev-tools /opt/redbox-portal/packages/redbox-dev-tools
FROM redbox-portal:sr-wsu-final-pdf AS current_pdf
USER root
COPY redbox-core/dist /opt/redbox-portal/packages/redbox-core/dist
COPY redbox-core/package.json redbox-core/logfmt-transport.cjs /opt/redbox-portal/packages/redbox-core/
COPY path-to-regexp /opt/redbox-portal/packages/redbox-core/node_modules/path-to-regexp
COPY redbox-dev-tools /opt/redbox-portal/packages/redbox-dev-tools
USER node
