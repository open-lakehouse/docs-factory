#!/usr/bin/env bash
# Run the Unity Catalog server from its Maven artifact with JBang, keep its
# metadata in an H2 file, and query it. Each region is one step of the page.

# --8<-- [start:start]
mkdir -p uc-server && cd uc-server
jbang io.unitycatalog:unitycatalog-server:0.7.0 --port 8080
# --8<-- [end:start]

# --8<-- [start:check]
curl -s http://localhost:8080/api/2.1/unity-catalog/catalogs
# --8<-- [end:check]

# --8<-- [start:create]
curl -s -X POST http://localhost:8080/api/2.1/unity-catalog/catalogs \
  -H 'Content-Type: application/json' -d '{"name": "retail"}'
# --8<-- [end:create]

# --8<-- [start:persist]
cd uc-server
cat > etc/conf/hibernate.properties <<'EOF'
hibernate.connection.driver_class=org.h2.Driver
hibernate.connection.url=jdbc:h2:file:./etc/db/h2db;DB_CLOSE_DELAY=-1
hibernate.hbm2ddl.auto=update
EOF
# --8<-- [end:persist]
