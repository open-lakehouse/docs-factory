---
title: Getting started
summary: Start an in-memory Unity Catalog server and create your first catalog, schema, and table via REST.
diataxis: tutorial
project: unitycatalog
status: draft
---

The quickest way to get started with unity catalog is to run it as a docker container.

::::journey

### Start the Unity Catalog service

```bash
docker run -p 8080:8080 unitycatalog/unitycatalog:v0.5.0 
```

### Validate the server is running

Submit the following command in a separate terminal.

```bash
curl -sS --fail-with-body \
  http://localhost:8080/api/2.1/unity-catalog/catalogs
```

You should see a json response similar to

```json file=./response.json

::::

:::note
Stop the running server before continuing `control + C`
:::

In most scenarios you likely want a little more setup to use a richer
featureset of Unity Catalog.

::::journey

### Create a local configuration file

Copy the following content into a local file `server.properties`
in your working directory.

```properties file=./server.properties
```

### Start the server with configuration

Now starting the server again with configuration and data location mounted.

```bash
mkdir -p /tmp/uc-data
docker run -d --name uc \
  -p 8080:8080 \
  -v /tmp/uc-data:/tmp/uc-data \
  -v "$PWD/server.properties:/home/unitycatalog/etc/conf/server.properties:ro" \
  unitycatalog/unitycatalog:v0.5.0
```

:::info
The file path must resolve to the same location in docker and on the host
to make managed location with local storage work.
:::

::::
