ARG NIMBUS_VERSION
FROM node:18.15.0 as builder

# build wizard
WORKDIR /usr/src/app/wizard
COPY wizard .
RUN yarn
RUN rm -Rf build && yarn run build


# build monitor
WORKDIR /usr/src/monitor
COPY monitor .
RUN yarn
RUN rm -Rf build && yarn run build

FROM --platform=linux/amd64 statusim/nimbus-eth2:amd64-${NIMBUS_VERSION}

USER root
RUN apt-get -y update && apt-get -y upgrade && apt-get -y install \
    curl \
    gettext\
    jq \
    nginx \
    nodejs \
    procps \
    sudo \
    supervisor \
    vim-tiny \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -s /bin/false nginx


# Instal node v18.15.0
ENV NVM_DIR /root/.nvm
ENV NODE_VERSION v18.15.0

RUN curl https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default

ENV NODE_PATH $NVM_DIR/$NODE_VERSION/lib/node_modules
ENV PATH      $NVM_DIR/$NODE_VERSION/bin:$PATH

RUN mkdir /data  && chown user /data
VOLUME /data

COPY --from=builder /usr/src/app/wizard/build /usr/local/wizard
COPY --from=builder /usr/src/monitor/ /usr/local/monitor

COPY startNimbus.sh /opt/nimbus/
COPY reload-certs.sh /opt/nimbus/reload-certs.sh
COPY monitor/settings/defaultsettings.json /opt/nimbus
RUN chmod a+x /opt/nimbus/startNimbus.sh /opt/nimbus/reload-certs.sh
COPY supervisord.conf /etc/supervisord.conf
COPY nginx.conf /etc/nginx/

# EXPOSE 5052
# USER user
# RUN curl "http://iso.ava.do/my.ava.do.crt" --output /opt/nimbus/my.ava.do.crt --silent
# RUN curl "http://iso.ava.do/my.ava.do.key" --output /opt/nimbus/my.ava.do.key --silent

USER root
WORKDIR /
ENTRYPOINT ["supervisord", "--nodaemon", "--configuration", "/etc/supervisord.conf"]


