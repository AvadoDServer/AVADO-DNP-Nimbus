#!/bin/bash

SETTINGSFILE=$1

if [ ! -f "${SETTINGSFILE}" ]; then
  echo "Starting with default settings"
  cp /opt/nimbus/defaultsettings.json ${SETTINGSFILE}
fi

NETWORK=$(cat ${SETTINGSFILE} | jq '."network"' | tr -d '"')
mkdir -p "/data/data-${NETWORK}/" && chown user:user "/data/data-${NETWORK}/"

# Get JWT Token
JWT_SECRET="/data/data-${NETWORK}/jwttoken"
until $(curl --silent --fail "http://dappmanager.my.ava.do/jwttoken.txt" --output "${JWT_SECRET}"); do
  echo "Waiting for the JWT Token"
  sleep 5
done

KEYMANAGER_TOKEN="/data/data-${NETWORK}/keymanagertoken"
if [[ ! -e ${KEYMANAGER_TOKEN} ]]; then
  openssl rand -hex 32 >${KEYMANAGER_TOKEN}
fi

case ${NETWORK} in
"prater")
  P2P_PORT=9101
  ;;
"holesky")
  P2P_PORT=9102
  ;;
*)
  P2P_PORT=9100
  ;;
esac

# Create config file
GRAFFITI=$(cat ${SETTINGSFILE} | jq -r '."validators_graffiti"')
EE_ENDPOINT=$(cat ${SETTINGSFILE} | jq -r '."ee_endpoint"')
P2P_PEER_LOWER_BOUND=$(cat ${SETTINGSFILE} | jq -r '."p2p_peer_lower_bound"')
P2P_PEER_UPPER_BOUND=$(cat ${SETTINGSFILE} | jq -r '."p2p_peer_upper_bound"')
INITIAL_STATE=$(cat ${SETTINGSFILE} | jq -r '."initial_state"')
DATA_PATH="/data/data-${NETWORK}"

# Define the endpoints for Nethermind and Geth
NETHERMIND_ENDPOINT="http://avado-dnp-nethermind.my.ava.do:8545"
GETH_ENDPOINT="http://ethchain-geth.my.ava.do:8545"

# JSON-RPC payload for web3_clientVersion
PAYLOAD='{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}'

# Function to extract client version from a given endpoint
get_client_version() {
    local endpoint="$1"
    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        --data "${PAYLOAD}" \
        "${endpoint}")
  echo "Raw response: $RESPONSE"
   # Extract the client version string from the JSON-RPC response
    CLIENT_VERSION=$(echo "${RESPONSE}" | awk -F'"' '/result/ {print $4}')

    # Extract just the client name (the part before the slash, e.g., "Geth" or "Nethermind")
    CLIENT_NAME=$(echo "${CLIENT_VERSION}" | awk -F'/' '{print $1}')
    echo "${CLIENT_NAME}"
}


# Initial state / checkpoint sync
if [ ! -d "${DATA_PATH}/db" ]; then
  echo "[INFO - entrypoint] Running checkpoint sync"

  NETHERMIND_VERSION=$(get_client_version "${NETHERMIND_ENDPOINT}")
GETH_VERSION=$(get_client_version "${GETH_ENDPOINT}")

IS_NETHERMIND=false
IS_GETH=false

if echo "${NETHERMIND_VERSION}" | grep -qi "Nethermind"; then
    IS_NETHERMIND=true
fi

if echo "${GETH_VERSION}" | grep -qi "Geth"; then
    IS_GETH=true
fi

if [ "${IS_NETHERMIND}" = true ] && [ "${IS_GETH}" = false ]; then
    EE_ENDPOINT="http://avado-dnp-nethermind.my.ava.do:8551"
    echo "You are running Nethermind on ${NETHERMIND_ENDPOINT}"
    # Update settings file with detected endpoint
    jq --arg ee "$EE_ENDPOINT" '.ee_endpoint = $ee' "${SETTINGSFILE}" > "${SETTINGSFILE}.tmp" && mv "${SETTINGSFILE}.tmp" "${SETTINGSFILE}"
elif [ "${IS_NETHERMIND}" = false ] && [ "${IS_GETH}" = true ]; then
    EE_ENDPOINT="http://ethchain-geth.my.ava.do:8551"
    echo "You are running Geth on ${GETH_ENDPOINT}"
    # Update settings file with detected endpoint
    jq --arg ee "$EE_ENDPOINT" '.ee_endpoint = $ee' "${SETTINGSFILE}" > "${SETTINGSFILE}.tmp" && mv "${SETTINGSFILE}.tmp" "${SETTINGSFILE}"
else
    echo "Unable to determine which client you are running. Install an execution client."
fi

    /home/user/nimbus-eth2/build/nimbus_beacon_node trustedNodeSync \
        --network="${NETWORK}" \
        --trusted-node-url="${INITIAL_STATE}" \
        --backfill=false \
        --data-dir="${DATA_PATH}"
 echo "[INFO - entrypoint] Checkpoint sync completed"
fi

# Start Nimbus
VALIDATORS_PROPOSER_DEFAULT_FEE_RECIPIENT=$(cat ${SETTINGSFILE} | jq -r '."validators_proposer_default_fee_recipient" // empty')
MEV_BOOST_ENABLED=$(cat ${SETTINGSFILE} | jq -r '."mev_boost" // empty')
exec /home/user/nimbus-eth2/build/nimbus_beacon_node \
  --non-interactive \
  --jwt-secret="${JWT_SECRET}" \
  --web3-url="${EE_ENDPOINT}" \
  --keymanager \
  ${INITIAL_STATE_FILE:+--finalized-checkpoint-state="${INITIAL_STATE_FILE}"} \
  --keymanager-token-file="${KEYMANAGER_TOKEN}" \
  --keymanager-port=5052 \
  --keymanager-address=0.0.0.0 \
  --tcp-port=${P2P_PORT} \
  --udp-port=${P2P_PORT} \
  --rest \
  --rest-port=5052 \
  --rest-address=0.0.0.0 \
  --network=${NETWORK} \
  --data-dir="${DATA_PATH}" \
  --hard-max-peers="${P2P_PEER_UPPER_BOUND}" \
  --graffiti="${GRAFFITI}" \
  ${VALIDATORS_PROPOSER_DEFAULT_FEE_RECIPIENT:+--suggested-fee-recipient=${VALIDATORS_PROPOSER_DEFAULT_FEE_RECIPIENT}} \
  ${MEV_BOOST_ENABLED:+--payload-builder-url="http://mevboost.my.ava.do:18550"} \
  ${MEV_BOOST_ENABLED:+--payload-builder=${MEV_BOOST_ENABLED}} \
  ${EXTRA_OPTS}
