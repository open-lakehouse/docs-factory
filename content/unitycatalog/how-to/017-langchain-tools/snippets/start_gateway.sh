#!/usr/bin/env bash
# Start the MLflow AI Gateway with the endpoints in gateway.yaml.
set -euo pipefail

# --8<-- [start:start-gateway]
uv run --python 3.12 --with "mlflow[gateway]==3.17.0" \
  mlflow gateway start --config-path gateway.yaml --port 5050
# --8<-- [end:start-gateway]
