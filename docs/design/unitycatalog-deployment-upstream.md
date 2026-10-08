# Unity Catalog deployment: changes proposed upstream

The deployment how-tos (H22 Docker Compose, H24 Helm; H23 Java distribution
is deferred) are drafted against 0.7.0 on release.yml's `next` channel
([docs-versioning](docs-versioning.md#drafting-against-the-next-release)).
Writing and testing them against `branch-0.7` (`894d1aeb`) turned up what the
`unitycatalog/unitycatalog` repo needs, so that the pages' commands work with
published artifacts and don't need workarounds. Items are grouped by cadence:
the release-bound ones have to be on `branch-0.7` before the `v0.7.0` tag, and
the chart can follow on its own schedule.

Status: proposal. Track each item's upstream PR here.

## Release-bound (before `v0.7.0`)

| # | Change | Why the docs need it | Upstream |
| --- | --- | --- | --- |
| U1 | **Publish versioned server images from CI.** Push multi-arch `unitycatalog/unitycatalog:v0.7.0` (Docker Hub and GHCR) when the release is tagged, with `latest` moving only on a release. | Both pages pin `v0.7.0`. `v0.6.0` was pushed by hand, and `disabled_docker-build.yml` is off. The image built from `branch-0.7` is 6.1 GB; the open Dockerfile rework shrinks it. | #1582, #1583 or #1640; #1584 optional |
| U2 | **Ship the distribution tarball and its checksum as release assets.** | The only way to run a release without a checkout (H23, deferred). Releases have no assets today, Maven Central's `unitycatalog-server` stops at 0.3.0, and `createTarball` writes build-machine-absolute classpaths. Also decide whether to republish `unitycatalog-server` to Maven Central or deprecate it there. | #1580, #1581 |
| U3 | **Configure containers without a command override or a secret in a file.** Accept the observability port as a property or environment variable (for example `server.observability.port` / `UC_OBS_PORT`). Accept database credentials from the environment. | H22 overrides `command` only to pass `--obs-port`, and has to render `hibernate.properties` with the password inside, because the server reads credentials only from that file. The Helm chart works around the same gap with an `envsubst` init container. | — |
| U4 | **Fix the repo's `compose.yaml`.** It mounts config and data at `/opt/unitycatalog/etc/…`, but the image runs from `/home/unitycatalog`, so both mounts are silently ignored and the "persisted" volume persists nothing. Also pin the image tag instead of `latest`, add a `/readyz` health check, and drop the UI build or use a published UI image. Consider adopting H22's file as the canonical one. | The upstream `docs/docker_compose.md` sends readers to this file. | — |
| U5 | **Correct the `uc_properties.property_value` upgrade note** in `docs/server/deployment.md`. It says existing databases keep `varchar(255)` until you run an `ALTER`. On PostgreSQL 16, a 0.6.0 database upgraded to `branch-0.7` came up with `property_value text`, without the `ALTER`. MySQL and H2 need the same check. | H22's upgrade section would otherwise tell readers to run an `ALTER` they don't need. | follow-up to #1824 |
| U6 | **Publish `unitycatalog/unitycatalog-ui:v0.7.0` with the release, or declare that the UI isn't a release artifact.** The newest UI image is `main` from May 2025. | Both pages leave the UI out. The chart deploys it by default with that stale image. | — |
| U7 | **Release notes for 0.7.0.** There's no changelog. Upgraders need: `--obs-port` with `/livez`, `/readyz`, `/metrics`; policy refresh for multi-instance; the shared HikariCP pool and its `hibernate.hikari.*` keys; Iceberg tables on by default; the storage-cleanup worker. | The pages link upgraders to them. | — |
| U8 | **Check whether managed Delta tables work on PostgreSQL** (`uc_delta_commits`), and backport the fix if they don't. | H22 and H25 recommend PostgreSQL. If it doesn't work, R01 needs a known issue. | #1592 (draft) |

## Helm chart (own cadence)

| # | Change | Why | Upstream |
| --- | --- | --- | --- |
| C1 | **Version and publish the chart.** Chart `0.1.0` with `appVersion: "v0.7.0"`, pushed to `oci://ghcr.io/unitycatalog/charts/unitycatalog` by a workflow on `helm-v*` tags. The `v` is required: the image tag defaults to `appVersion`, and image tags carry it. | H24 installs from that reference. Today the chart is `0.0.1-pre.1` with `appVersion: main` and isn't published. Until it is, the docs harness packages the chart from `branch-0.7` itself. | — |
| C2 | **Fix custom probes.** The probe blocks render `toYaml .` (the root context) instead of the probe value. Setting any `livenessProbe`, `readinessProbe`, or `startupProbe` fails the install with `.readinessProbe.Capabilities: field not declared in schema`. Use `with`. | H24 can only enable the chart's tcpSocket probes. | — |
| C3 | **Wire observability.** Pass `--obs-port` (a value, default on), expose an `obs` container port, default liveness to `/livez` and readiness to `/readyz`, and add optional values for a `/metrics` Service or ServiceMonitor. Keep the port off the Ingress and HTTPRoute. | A tcpSocket probe passes while the database is unreachable. `/readyz` doesn't. H24 switches to it once this lands. | depends on C2 |
| C4 | **Make multi-instance settings first-class.** Add a value for `server.authorization.policy-refresh` that's on whenever `replicaCount > 1`. Fail the render for `replicaCount > 1` with `db.type: file`. Expose trusted-header authentication. | H24 sets policy refresh through `extraProperties`. The chart only comments on the database requirement. | — |
| C5 | **Make startup self-contained.** The init container is `alpine:latest` and runs `apk add envsubst openssl curl` on every pod start, so pods can't start without internet egress. Pin it, and use an image with the tools baked in (or the server image). Align `fsGroup`/UID with the image user, which differs between the current image (100:101) and the reworked ones (#1582/#1584). Set `ui.enabled: false` by default until U6 lands. | Air-gapped and egress-restricted clusters are common for a catalog. | — |
| C6 | **Test the chart in CI.** `ct lint` and `ct install` on kind for the default values and a PostgreSQL profile. | C2 would have failed `ct install` with probes set. | — |
| C7 | **Docs.** Regenerate `helm/README.md`, and add `docs/server/kubernetes.md` or link to the H24 page. | — | — |

## How the drafts track this

- When U1 and C1 land, the harness's stand-ins retire on their own:
  `docsnip.prerelease` pulls the image and the chart before it builds them.
- On the `v0.7.0` tag, run `just bump-uc 0.7.0`. It folds the `next` block,
  and the pages can be approved and set `ready`.
- When C2 and C3 land, H24 moves its probes to `/livez` and `/readyz` with a
  chart `--version` bump. When U3 lands, H22 drops its `command` override.
