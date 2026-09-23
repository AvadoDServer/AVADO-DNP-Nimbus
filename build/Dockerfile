ARG NIMBUS_VERSION

# Build the shared AVADO Client UI (https://github.com/AvadoDServer/AVADO-Client-UI)
FROM node:20-bookworm-slim AS ui
ARG CLIENT_UI_VERSION=v0.1.0
ARG CLIENT_UI_REPO=https://github.com/AvadoDServer/AVADO-Client-UI
RUN apt-get -y update && apt-get -y install --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${CLIENT_UI_VERSION} ${CLIENT_UI_REPO} /ui
WORKDIR /ui
RUN yarn install --frozen-lockfile && yarn build

FROM --platform=linux/amd64 statusim/nimbus-eth2:amd64-${NIMBUS_VERSION}
ARG NETWORK

USER root
RUN apt-get -y update && apt-get -y upgrade && apt-get -y install \
    curl \
    jq \
    procps \
    unzip \
    sudo \
    supervisor \
    vim-tiny \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir /data  && chown user /data
VOLUME /data

COPY --from=ui /ui/dist /usr/local/wizard

# The UI build ships no client-config.json; tell it which client and network it serves.
RUN test -n "${NETWORK}" \
    && if [ "${NETWORK}" = "mainnet" ]; then PREFIX=nimbus; else PREFIX="nimbus-${NETWORK}"; fi \
    && jq -n --arg network "${NETWORK}" --arg prefix "${PREFIX}" '{ \
        client: "nimbus", \
        network: $network, \
        packageName: ($prefix + ".avado.dnp.dappnode.eth"), \
        apiUrl: ("http://" + $prefix + ".my.ava.do:9999"), \
        backend: "deno", \
        features: { batchImport: true, backup: false, zeroSync: false } \
    }' > /usr/local/wizard/client-config.json \
    && cat /usr/local/wizard/client-config.json

# Install deno
RUN curl --fail --location --progress-bar --output /tmp/deno.zip "https://github.com/denoland/deno/releases/download/v1.40.2/deno-x86_64-unknown-linux-gnu.zip" \
  && unzip -d /usr/local/bin/ -o /tmp/deno.zip \
  && chmod +x /usr/local/bin/deno \
  && rm /tmp/deno.zip

COPY server /usr/local/server
# Retry the dependency download: one npm registry hiccup must not fail the build
RUN cd /usr/local/server || exit 1; \
  n=0; until deno cache server.ts; do n=$((n+1)); [ $n -ge 5 ] && exit 1; echo "deno cache failed, retry $n/4"; sleep $((n*10)); done; \
  deno check server.ts

COPY wizard-server /usr/local/wizard-server
# Retry the dependency download: one npm registry hiccup must not fail the build
RUN cd /usr/local/wizard-server || exit 1; \
  n=0; until deno cache wizard-server.ts; do n=$((n+1)); [ $n -ge 5 ] && exit 1; echo "deno cache failed, retry $n/4"; sleep $((n*10)); done; \
  deno check wizard-server.ts

COPY startNimbus.sh /opt/nimbus/
COPY server/settings/defaultsettings-${NETWORK}.json /opt/nimbus/defaultsettings.json
RUN chmod a+x /opt/nimbus/startNimbus.sh

COPY supervisord.conf /etc/supervisord.conf

USER root
WORKDIR /
ENTRYPOINT ["supervisord", "--nodaemon", "--configuration", "/etc/supervisord.conf"]


