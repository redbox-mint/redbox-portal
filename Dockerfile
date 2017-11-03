FROM node:6.11.5
ENV node_env production
COPY . /opt/redbox-portal/
RUN echo "Australia/Brisbane" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata
CMD NODE_ENV=$node_env node app.js
