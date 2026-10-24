---
title: Manage registered models
summary: Register MLflow models as Unity Catalog model versions, load a version by number, and update, rename, and delete models and versions.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - mlflow
  - lakehouse.mlModel
status: draft
---

A [registered model](model:lakehouse.mlModel) in
[Unity Catalog](model:unityCatalogServer) lives in a schema and has a
three-level name, such as `unity.manage_models.linear`. It holds numbered
versions, and each version has its own copy of the model's files in the
catalog's managed storage. MLflow's tracking server keeps the runs and the
logged models. Unity Catalog keeps the registered models and their versions
([how the two services divide the work](../../explanation/models-and-mlflow/index.md)).

On this page, MLflow uploads a version's files and loads them. MLflow, the
Python SDK, and the CLI all view, update, and delete models and versions, and
only the SDK and the CLI rename them.

Each task lists the privileges that the server's
[authorization rules for models](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/ModelService.java)
require when authorization is enabled.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- A catalog with managed storage, such as `unity`, and a schema in it, such as
  `unity.manage_models`:
  [Manage catalogs and schemas](../manage-catalogs-and-schemas/index.md).
- For the Python SDK and CLI examples, the model `unity.manage_models.linear`
  with versions 1 and 2, registered with MLflow as in
  [Register a model version](#register-a-model-version).
:::

## Set up the client

Set up the client for your interface:

:::tab[MLflow]
Start Python with MLflow and scikit-learn, the library the example model uses:

```bash
uv run --python 3.12 --with 'mlflow[databricks]==3.17.0' --with scikit-learn==1.9.1 python
```

Point MLflow at the tracking server and at Unity Catalog's registry. The `uc:`
prefix on the registry URI selects MLflow's Unity Catalog registry, and
`AWS_ENDPOINT_URL_S3` points MLflow at the environment's S3-compatible store:

```python file=./snippets/models_mlflow.py start=start:connect end=end:connect
```
:::

:::tab[Python SDK]
Start Python with the SDK:

```bash
uv run --with unitycatalog-client==0.7.0 python -m asyncio
```

```python file=./snippets/models_sdk.py start=start:connect end=end:connect
```
:::

:::tab[CLI]
```bash file=./snippets/models.sh start=start:setup end=end:setup
```
:::

The examples use one model, `unity.manage_models.linear`. The next section
registers it with versions 1 and 2, and every section after it starts from
there.

## Register a model version

Registering needs a model logged in MLflow. To follow along, train two small
linear models, y = 2x + 1 and y = 3x + 1, and log each in its own run:

```python file=./snippets/models_mlflow.py start=start:log end=end:log
```

The session prints the two logged models' URIs, each of the form
`models:/m-<id>`.

Register the first one under the model's name. If the model doesn't exist,
MLflow creates it with version 1:

```python file=./snippets/models_mlflow.py start=start:register end=end:register
```

MLflow reports:

```text
Successfully registered model 'unity.manage_models.linear'.
Created version '1' of model 'unity.manage_models.linear'.
1 READY
```

Register the second one under the same name. MLflow adds the next version:

```python file=./snippets/models_mlflow.py start=start:new-version end=end:new-version
```

```text
Registered model 'unity.manage_models.linear' already exists. Creating a new version of this model...
Created version '2' of model 'unity.manage_models.linear'.
2 READY
```

Both calls also print a line about waiting for the version and progress bars.
One call creates the version, copies the logged model's files into the
catalog's managed storage, and marks the version `READY`. MLflow writes the
files with temporary credentials that Unity Catalog issues for that one
version. See [Credential vending](../../explanation/credential-vending/index.md).

:::note
Version numbers aren't reused. If you delete version 2, the next registration
creates version 3.
:::

MLflow doesn't pass `tags` to Unity Catalog. Tags given to `register_model` or
`create_registered_model` are dropped without an error.

**Required privileges:** `mlflow.register_model`
[tries to create the model first](https://github.com/mlflow/mlflow/blob/v3.17.0/mlflow/tracking/_model_registry/fluent.py#L177-L188) and continues only
if it already exists, so every call needs all of these:

- To create the model, even when it exists: `USE_CATALOG` or ownership on the
  catalog, and on the schema either ownership, or `USE_SCHEMA` plus
  `CREATE_MODEL` (or `CREATE_FUNCTION`). Whoever creates the model owns it.
- To add and finalize the version: ownership of the catalog; or `USE_CATALOG`
  and ownership of the schema; or `USE_CATALOG`, `USE_SCHEMA`, and ownership of
  the model.
- To [write the version's files](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/TemporaryModelVersionCredentialsService.java#L40-L47): ownership of the
  model, plus `USE_SCHEMA` or ownership on the schema and `USE_CATALOG` or
  ownership on the catalog. Owning the catalog doesn't replace owning the
  model.

## View models and versions

:::tab[MLflow]
```python file=./snippets/models_mlflow.py start=start:view end=end:view
```

Search takes no `filter_string` or `order_by` for models, and no `order_by`
for versions. Either one raises
`Argument '…' is unsupported for models in the Unity Catalog.`
:::

:::tab[Python SDK]
```python file=./snippets/models_sdk.py start=start:view end=end:view
```
:::

:::tab[CLI]
```bash file=./snippets/models.sh start=start:view end=end:view
```
:::

A version's `status` is `READY` once registration finishes. Its `source` is
the logged model it was copied from, `models:/m-<id>`. Its `run_id` is set only
when you register from a `runs:/<run-id>/<path>` URI. A model's
`storage_location` is a directory in the catalog's managed storage, and each
version's files sit below it, under `versions/`.

**Required privileges:** one of ownership of the metastore; ownership of the
catalog; `USE_CATALOG` and ownership of the schema; or `EXECUTE` or ownership
on the model, plus `USE_SCHEMA` and `USE_CATALOG`. A list of models returns
only the models you could get.

## Load a model version

Load a version by its number, and get the location of its files:

```python file=./snippets/models_mlflow.py start=start:load end=end:load
```

The session prints the version's signature, with the input column `x` as a
`double`, then the prediction `[21.]`, since version 1 fits y = 2x + 1. The
signature comes from the version's files, not from Unity Catalog's record of
the version. The location has the form
`s3://uc-docs/unity/__unitystorage/catalogs/<id>/models/<id>/versions/<id>`.
MLflow reads the files with read-only credentials from Unity Catalog.

Load by number only. Unity Catalog's registry has no aliases and no stages, so
`models:/<name>@<alias>` and `models:/<name>/latest` raise
`NotImplementedError: Method not implemented`. So do setting an alias,
`get_latest_versions`, and `transition_model_version_stage`.

**Required privileges:** the privileges to view the version, and to
[read its files](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/server/src/main/java/io/unitycatalog/server/service/TemporaryModelVersionCredentialsService.java#L40-L47), `EXECUTE` or ownership on the
model, plus `USE_SCHEMA` or ownership on the schema and `USE_CATALOG` or
ownership on the catalog. Owning the catalog or the metastore doesn't replace
these.

## Update comments

Besides the model's name, a comment is the only metadata you can change on a
model or a version. Set one on the model and one on version 2:

:::tab[MLflow]
MLflow calls the comment `description`:

```python file=./snippets/models_mlflow.py start=start:update end=end:update
```
:::

:::tab[Python SDK]
```python file=./snippets/models_sdk.py start=start:update end=end:update
```
:::

:::tab[CLI]
```bash file=./snippets/models.sh start=start:update end=end:update
```
:::

The Python sessions echo the updated model and version. Other versions keep
their comments. Models and versions have no tags: `set_registered_model_tag`
and `set_model_version_tag` raise `NotImplementedError`. A version's signature
and input example live in its files, not in Unity Catalog.

**Required privileges:** one of ownership of the catalog; `USE_CATALOG` and
ownership of the schema; or `USE_CATALOG`, `USE_SCHEMA`, and ownership of the
model. The same holds for a model's comment and a version's.

## Rename a model

Rename a model with the Python SDK or the CLI. `new_name` is the model's name
within its schema. MLflow's `rename_registered_model` raises
`NotImplementedError`.

The example renames the model to `linear_regression` and prints the result,
then renames it back, so the examples below still find it as `linear`:

:::tab[Python SDK]
```python file=./snippets/models_sdk.py start=start:rename end=end:rename
```
:::

:::tab[CLI]
```bash file=./snippets/models.sh start=start:rename end=end:rename
```
:::

The model keeps its id, storage location, comment, and versions. Only its name
changes.

**Required privileges:** the same as for updating a comment.

## Delete versions and models

**Required privileges:** to delete a version, or a model with or without
`force`, the same as for updating a comment.

### Delete a version

:::tab[MLflow]
```python file=./snippets/models_mlflow.py start=start:delete-version end=end:delete-version
```
:::

:::tab[Python SDK]
```python file=./snippets/models_sdk.py start=start:delete-version end=end:delete-version
```
:::

:::tab[CLI]
```bash file=./snippets/models.sh start=start:delete-version end=end:delete-version
```
:::

### Delete a model

A model that still has versions is deleted only with `force`. Without it, the
server refuses with
`Unable to delete a registered model with existing model versions`. The Python
SDK and the CLI pass `force`. MLflow can't, so its example deletes the versions
first, a page of search results at a time, until none are left:

:::tab[MLflow]
```python file=./snippets/models_mlflow.py start=start:delete-model end=end:delete-model
```
:::

:::tab[Python SDK]
```python file=./snippets/models_sdk.py start=start:delete-model end=end:delete-model
```

When you're done, close the client:

```python file=./snippets/models_sdk.py start=start:close end=end:close
```
:::

:::tab[CLI]
```bash file=./snippets/models.sh start=start:delete-model end=end:delete-model
```
:::

### What happens to the files

The catalog entry goes at once. A background worker in the server deletes the
version's or the model's directory in managed storage no sooner than
[`server.storage-cleanup.initial-delay`](https://github.com/unitycatalog/unitycatalog/blob/v0.7.0/etc/conf/server.properties#L67-L76)
after the delete, 7 days by default, and retries a deletion that fails. The run
and the logged model on the MLflow tracking server, with their files, stay.

:::warning
The delay isn't a recovery window: a deleted model or version can't be
restored, and once the worker runs its files are gone for good. Load or copy
anything you still need first.
:::

## Next steps

- [Register and reload a model with MLflow](../../tutorials/register-model-mlflow/index.md)
  to walk through logging and registering a model from the start.
- [Learn how credential vending works](../../explanation/credential-vending/index.md),
  the mechanism that lets MLflow read and write a version's files.
- [Learn the core concepts](../../explanation/uc-basics/index.md) to see where
  registered models sit in the namespace.
