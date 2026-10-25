---
title: Use the Java client in an application
summary: Add the unitycatalog-client artifact to a JVM application, connect with a token, create and look up catalogs, schemas, and tables, page through lists, and handle API errors.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogJavaSdk
  - unityCatalogServer
status: draft
---

The [Unity Catalog Java SDK](model:unityCatalogJavaSdk) is a synchronous
client generated from the [Unity Catalog](model:unityCatalogServer) REST API.
It has one class per resource (`CatalogsApi`, `SchemasApi`, `TablesApi`,
`VolumesApi`, `FunctionsApi`, and others), each with one method per operation,
and model classes for the requests and responses. This page builds one
client in an application and uses it for the calls most applications make.

:::prerequisites
- A JDK, version 11 or later.
- [JBang](https://www.jbang.dev/download/), to run the example as a single
  file. In a Maven or Gradle project, add the dependency below instead.
:::

## Add the dependency

The client is published to Maven Central as
`io.unitycatalog:unitycatalog-client:0.7.0`. Add it to your build's
dependencies, or declare it at the top of a JBang file:

```java file=./snippets/JavaClient.java start=start:deps end=end:deps
```

Pin the version of the server you run. The client brings Jackson and SLF4J
and calls the server with the JDK's own HTTP client.

## Connect to the server

Build one `ApiClient` and create the API classes from it. Java has no
interactive shell, so put this and the following steps in your
application's `main` method or service setup:

```java file=./snippets/JavaClient.java start=start:connect end=end:connect
```

- `uri` is the server's address only. The builder appends the API's base
  path, `/api/2.1/unity-catalog`.
- The builder requires a token provider. A server with authorization disabled,
  such as the docs' local one, doesn't check the token, so any value works
  there. For a server with authorization enabled, pass a token the server
  issued.
- For OAuth client credentials, call `TokenProvider.create` with `type` set
  to `oauth`, plus `oauth.uri`, `oauth.clientId`, and `oauth.clientSecret`.
  The provider gets the token and renews it 30 seconds before it expires. `oauth.scope` defaults
  to `all-apis`.
- `addAppVersion` adds your application's name and version to the
  `User-Agent` header the client sends.

The client retries a request up to three times in all, with exponential
backoff from 500 ms and random jitter, when the server returns HTTP 429 or the
connection fails or times out. It doesn't retry other errors. To change that,
pass `.retryPolicy(JitterDelayRetryPolicy.builder().maxAttempts(5).build())`
to the builder.

## Create a catalog and a schema

Each create method takes a request model built with chained setters, and
returns the created object:

```java file=./snippets/JavaClient.java start=start:create end=end:create
```

For updates, renames, and deletes, and the privileges each needs, see
[Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).

## Page through a list

List methods return one page of results and a `next_page_token`. Pass the
token to the next call until it comes back empty. The second argument of
`listCatalogs` is the page size, which is `1` here so that paging is visible:

```java file=./snippets/JavaClient.java start=start:page end=end:page
```

`listSchemas` and `listTables` page the same way, but take the page size
before the token, after their catalog and schema names.

## Register a table

`createTable` registers a table by name, format, location, and columns. Each
column needs a type name, a SQL type, and its JSON in Delta schema form. A
small helper builds them:

```java file=./snippets/JavaClient.java start=start:column end=end:column
```

```java file=./snippets/JavaClient.java start=start:register end=end:register
```

Registration is metadata only: point `storageLocation` at an existing Delta
table. The server doesn't check that the files are there. See
[Register external Delta table](../register-external-table/index.md).

## Look up objects by name

List the tables in a schema, or get one by its three-level name:

```java file=./snippets/JavaClient.java start=start:list-tables end=end:list-tables
```

```java file=./snippets/JavaClient.java start=start:lookup end=end:lookup
```

The two `false` arguments of `getTable` are `readStreamingTableAsManaged` and
`readMaterializedViewAsManaged`. `getCatalog` and `getSchema` take a name
only.

## Handle errors

Every call throws `ApiException` when the server answers with an error.
`getCode()` returns the HTTP status, and `getResponseBody()` the JSON error,
whose `error_code` names the cause:

```java file=./snippets/JavaClient.java start=start:not-found end=end:not-found
```

A missing object returns 404, as here with `TABLE_NOT_FOUND`. Deleting a
catalog that still holds schemas returns 400 unless you force it.

## Clean up

Delete the catalog with everything in it:

```java file=./snippets/JavaClient.java start=start:clean-up end=end:clean-up
```

## Next steps

- To query tables from the JVM, use Spark with the Unity Catalog connector:
  [Configure Spark for Unity Catalog](../configure-spark/index.md).
- For the same tasks from Python, see
  [Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
