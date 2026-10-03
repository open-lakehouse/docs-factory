# aws-sim: pretend-AWS for local Unity Catalog stacks

Unity Catalog OSS has no S3 or STS endpoint override: it always calls
`https://sts.<region>.amazonaws.com` to vend credentials, and its clients then talk
to `https://<bucket>.s3.<region>.amazonaws.com`. This compose fragment answers those
names locally, so a UC server keeps the `server.properties` you'd write for real AWS.

```
unitycatalog ──https://sts.us-east-1.amazonaws.com──▶ envoy :443 ──▶ sts-shim ──▶ rustfs
in-network client ──https://uc-docs.s3.us-east-1.amazonaws.com──▶ envoy :443 ──▶ rustfs
host client ──http://localhost:9000 (AWS_ENDPOINT_URL)──▶ envoy :9000 ──▶ rustfs
```

| Service | Role |
| --- | --- |
| `aws-sim-certs` | One-shot: mints a local CA, a leaf cert for the AWS names, and a JVM truststore (`truststore.p12`) into the `aws-sim-certs` volume. |
| `rustfs` | S3 + STS ([RustFS](https://github.com/rustfs/rustfs)). `RUSTFS_SERVER_DOMAINS` enables virtual-hosted requests. |
| `rustfs-init` | One-shot: creates the `uc-docs` bucket. |
| `sts-shim` | Translates UC's AssumeRole session policy into one RustFS accepts, then re-signs it (see below). |
| `envoy` | Holds the AWS hostnames as network aliases, terminates TLS, and logs every request with its `Host`. |

## Using it

Include the fragment, then give the UC server the CA truststore:

```yaml
include:
  - ../../../../envs/aws-sim/compose.yaml

services:
  unitycatalog:
    image: unitycatalog/unitycatalog:v0.6.0
    environment:
      JAVA_TOOL_OPTIONS: -Djavax.net.ssl.trustStore=/certs/truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit
    volumes:
      - aws-sim-certs:/certs:ro
      # ...server.properties bind as usual
    depends_on:
      envoy: { condition: service_healthy }
      rustfs-init: { condition: service_completed_successfully }
```

```properties
s3.bucketPath.0=s3://uc-docs
s3.region.0=us-east-1
s3.awsRoleArn.0=arn:aws:iam::000000000000:role/uc-storage
s3.accessKey.0=aws-sim-root
s3.secretKey.0=aws-sim-root-secret
```

On real AWS, the same file works with your bucket, role, and keys.
[`example/`](example/) is a complete stack plus a smoke script (`just aws-sim-smoke`).

### Host-side clients

The host can't see Docker's DNS aliases, so tutorial scripts run with `uv run` reach
RustFS through Envoy's plain port instead. The snippet code stays endpoint-free; the
environment carries the difference:

```toml
# [tool.docs-factory]
# env = { AWS_ENDPOINT_URL = "http://localhost:9000", AWS_ALLOW_HTTP = "true" }
```

`content/conftest.py` sets these for the test run. obstore and object_store read
both variables and switch to path-style requests when an endpoint is set.

### Clients inside the compose network

These get the full illusion, but they must trust the CA:

| Runtime | Setting |
| --- | --- |
| JVM (UC server, Spark) | `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStore=/certs/truststore.p12 -Djavax.net.ssl.trustStorePassword=changeit` |
| botocore / AWS CLI | `AWS_CA_BUNDLE=/certs/ca.pem` |
| object_store / obstore / delta-rs | `SSL_CERT_FILE=/certs/ca.pem` |

## What RustFS can't do, and why the shim exists

UC's session policy uses mid-word action wildcards (`s3:GetO*`, `s3:PutO*`,
`s3:*Multipart*`). AWS accepts them; RustFS 1.0 rejects the whole AssumeRole
(`invalid action: 's3:GetO*'`). It only parses exact action names and `s3:*`, and it
also rejects `kms:*` condition keys, which newer UC versions emit. The STS body is
covered by the caller's SigV4 signature, so Envoy can't edit it in flight.
`sts-shim/sts_shim.py` takes the request, expands the wildcards against the actions
RustFS knows, and drops the KMS statements. Those can only narrow access, and RustFS
has no KMS. It then signs a fresh AssumeRole with the root keys. RustFS enforces the
resulting policy: vended credentials are confined to the volume's prefix, and
read-only credentials can't write.

The shim doesn't verify the caller's signature. It's reachable only on the compose
network.

## Debugging

`just aws-sim-logs` follows Envoy's access log, one line per request:

```
sts.us-east-1.amazonaws.com POST / -> sts_shim 200
localhost:9000 PUT /uc-docs/support/policies/returns.md -> rustfs 200
localhost:9000 PUT /uc-docs/support/other.md -> rustfs 403
```

A request that never shows up here went somewhere else. It may even have gone to
real AWS, so check for a missing alias.

## Adding a bucket

1. Create it in `rustfs-init`.
2. Add `<bucket>.s3.amazonaws.com` and `<bucket>.s3.us-east-1.amazonaws.com` to
   Envoy's aliases. Docker DNS has no wildcards.
