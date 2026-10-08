#!/usr/bin/env bash
# Install Unity Catalog with Helm into the unitycatalog namespace.
#
# Run it from the folder that holds values.yaml and postgres.yaml, with
# kubectl pointed at your cluster.

# --8<-- [start:setup]
uc() { kubectl -n unitycatalog exec deploy/unitycatalog-server -c server -- bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:create-secret]
kubectl create namespace unitycatalog
kubectl -n unitycatalog create secret generic unitycatalog-db \
  --from-literal=password="$(openssl rand -hex 24)"
# --8<-- [end:create-secret]

# --8<-- [start:trial-postgres]
kubectl -n unitycatalog apply -f postgres.yaml
kubectl -n unitycatalog rollout status statefulset/postgres --timeout=180s
# --8<-- [end:trial-postgres]

# --8<-- [start:install]
helm install unitycatalog oci://ghcr.io/unitycatalog/charts/unitycatalog \
  --version 0.1.0 --namespace unitycatalog --values values.yaml --wait --timeout 5m
# --8<-- [end:install]

# --8<-- [start:check]
kubectl -n unitycatalog get pods
uc catalog list
# --8<-- [end:check]

# --8<-- [start:port-forward]
kubectl -n unitycatalog port-forward svc/unitycatalog-server 8080:8080 >/dev/null &
# --8<-- [end:port-forward]

# --8<-- [start:create-catalog]
uc catalog create --name analytics --comment "Kept across pods"
# --8<-- [end:create-catalog]

# --8<-- [start:restart]
kubectl -n unitycatalog rollout restart deployment/unitycatalog-server
kubectl -n unitycatalog rollout status deployment/unitycatalog-server --timeout=180s
uc catalog get --name analytics --output jsonPretty
# --8<-- [end:restart]

# --8<-- [start:upgrade]
helm upgrade unitycatalog oci://ghcr.io/unitycatalog/charts/unitycatalog \
  --version 0.1.0 --namespace unitycatalog --values values.yaml --wait --timeout 5m
# --8<-- [end:upgrade]

# --8<-- [start:uninstall]
helm uninstall unitycatalog --namespace unitycatalog
kubectl -n unitycatalog get secret unitycatalog-server-jwt-key
# --8<-- [end:uninstall]
