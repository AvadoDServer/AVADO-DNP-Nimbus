#!/bin/bash

NETWORK=$1

case ${NETWORK} in
  "gnosis"|"prater"|"mainnet")
    ;;
  *)
    echo "Invalid network"
    exit
    ;;
esac

# sed -i -- "s/const network = \".*\"/const network =  \"${NETWORK}\"/" build/wizard/src/server_config.ts 
yq -o=json eval --inplace '.network = "'${NETWORK}'"' build/wizard/src/server_config.json
yq -o=json eval --inplace '.network = "'${NETWORK}'"' build/monitor/server_config.json

for file in \
    build/docker-compose.yml \
    dappnode_package.json \
    build/monitor/settings/defaultsettings.json \
    build/avatar.png \
    build/wizard/src/assets/nimbus.png
do
    BASENAME=${file%.*}
    EXT=${file##*.}
    # echo $BASENAME
    # echo $EXT
    rm -f $file
    ln ${BASENAME}-${NETWORK}.${EXT} $file
done