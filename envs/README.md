# envs: the environments the docs run against

Trestle generates each folder from its `env.toml` (`just env-render <name>`;
[`trestle.toml`](trestle.toml) pins the revision). Never edit the rendered
files (`compose.yaml`, `modules/`, `client/`, `deploy/`, `LAYOUT.md`,
`README.md`, `plan.json`); change the recipe and re-render. Each folder's
`README.md` is Trestle's deployment guide for readers and ships in the bundle.

| Folder | What runs | Used by |
| --- | --- | --- |
| [`unitycatalog`](unitycatalog/env.toml) | UC behind an Envoy gateway on `:8080`, authorization off, metadata in the server's own H2 file (with the image's sample catalogs) | every page under `content/unitycatalog/` except the S3 and PostgreSQL ones |
| [`uc-aws`](uc-aws/env.toml) | the same gateway, RustFS as S3 on `:9000`, metadata in PostgreSQL | the S3 and PostgreSQL pages |

Readers download both as described in
[Run a local Unity Catalog server](../content/unitycatalog/how-to/011-run-local-server/index.md).
Both mount `UC_DOCS_ROOT` (default `/tmp/uc-docs`) at the same path in the
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
has them. `uc-aws` builds the same image from its own copy, `uc-aws/image/`.

## The bundle

The docs site serves the folders as one archive, `/env/uc-docs-env.tar.gz`,
with each folder under `uc-docs-env/`. The archive holds only the runtime files
each environment's manifest lists (`files` in
[`environments.generated.json`](environments.generated.json)), and
[`environments.yml`](environments.yml) gives each one its title for readers.

## Tests

Snippet scripts name a `compose.yaml` here in `[tool.docs-factory] compose`.
`content/conftest.py` starts a fresh stack per script and stops it afterwards,
so scripts don't see each other's catalogs. On Colima, run the service lane
with `UC_DOCS_ROOT=$HOME/tmp/uc-docs`, because Colima shares only `$HOME` with
containers.
