FROM node:24.5-bullseye
ENV node_env production
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin
RUN wget -O /usr/local/bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_x86_64
RUN chmod +x /usr/local/bin/dumb-init
RUN echo "Australia/Brisbane" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata
COPY --chown=node:node . /opt/redbox-portal
RUN chown -R node:node /opt/redbox-portal; ls -l /opt; ls -l /opt/redbox-portal;
USER node
RUN echo "Permissions should be set, running as 'node' user, dumping permissions again: "; ls -l /opt; ls -l /opt/redbox-portal;
CMD NODE_ENV=$node_env node app.js
