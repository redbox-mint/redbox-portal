FROM development-rbportal:latest
COPY npm /opt/review-npm-11.20.0
USER root
RUN chmod -R a+rX /opt/review-npm-11.20.0 && mkdir -p /opt/review-npm-bin && ln -s /opt/review-npm-11.20.0/bin/npm-cli.js /opt/review-npm-bin/npm && ln -s /opt/review-npm-11.20.0/bin/npx-cli.js /opt/review-npm-bin/npx
ENV PATH="/opt/review-npm-bin:${PATH}"
RUN test "$(npm --version)" = 11.20.0
USER node
