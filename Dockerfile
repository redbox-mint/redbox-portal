FROM node:6.11.5
ENV node_env production
COPY . /opt/redbox-portal/
RUN chmod +x /opt/redbox-portal/buildTypescript.sh
RUN cd /opt/redbox-portal && ./buildTypescript.sh
RUN echo "Australia/Brisbane" > /etc/timezone && dpkg-reconfigure -f noninteractive tzdata
CMD NODE_ENV=$node_env node app.js
