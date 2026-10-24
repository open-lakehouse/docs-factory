# envs: the environments the docs run against

Trestle generates each folder from its `env.toml` (`just env-render <name>`;
[`trestle.toml`](trestle.toml) pins the revision). Never edit the rendered
files (`compose.yaml`, `modules/`, `client/`, `deploy/`, `LAYOUT.md`,
`README.md`, `plan.json`); change the recipe and re-render. Each folder's
`README.md` is Trestle's deployment guide for readers and ships in its archive.

| Folder | What runs | Used by |
| --- | --- | --- |
| [`unitycatalog`](unitycatalog/env.toml) | UC on `:8080` with no gateway, authorization off, metadata in the server's own H2 file (with the image's sample catalogs) | every page under `content/unitycatalog/` except the S3 and PostgreSQL ones |
| [`uc-aws`](uc-aws/env.toml) | UC behind an Envoy gateway on `:8080` that answers on the AWS hostnames, RustFS as S3 on `:9000`, metadata in PostgreSQL | the S3 and PostgreSQL pages |
| [`uc-mlflow`](uc-mlflow/env.toml) | UC and an MLflow tracking server behind an Envoy gateway on `:8080`, RustFS as S3 on `:9000`, metadata in PostgreSQL; MLflow's model registry is UC, in a `unity` catalog with managed storage | the MLflow model pages (T07) |
| [`uc-local`](uc-local/env.toml) | UC, PostgreSQL, and RustFS on one machine with no gateway: UC on `:8080`, S3 on `:9000` | the deployment patterns page |
| [`uc-hybrid`](uc-hybrid/env.toml) | UC on `:8080` with no gateway, metadata in a Neon project, data in an S3-compatible bucket | the deployment patterns page; rendered and diagrammed, never run |

`uc-hybrid` needs accounts, so `just env-render` renders it against the stand-in
connection in [`uc-hybrid/placeholders.sh`](uc-hybrid/placeholders.sh), and its
bundle ships `env.toml` and leaves out the files Trestle marks sensitive: a
reader follows its `README.md`, then re-renders with their own secrets.

Readers download the first two as described in
[Run a local Unity Catalog server](../content/unitycatalog/how-to/011-run-local-server/index.md).
Those two mount `UC_DOCS_ROOT` (default `/tmp/uc-docs`) at the same path in the
container, and both use the compose project `uc-docs` and the container name
`unitycatalog`, so `docker exec unitycatalog bin/uc …` works from any folder and
the two replace each other instead of running side by side.

## The docs image

The server runs from [`unitycatalog/image/`](unitycatalog/image/Dockerfile), the
upstream image with two fixes for Linux:

- **gcompat.** The image is Alpine, and on x86-64 the CLI's bundled snappy
  library needs glibc, so `uc table read` and `uc table write` fail without it.
- **The folder owner's uid.** A Linux bind mount keeps host ownership, and the
  upstream server runs as uid 100. It then can't write into folders the reader
  created under `UC_DOCS_ROOT`, or delete the files their engines wrote there
  when a managed table is dropped. `run-as-owner` gives the image's user the uid
  that owns the mounted `server.properties` (the reader who unpacked the
  folder), and `bin/uc` drops `docker exec`'s root to it. Docker Desktop and
  Colima show the mount as root's, so the uid stays 100 there.

Both are worth raising upstream (add `gcompat`, and support running as an
arbitrary uid); the folder can go back to the upstream image once a release
has them. `uc-aws` and `uc-mlflow` build the same image from their own copies, `uc-aws/image/` and `uc-mlflow/image/`.

## The bundle

The docs site serves each folder as its own archive, `/env/<folder>.tar.gz`,
which extracts to `uc-docs-env/<folder>/`, so pages name the same path however
many a reader downloads. An archive holds only the runtime files the
environment's manifest lists (`files` in
[`environments.generated.json`](environments.generated.json)), and
[`environments.yml`](environments.yml) gives each one its title for readers.

## Tests

Snippet scripts name a `compose.yaml` here in `[tool.docs-factory] compose`.
`content/conftest.py` starts a fresh stack per script and stops it afterwards,
so scripts don't see each other's catalogs. On Colima, run the service lane
with `UC_DOCS_ROOT=$HOME/tmp/uc-docs`, because Colima shares only `$HOME` with
containers.
