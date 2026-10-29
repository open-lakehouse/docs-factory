---
title: Run the Unity Catalog server with Java
summary: Start the Unity Catalog server from its published Maven artifact with JBang, without Docker, and keep its metadata in an H2 file between restarts.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.metadataStore
status: ready
---

The [Unity Catalog](model:unityCatalogServer) server is published to Maven
Central as a runnable jar, `io.unitycatalog:unitycatalog-server:0.7.0`.
[JBang](https://www.jbang.dev) downloads it with its dependencies and starts
it, so you can run the server on any machine with a JDK, without Docker or a
source checkout. To run it in a container instead, see
[Run a local Unity Catalog server](../run-local-server/index.md).

:::prerequisites
- A JDK, version 17 or later.
- [JBang](https://www.jbang.dev/download/).
- `curl`, to call the server.
:::

## Start the server

Make a folder for the server and start it from there:

```bash file=./snippets/run_server.sh start=start:start end=end:start
```

The first start downloads the server's dependencies. The server then runs in
the foreground on `http://localhost:8080`, and prints its banner. Stop it with
Ctrl+C. To use another port, change `--port`.

The server reads its configuration from `etc/conf/` under the folder it
starts in, so always start it from the same folder. On first start it creates
the folder and writes:

- `private_key.der`, `public_key.der`, and `key_id.txt`: the key pair the
  server signs its tokens with.
- `token.txt`: a token for the `admin` user, written again on every start.
  Clients use it when authorization is enabled. See
  [Core concepts](../../explanation/uc-basics/index.md).
- `certs.json`: the public key, for verifying the server's tokens.

## Check that it's running

In another terminal, list the catalogs:

```bash file=./snippets/run_server.sh start=start:check end=end:check
```

A new server has no catalogs: `{"catalogs":[],"next_page_token":null}`. Unlike
the container image, it doesn't load the sample catalog `unity`. Create one:

```bash file=./snippets/run_server.sh start=start:create end=end:create
```

## Keep the metadata between restarts

Without configuration, the server keeps its metadata in an in-memory H2
database, so a restart discards every catalog. To keep it in an H2 file
instead, stop the server and write `etc/conf/hibernate.properties` from the
folder you started it in:

```bash file=./snippets/run_server.sh start=start:persist end=end:persist
```

Start the server again. It creates its tables in `etc/db/` and keeps them
across restarts.

For a database other people or servers share, use PostgreSQL. The server
artifact doesn't depend on the PostgreSQL JDBC driver, so add
`org.postgresql:postgresql` to the server's classpath, then follow
[Configure PostgreSQL as the metadata database](../configure-backend-db/index.md).

## Configure the server

The server reads two more optional files from `etc/conf/`:

- `server.properties`: server settings, such as `server.authorization`
  (`disable` by default) and the storage credentials described in
  [Configure AWS storage credentials and external locations](../configure-aws-storage/index.md).
  Without the file, every setting takes its default.
- `server.log4j2.properties`: the [Log4j 2](https://logging.apache.org/log4j/2.x/manual/configuration.html)
  configuration. Without it, the server logs nothing beyond its banner and
  errors.

Restart the server after you change a file.

## Next steps

- Connect an application:
  [Use the Java client in an application](../java-client/index.md).
