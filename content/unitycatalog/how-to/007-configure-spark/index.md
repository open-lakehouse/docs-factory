---
title: Configure Spark to use Unity Catalog
summary: Pick matching Spark, Delta, and Unity Catalog connector versions, register a Unity Catalog catalog in a SparkSession, and choose how Spark authenticates to the server.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogOSS
  - deltaSpark
status: draft
---

This page shows how to connect [Apache Spark](model:deltaSpark) to a
[Unity Catalog](model:unityCatalogOSS) server so that Spark SQL can name
`catalog.schema.table` and read and write the tables it holds. The connector
registers one Unity Catalog catalog as a Spark catalog. Delta Spark handles the
table format, and from Delta 4.3.0 it reads and commits catalog-managed tables
through the server's Delta API.

## Requirements

- A Unity Catalog server, version 0.6.0. The local setup below runs one with
  authorization disabled. It ships a sample catalog named `unity`.
- Java 17 and Python 3.11 or later with [uv](https://docs.astral.sh/uv/).
- Maven access the first time a session starts: Spark downloads the connector
  and Delta jars and caches them under `~/.ivy2`.

```yaml file=./compose.yaml title="compose.yaml"
```

```properties file=./server.properties title="server.properties"
```

```bash
docker compose up -d --wait
```

## Choose matching versions

The connector is built per Spark minor version. Its artifact name carries the
Spark version, and it needs a Delta Spark build for the same Spark version:

| Spark | Unity Catalog connector | Delta Spark |
| --- | --- | --- |
| 4.1 (tested here: PySpark 4.1.0) | `io.unitycatalog:unitycatalog-spark_4.1_2.13:0.6.0` | `io.delta:delta-spark_4.1_2.13:4.3.1` |
| 4.0 | `io.unitycatalog:unitycatalog-spark_4.0_2.13:0.6.0` | `io.delta:delta-spark_4.0_2.13:4.3.1` |
| 4.2 | `io.unitycatalog:unitycatalog-spark_4.2_2.13:0.6.0` | None yet, so no Delta tables |

With a Delta Spark release older than 4.3.0, the connector quietly skips the
Delta API, and catalog-managed tables don't work.

## Configure the session

Register the catalog under a Spark catalog name and point it at the server.
The Spark name is your choice. Using the Unity Catalog catalog's own name, here
`unity`, keeps three-part names the same in Spark and in the catalog:

```python file=./snippets/spark_session.py start=start:session end=end:session
```

Each setting has a job:

| Setting | Purpose |
| --- | --- |
| `spark.jars.packages` | Downloads the connector and Delta Spark. |
| `spark.sql.extensions`, `spark.sql.catalog.spark_catalog` | Enable Delta's SQL support in the session. |
| `spark.sql.catalog.<name>` | Registers the Unity Catalog catalog `<name>` with Spark. Repeat this block for each catalog you use. |
| `spark.sql.catalog.<name>.uri` | The server's base URL, without `/api/2.1/unity-catalog`. |
| `spark.sql.catalog.<name>.auth.*` | How Spark authenticates. See the next section. |
| `spark.sql.defaultCatalog` | Lets queries leave out the catalog name. |

The same keys work as `--conf` options for `spark-submit`, `spark-sql`, and
`pyspark`, with `--packages` in place of `spark.jars.packages`.

:::tip
If you reach Maven through a mirror, add
`.config("spark.jars.repositories", "https://<your-mirror>")` to the builder.
:::

## Authenticate to the server

The connector always needs an authentication type, even when the server has
authorization disabled. Without one, the first query fails with
`Required configuration key 'type' is missing or empty`.

- **Static token.** Set `auth.type` to `static` and `auth.token` to a Unity
  Catalog access token. The local server above accepts any value. Older
  configurations set `token` instead, which still works. Set only one of the
  two.
- **OAuth client credentials.** Set `auth.type` to `oauth`, plus
  `auth.oauth.uri`, `auth.oauth.clientId`, and `auth.oauth.clientSecret`.
  `auth.oauth.scope` defaults to `all-apis`. The connector fetches and renews
  the token itself. This page doesn't test the OAuth flow.

Keep secrets out of source code. Read the token or client secret from the
environment or a secret store when you build the session.

## Check the connection

List the catalog's schemas and the tables in one of them:

```python file=./snippets/spark_session.py start=start:check end=end:check
```

The sample catalog's `default` schema lists tables such as `numbers` and
`marksheet`. These sample tables live inside the server's container, so this
local Spark can list them but can't read their files. Create your own tables
under a storage root that both sides can reach, as in
[Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md).

## Tune storage credentials

When Spark reads or writes a table, the connector asks the server for
short-lived storage credentials for that table's location. It applies them
per table. Three catalog options control this, and the defaults suit most
setups:

| Option | Default | Effect |
| --- | --- | --- |
| `renewCredential.enabled` | `true` | Fetches new credentials before vended ones expire, so long jobs keep running. |
| `credScopedFs.enabled` | `true` | Caches file-system clients per credential, not per bucket, so tables in the same bucket don't share access. |
| `deltaRestApi.enabled` | `true` | Uses the Delta API for Delta tables. Catalog-managed tables need it. |

Set them like the others, for example
`spark.sql.catalog.unity.renewCredential.enabled`. For how the server decides
what each credential may access, see
[Credential vending](../../explanation/credential-vending/index.md).

Option names and defaults come from the 0.6.0 connector source,
[`OptionsUtil.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/connectors/spark/src/main/java/io/unitycatalog/spark/utils/OptionsUtil.java)
and
[`AuthConfigs.java`](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/clients/java/src/main/java/io/unitycatalog/client/auth/AuthConfigs.java).

## Next steps

- [Create and update a catalog-managed Delta table](../../tutorials/managed-delta-table/index.md)
  puts this session to work.
- [Clients and engines](../../reference/clients-and-engines/index.md) lists
  the other engines that work with Unity Catalog, and which versions.
