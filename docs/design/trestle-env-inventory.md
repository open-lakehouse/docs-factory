# UC docs environments: inventory for the Trestle cutover

**Status:** inventory, 2026-10-16 (P0 of the
[convergence plan](trestle-model-convergence-plan.md)). Counts and line numbers
drift; recount at the start of P3, P5, and each P6 variant.

What the hand-written Unity Catalog environments do today, so P3 knows which
Trestle knobs are needed and P5/P6 know what a generated environment must match.
Paths are relative to the repo root.

## Summary

| Variant | Scripts | Gate CI | Metadata | Storage | Host ports | Client env |
|---|---|---|---|---|---|---|
| `envs/unitycatalog/compose.yaml` | 20 | all 20 | H2, in the container | `file://` under `UC_DOCS_ROOT` | 8080 | — |
| `envs/unitycatalog/compose.aws.yaml` | 11 | all 11 | H2, in the container | S3 via aws-sim (bucket `uc-docs`) | 8080, 9000 | `AWS_ENDPOINT_URL`, `AWS_ALLOW_HTTP` |
| `envs/unitycatalog/compose.postgres.yaml` | 1 | 1 | Postgres 16 (named volume) | `file://` under `UC_DOCS_ROOT` | 8080 | — |
| `envs/aws-sim/` | — (included by `compose.aws.yaml`) | — | — | RustFS | 9000 (Envoy) | — |

Every script sits on a `ready` page, and all of them run in the `default` lane.
None uses `lane = "spark"`, `"jvm"`, or `"rust"`. The kind-lane deployment pages
(H22, H24) aren't on main, so there's no kind lane to inventory yet. The two UC
pages with `status: idea` (`how-to/101-envoy-authentication`,
`tutorials/100-marimo-remote-storage`) have no scripts.

## How scripts reach an environment

- A script names its compose file in `[tool.docs-factory] compose`, relative to
  the script. The `services` key derives the `needs_uc_server` marker
  (`content/conftest.py`), which is excluded by default (`pyproject.toml`
  `addopts`).
- CI runs these scripts in the `scripts-services` job
  (`.github/workflows/ci.yml:259`):
  `pytest content -m "needs_docker or needs_uc_server"` with the `test-services`
  group. Scripts on ready pages gate the job; drafts are non-strict xfail.
- `content/conftest.py:386-432`: each script starts a **fresh stack**
  (testcontainers `DockerCompose(..., wait=True)`, images pulled once per
  session) and tears it down with `stop()`, which runs `docker compose down
  --volumes`. The base URL is hard-coded:
  `get_service_host_and_port("unitycatalog", 8080)` →
  `http://{host}:{port}/api/2.1/unity-catalog` (line 409), handed to the
  script through `base-url-env`. The failure report tails the `unitycatalog`
  service log.
- `client-env` from `envs/environments.yml` is exported to the script, so the
  variables the reader exports are the ones the test uses.

## `compose.yaml` — default (H2)

**Scripts (20):** `tutorials/001-getting-started/first_catalog_cli.py`,
`002-python-client/catalog_flow.py`, `005-first-python-function/first_function.py`,
`006-read-volume-files/volume_files.py`, `007-managed-delta-table/managed_table.py`,
`008-first-metric-view/metric_view.py`; `how-to/001-table-storage-formats/{file_formats,file_formats_cli}.py`,
`003-seed-tpch-data/seed_tpch.py` (page-mode, not under `snippets/`),
`004-manage-catalogs-and-schemas/{catalogs,catalogs_cli}.py`,
`005-register-external-table/{external_table,external_table_cli,read_engines}.py`,
`006-manage-volumes/{volumes,volumes_cli}.py`, `007-configure-spark/spark_session.py`,
`008-duckdb/duckdb_tables.py`, `013-metric-views/{metric_views,register_metric_view}.py`
(under `content/unitycatalog/`, in `snippets/` unless noted).

**Services:**
- `init-storage`: `unitycatalog/unitycatalog:v0.7.0` as root, runs
  `chmod 0777 $UC_DOCS_ROOT` once, because Docker creates a missing bind source
  as root.
- `unitycatalog`: `build: image` with `pull_policy: build`, so it rebuilds
  from cache on every `up`. `container_name: unitycatalog`, `init: true` (the
  server ignores SIGTERM as PID 1), port `8080:8080`. Healthcheck:
  `wget …/api/2.1/unity-catalog/catalogs` (5s × 30, 20s start period).
- Compose project `name: uc-docs`, shared by all three variants, so only one
  runs at a time.

**Mounts:** `UC_DOCS_ROOT` (default `/tmp/uc-docs`) bound at the **same path**
inside and outside the container, so a `file://` location means the same
directory to server and client. `./server.properties` is mounted read-only at
`/home/unitycatalog/etc/conf/server.properties` (`server.env=dev`,
`server.authorization=disable`).

**State:** H2 inside the container, gone on `down`. Table and volume files
persist under `UC_DOCS_ROOT` on the host.

## `compose.aws.yaml` — S3 and STS via aws-sim

**Scripts (11):** `how-to/009-configure-aws-storage/{aws_storage,aws_storage_cli}.py`,
`009-python-dataframes/{daft,pandas,polars}_tables.py`,
`010-managed-storage-s3/{managed_storage,managed_storage_cli}.py`,
`012-iceberg-rest/{duckdb_iceberg,pyiceberg_tables,spark_iceberg,spark_cross_format}.py`.

**Composition:** `include: ../aws-sim/compose.yaml`. `init-storage` and
`unitycatalog` `extends` the base, which adds:
- `JAVA_TOOL_OPTIONS` pointing the JVM truststore at `/certs/truststore.p12`
  (the aws-sim CA);
- `./server.aws.properties` in place of `server.properties`
  (`aws.masterRoleArn`, `aws.accessKey`/`secretKey` = the RustFS root keys,
  `aws.region=us-east-1`; no endpoint overrides, because the server resolves
  the real AWS hostnames to Envoy);
- the `aws-sim-certs` volume at `/certs:ro`;
- `depends_on` `envoy` (healthy) and `rustfs-init` (completed).

**Client env** (`envs/environments.yml`): `AWS_ENDPOINT_URL=http://localhost:9000`,
`AWS_ALLOW_HTTP=true`. Ports `[8080, 9000]`, and `guide` points at
`how-to/run-local-server#start-the-server-with-simulated-s3`.

## `compose.postgres.yaml` — Postgres metadata

**Scripts (1):** `how-to/002-configure-backend-db/snippets/backend_db_cli.py`.

**Services:** `postgres:16-alpine` (`ucdb` / `uc` / `uc-local-only`, named
volume `uc-postgres`, `pg_isready` healthcheck at 2s × 30). `unitycatalog`
`extends` the base and adds `./hibernate.postgres.properties` →
`etc/conf/hibernate.properties` (JDBC `postgres:5432/ucdb`,
`hbm2ddl.auto=update`), with `depends_on` postgres healthy. The 0.7.0 image
bundles the Postgres driver.

**State:** metadata survives a recreated server container but not `down
--volumes`, which is what the harness runs.

## `envs/aws-sim/` — fake AWS S3 and STS

- `aws-sim-certs` (one-shot, `eclipse-temurin:17-jdk-noble`, pinned to noble
  because the 26.04 rebuild segfaults on 6.8 VM kernels): `certs.sh` writes a
  local CA, a leaf for the S3/STS hostnames, and `truststore.p12` into the
  `aws-sim-certs` volume. It's idempotent.
- `rustfs` (`rustfs/rustfs:1.0.1`): root keys `aws-sim-root` /
  `aws-sim-root-secret`, `RUSTFS_VOLUMES=/data`, `:9000`.
  `RUSTFS_SERVER_DOMAINS=s3.us-east-1.amazonaws.com,s3.amazonaws.com,localhost:9000`
  parses virtual-hosted requests, including `<bucket>.localhost:9000` from
  host-side JVMs. No host port.
- `rustfs-init` (`amazon/aws-cli:latest`): `s3 mb s3://uc-docs`.
- `sts-shim` (`python:3.13-alpine`, `init: true`, `sts-shim/sts_shim.py`):
  expands UC's wildcard session-policy actions into the exact actions RustFS
  accepts, drops `kms:*`, and re-signs with the root keys. Internal :8080.
- `envoy` (`envoyproxy/envoy:v1.38-latest`, `envoy.yaml`): host `9000:9000`
  plain HTTP to RustFS; network :443 TLS (leaf cert) routes STS hosts to
  `sts-shim` and everything else to `rustfs`. It adds `x-amz-bucket-region`.
  The admin `/ready` on :9901 is its healthcheck. Network aliases (Docker DNS
  has no wildcards): `sts.amazonaws.com`, `sts.us-east-1.amazonaws.com`,
  `s3.amazonaws.com`, `s3.us-east-1.amazonaws.com`, `uc-docs.s3.amazonaws.com`,
  `uc-docs.s3.us-east-1.amazonaws.com`.
- `example/` is aws-sim's own demo stack (`just aws-sim-{up,smoke,logs,down}`),
  excluded from the reader bundle.

## The local image (`envs/unitycatalog/image/`)

`FROM unitycatalog/unitycatalog:v0.7.0`, then:

| File | What it fixes |
|---|---|
| `Dockerfile` | `apk add gcompat su-exec`: on x86-64 the CLI's bundled snappy needs glibc, and the image is Alpine. `chmod -R g+w etc`, because the server may run under another uid and still writes its DB, logs, and sample data there. It renames `bin/uc` to `bin/uc-cli`. |
| `run-as-owner` (entrypoint) | Reads the uid that owns the mounted `server.properties` and, if it isn't root, rewrites the `unitycatalog` user's uid in `/etc/passwd`, then `su-exec`s the server. On Linux, bind mounts keep host ownership, so server and reader can delete each other's files under `UC_DOCS_ROOT`. Docker Desktop and Colima show root, so nothing changes there. |
| `uc` (wrapper at `bin/uc`) | `docker exec` runs as root, so it drops to the server's user before calling `uc-cli`. |

## Consumers

| Consumer | What it depends on |
|---|---|
| `envs/environments.yml` | One entry per compose path: `title`, `ports`, `client-env`, `guide`. |
| `tools/docsnip/src/docsnip/environments.py` | Validates the registry, that each script's compose is registered, and the `:::prerequisites` / `:::environment` blocks. |
| `site/src/content-core/{registry,environment}.mjs` | Registry load and the reader start/stop/export commands. |
| `emit/docs/env-bundle.mjs` | `git ls-files envs/<dir>/` per bundled dir, excluding `README.md` and `example/`. It keeps the `envs/` layout so `include: ../aws-sim/…` resolves. |
| `content/unitycatalog/how-to/011-run-local-server/index.md` | Inlines all three compose files with `file=` fences and uses `:::environment{key=…}` for each. |
| `docker exec unitycatalog bin/uc` (8 shell snippets) | `tutorials/001-getting-started/first_catalog.sh`; `how-to/001…/file_formats.sh`, `002…/backend_db.sh`, `004…/catalogs.sh`, `005…/external_table.sh`, `006…/volumes.sh`, `009-configure-aws-storage/aws_storage.sh`, `010…/managed_storage.sh`. Also `envs/unitycatalog/{README.md,compose.yaml}` and `sites/unitycatalog-docs/src/brand/HomePage.tsx`. |
| `content/conftest.py:409` | Service name `unitycatalog`, container port 8080, path `/api/2.1/unity-catalog`. |
| `tools/docsnip/src/docsnip/versions.py` (`just bump-uc`) | Rewrites `unitycatalog/unitycatalog:v<X>` across `envs/**` (`*.yaml`, `*.yml`, `*.md`, `*.py`, `Dockerfile`) and the titles in `envs/environments.yml`. |
| `.github/workflows/uc-docs-sync.yml` | Path-triggers on `envs/**`. |

**Pins:** UC `0.7.0` comes from `content/unitycatalog/release.yml` and is
repeated as image tags (`compose.yaml` `init-storage`, `image/Dockerfile`
`FROM`). The other images are pinned in place: `postgres:16-alpine`,
`rustfs/rustfs:1.0.1`, `eclipse-temurin:17-jdk-noble`, `python:3.13-alpine`.
`amazon/aws-cli:latest` and `envoyproxy/envoy:v1.38-latest` float.

## `envs/uc-aws/` — the generated stand-in (P5)

Rendered by Trestle from `envs/uc-aws/env.toml`; it stands in for
`compose.aws.yaml` (`stands-in-for` in `envs/environments.yml`) and isn't in
the reader bundle yet. Metadata lives in Postgres, not H2: at H1b
`embedded_metadata` also drops the object-store demand, so H2 plus S3 can't be
expressed, and the scripts don't depend on the metadata store. UC is reached
through the gateway (`envoy` publishes `8080:10000` and `9000:9000`); the UC
container only `expose`s 8080, so the harness takes the base URL from
`plan.json`'s host client env.

Parity with `aws-sim` and `compose.aws.yaml`, after H1c (trestle#144) and H1d (trestle#145):

| aws-sim / compose.aws.yaml | Rendered | Status |
|---|---|---|
| Envoy `v1.38-latest` | was `v1.34-latest` | fixed in H1c (default bumped) |
| `sts-shim` `init: true` | was missing | fixed in H1c |
| No host :9901 | Envoy admin published on the host | fixed in H1c (`publish_admin = "false"`) |
| One bucket, `uc-docs` | an extra `unity` bucket, aliases, cert names | fixed in H1c (UC `bucket` knob) |
| `x-amz-bucket-region: us-east-1` on S3 responses | missing; every Iceberg REST write failed with "Could not resolve the AWS region for S3 bucket" | fixed in H1c (impersonated-host `response_headers`) |
| Root keys `aws-sim-root` | `rustfs-root` (constants) | fixed in docs: the DataFrame seed helper writes with the root keys, so aws-sim now uses `rustfs-root` too |
| `rustfs-init` restarts never; inline env | `restart: on-failure`; `env_file` | equivalent |
| H2 metadata | Postgres | accepted (design §10 #45) |
| `init-storage` chmods `UC_DOCS_ROOT` | nothing; on Linux Docker creates it root-owned and Daft can't write `file://` tables | fixed in H1d (UC `writable_mounts`, a `unitycatalog-mounts` one-shot) |
| Client env `AWS_ENDPOINT_URL`, `AWS_ALLOW_HTTP` | also `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `UNITY_CATALOG_URL` | reader-visible at the P6 cutover |
| Envoy healthcheck on admin `/ready` | none; services gate on their own healthchecks | equivalent for `up --wait` |

Runs against it: locally (macOS, Colima) the four Iceberg REST scripts and the
two `bin/uc` CLI scripts pass; the SDK and DataFrame scripts can't resolve
`unitycatalog-client==0.7.0` through the internal proxy there. The first
`envs-pilot` run on Linux passed 8 of 11 and found the last two gaps above
(root keys, `UC_DOCS_ROOT` ownership).

## Gaps → phases

Every P3 row shipped in H1b (P3b, trestle#143); the knob table is in the
[plan](trestle-model-convergence-plan.md#p3b--uc-knobs-inline-secrets-endpoint-aliases-known-aws-sim-gaps).

| Today | Needed from Trestle (P3) | Lands in |
|---|---|---|
| Local image build (`build: image`) | `unity-catalog` `build` knob (context relative to the render root) — done | P5 (aws), P6 |
| `container_name: unitycatalog` (8 shell snippets, harness logs) | `container_name` knob — done | P5 |
| `UC_DOCS_ROOT` same-path bind; `server*.properties` / `hibernate.properties` mounts | `extra_mounts` knob; `local_secrets = "inline"` for the properties files — done | P5 |
| Default variant has no relational store or object store | `embedded_metadata` knob (drops both demands) — done | P6 (last variant) |
| UC on host :8080, S3 on host :9000 | `gateway_host_port = 8080`, `dedicated_listener_ports = [9000]` (done), UC at `/api/2.1/unity-catalog` with `Rewrite::Inherit` | P5 |
| `AWS_ENDPOINT_URL`, `AWS_ALLOW_HTTP` client env | `rustfs` `generic_endpoint_env = true` — done | P5 |
| UC 0.7.0 pin (Trestle defaults to 0.6.0) | Recipe takes the release pin; `bump-uc` rewrites `env.toml` and the `FROM` | P5, P6 step 4 |
| aws-sim: RustFS root keys, `RUSTFS_SERVER_DOMAINS` incl. `localhost:9000`, TLS leaf + truststore, Envoy aliases, sts-shim | `localhost:<port>` server domain and UC `aws.*` keys done; diff the rest against Trestle's `rustfs` template | P5 step 7 |
| Harness hard-codes `("unitycatalog", 8080)` | Host contract from `plan.json` — done for generated environments (P5) | P5, P6 step 2 |
| Bundle = `git ls-files envs/<dir>/` | Explicit runtime-file manifest + archive smoke test | P6 step 3 |
| `011-run-local-server` inlines the hand-written compose files | Repoint the fences at the generated render | P6 |
| One compose project name (`uc-docs`) across variants | Keep a shared project name, or document the change | P5/P6 |
| `server.aws.properties` with no storage bindings; pages register `lake_storage` / `lake` | `storage_bootstrap = "none"`, `master_role_arn` (`uc-master`) — done | P5 |
| `rustfs-init` makes `uc-docs` | UC `bucket = "uc-docs"` (H1c), not an extra resource — done | P5 |

Variant order for P6 stays aws (11) → postgres (1) → default (20).
