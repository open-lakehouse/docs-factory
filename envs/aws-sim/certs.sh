#!/usr/bin/env bash
# Mint a throwaway CA and an Envoy leaf cert for the AWS hostnames we impersonate,
# plus a JVM truststore (JDK defaults + our CA). Idempotent: the named volume
# keeps the CA across restarts, so clients that already trust it keep working.
set -euo pipefail
cd /certs

if [[ -f ca.pem && -f leaf.pem && -f truststore.p12 ]]; then
  echo "certs already present"
  exit 0
fi

# A single-label wildcard only covers one DNS level, so the virtual-hosted
# bucket names (<bucket>.s3.<region>.amazonaws.com) need their own entry.
cat > leaf.ext <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:sts.amazonaws.com,DNS:sts.us-east-1.amazonaws.com,DNS:s3.amazonaws.com,DNS:*.s3.amazonaws.com,DNS:s3.us-east-1.amazonaws.com,DNS:*.s3.us-east-1.amazonaws.com
EOF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -subj "/CN=aws-sim local CA" -keyout ca-key.pem -out ca.pem
openssl req -newkey rsa:2048 -nodes \
  -subj "/CN=*.s3.us-east-1.amazonaws.com" -keyout leaf-key.pem -out leaf.csr
openssl x509 -req -in leaf.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial \
  -days 825 -extfile leaf.ext -out leaf.pem

cp "$JAVA_HOME/lib/security/cacerts" truststore.p12
keytool -importcert -noprompt -alias aws-sim-ca -file ca.pem \
  -keystore truststore.p12 -storepass changeit

# Envoy (uid 101) and the UC server (uid 100) read these from the shared volume.
chmod 0644 ./*.pem truststore.p12
rm -f leaf.csr leaf.ext ca.srl
