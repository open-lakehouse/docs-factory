---
title: Register and reload a model with MLflow
summary: Train a model, log it to an MLflow tracking server, register it as a version in Unity Catalog, and load it back by name to predict.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogServer
  - mlflow
  - lakehouse.mlModel
status: ready
---

Two services share the work in this tutorial. MLflow keeps the run and the
model you log in it. Unity Catalog keeps the
[registered model](model:lakehouse.mlModel) and its versions, under a
three-part name like a table.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
:::

::::journey

### Open a Python session

Open a Python session with MLflow, the Unity Catalog client, and scikit-learn:

```bash
uv run --python 3.12 --with mlflow==3.17.0 --with boto3==1.43.114 --with unitycatalog-client==0.7.0 --with scikit-learn==1.9.1 python -m asyncio
```

Enter each of the following snippets in the session, in order.

:::note
MLflow's Unity Catalog registry is part of the `mlflow` package. It reads and
writes a version's files in the catalog's S3 storage with boto3, which `mlflow`
doesn't install on its own.
:::

:::note
`python -m asyncio` is a Python shell that accepts `await` at the top level,
which the asynchronous Unity Catalog client needs.
:::

### Point MLflow at both services

Set the tracking server, the model registry, and the address of the object
storage. The `uc:` prefix on the registry URI selects MLflow's Unity Catalog
registry:

```python file=./snippets/hello_mlflow.py start=start:connect end=end:connect
```

:::note
MLflow configures tracking and the registry separately. Here both URIs reach
`localhost:8080`, which routes each request to the right service.
`AWS_ENDPOINT_URL_S3` is the only storage setting the session needs. MLflow
reads and writes the version's files in the catalog's storage directly, and
this variable points it at the local S3-compatible store instead of AWS.

The two `MLFLOW_ENABLE_PROXY_MULTIPART_*` settings are only for the Docker
Compose environment: without them, the tracking server hands out download links
for an address inside it that your machine can't reach. A real deployment
doesn't need them.
:::

### Create a schema for the model

A registered model lives in a schema, like a table. Create the schema
`unity.hello` in the `unity` catalog:

```python file=./snippets/hello_mlflow.py start=start:schema end=end:schema
```

The session prints `unity.hello`. The `unity` catalog has managed storage,
which
[creating a registered model needs](../../explanation/models-and-mlflow/index.md#what-unity-catalog-registers).

### Train a small model

Fit a linear regression on five points of y = 2x + 1:

```python file=./snippets/hello_mlflow.py start=start:train end=end:train
```

### Log it with a signature

Infer the model's signature from the training data, then log the model in an
MLflow run:

```python file=./snippets/hello_mlflow.py start=start:log end=end:log
```

Enter the snippet as shown. MLflow prints links to the run and the experiment,
then the logged model's id, which starts with `m-`.

`pip_requirements` lists the model's dependencies explicitly, so MLflow
doesn't record the packages of whatever project the session runs in.

:::note
A `Failed to resolve installed pip version` warning is harmless: the uv
environment has no pip.
:::

:::tip
The signature records the model's input and output schema: here one `double`
column `x` in and a prediction out. The registered version keeps it, so anyone
who loads the model can see what it expects.
:::

### Register it in Unity Catalog

Register the logged model under a three-part name:

```python file=./snippets/hello_mlflow.py start=start:register end=end:register
```

MLflow reports `Successfully registered model 'unity.hello.linear'.` and that
it created version `1`, then the session prints:

```text
unity.hello.linear 1
```

This step, and the next two, also show download and upload progress bars.

:::note
Registering copies the logged model's files into the catalog's managed
storage. MLflow writes them with temporary credentials that Unity Catalog
vends for that one model version.
:::

### See where each service keeps it

Print where the logged model's files are and where the model version's copy
is:

```python file=./snippets/hello_mlflow.py start=start:inspect end=end:inspect
```

The output has two lines:

```text
logged model:  mlflow-artifacts:/<experiment-id>/models/m-<id>/artifacts
model version: s3://amzn-s3-demo-bucket/unity/__unitystorage/catalogs/<uuid>/models/<uuid>/versions/<uuid>
```

The logged model's files go through the tracking server, which stores them.
The version's copy is in the `unity` catalog's managed storage, at a path that
names the catalog, the model, and the version by id.

### Load the version and predict

Load version `1` by its registered name and predict y for x = 10:

```python file=./snippets/hello_mlflow.py start=start:load end=end:load
```

The signature lists `['x': double (required)]` as the input and
`[Tensor('float64', (-1,))]` as the output. The prediction is `[21.]`.

:::tip
Load a model by its version number. Unity Catalog's registry has no aliases or
stages.
:::

### Clean up

Delete the version, then the model, then the schema, and close the client:

```python file=./snippets/hello_mlflow.py start=start:clean-up end=end:clean-up
```

The session echoes `'200 OK'` for the schema. The run and the logged model's
files stay in MLflow. Leave the session with `Ctrl+D`.

::::

## Next steps

- [Manage registered models](../../how-to/manage-models/index.md) to register
  new versions, load one by number, rename, and delete models.
- [Learn how credential vending works](../../explanation/credential-vending/index.md),
  the mechanism that let MLflow write the version's files.
- [Learn how Unity Catalog and MLflow divide responsibilities](../../explanation/models-and-mlflow/index.md)
  for runs, models, versions, and their files.
