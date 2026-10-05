# unitycatalog: the shared local server for the Unity Catalog docs

Every page under `content/unitycatalog/` runs against this environment, and
readers download it as described in
[Run a local Unity Catalog server](../../content/unitycatalog/how-to/011-run-local-server/index.md).

| File | Starts |
| --- | --- |
| `compose.yaml` | Unity Catalog 0.6.0 on `:8080`, authorization off, `UC_DOCS_ROOT` (default `/tmp/uc-docs`) mounted at the same path in the container. |
| `compose.aws.yaml` | The same server with `server.aws.properties`, plus [aws-sim](../aws-sim/README.md) (S3 and STS on the real AWS hostnames, `:9000` on the host). |
| `compose.postgres.yaml` | The same server with `hibernate.postgres.properties`, keeping its metadata in a `postgres` service (volume `uc-postgres`) instead of the container's H2 file. |

All three use the compose project `uc-docs` and the container name `unitycatalog`,
so `docker exec unitycatalog bin/uc …` works from any folder and the
variants replace each other instead of running side by side.

`compose.aws.yaml` includes `../aws-sim`, so readers get both folders: the
docs site serves them as one archive, `/env/uc-docs-env.tar.gz`, with this
folder at `uc-docs-env/unitycatalog`. READMEs stay out of the archive.
[`../environments.yml`](../environments.yml) describes each compose file to
readers: its title, host ports, and the variables a host client exports.

## Tests

Snippet scripts name one of the compose files in `[tool.docs-factory] compose`.
`content/conftest.py` starts a fresh stack per script and stops it afterwards,
so scripts don't see each other's catalogs. On Colima, run the service lane
with `UC_DOCS_ROOT=$HOME/tmp/uc-docs`, because Colima shares only `$HOME` with
containers.
