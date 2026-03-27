#!/usr/bin/env bash
# garage-init.sh — Bootstrap a single-node Garage cluster for local development.
# Run this after `docker compose up -d garage`.

set -euo pipefail

GARAGE_HEALTH="http://localhost:3900/health"
MAX_WAIT=30
ELAPSED=0

echo "Waiting for Garage to become healthy..."
until curl -sf "$GARAGE_HEALTH" > /dev/null; do
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Garage did not become healthy within ${MAX_WAIT}s" >&2
    exit 1
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done
echo "Garage is healthy (${ELAPSED}s elapsed)"

# Retrieve the local node ID
NODE_ID=$(docker compose exec garage garage node id -q 2>/dev/null | awk '{print $1}')
echo "Node ID: $NODE_ID"

# Assign the node to a single-node layout (zone dc1, capacity 1 GB)
docker compose exec garage garage layout assign -z dc1 -c 1 "$NODE_ID"

# Apply the layout at version 1
docker compose exec garage garage layout apply --version 1

# Create an access key
KEY_OUTPUT=$(docker compose exec garage garage key create test-key)
echo "$KEY_OUTPUT"

ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID" | awk '{print $NF}')
SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key" | awk '{print $NF}')

# Create the test bucket
docker compose exec garage garage bucket create test-delta

# Grant the key read/write access to the bucket
docker compose exec garage garage bucket allow test-delta --read --write --key test-key

echo ""
echo "=============================="
echo "Garage initialised successfully"
echo "=============================="
echo "Access Key ID:     $ACCESS_KEY"
echo "Secret Access Key: $SECRET_KEY"
echo ""
echo "Export these environment variables before running examples:"
echo ""
echo "  export AWS_ACCESS_KEY_ID=$ACCESS_KEY"
echo "  export AWS_SECRET_ACCESS_KEY=$SECRET_KEY"
echo "  export AWS_ENDPOINT_URL=http://localhost:3900"
echo "  export AWS_REGION=us-east-1"
