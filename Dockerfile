FROM node:24.2.0
ENV node_env=production
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin
ENV NODE_ENV=$node_env
RUN echo "Australia/Brisbane" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata
COPY --chown=node:node . /opt/redbox-portal
RUN chown -R node:node /opt/redbox-portal; ls -l /opt; ls -l /opt/redbox-portal;
USER node
RUN echo "Permissions should be set, running as 'node' user, dumping permissions again: "; ls -l /opt; ls -l /opt/redbox-portal;
CMD ["node", "app.js"]
