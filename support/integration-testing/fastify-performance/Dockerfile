ARG BASE_IMAGE=redbox-current-overlay-validation:mocha-fixed
FROM ${BASE_IMAGE}
COPY snapshot/ /opt/redbox-portal/
WORKDIR /opt/redbox-portal
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1024
ENTRYPOINT ["node", "support/integration-testing/fastify-performance/owner.cjs"]
