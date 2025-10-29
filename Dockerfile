FROM node:24.10.0
ENV node_env=production
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin
ENV NODE_ENV=$node_env
RUN echo "Australia/Brisbane" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata
COPY --chown=node:node . /opt/redbox-portal
USER node
CMD ["node", "app.js"]
