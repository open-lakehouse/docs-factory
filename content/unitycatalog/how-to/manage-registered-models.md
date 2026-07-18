---
title: Work with registered models
summary: Manage registered models and model versions, and vend temporary credentials for model artifacts, using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
references:
  - ucSpec
  - unityCatalogOSS
status: draft
---

Registered models are securables in the three-level namespace
(`catalog.schema.model`) that group a collection of **model versions**. Each
version carries its own artifact storage location and moves through a
`PENDING_REGISTRATION → READY` lifecycle.

Unity Catalog owns the registry metadata and governs the storage location; it
does not run or proxy an MLflow tracking server. A client (for example, MLflow)
creates a version, writes the model artifacts to the vended storage location, and
then finalizes the version.

## List registered models

Retrieve the registered models in a schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/registered_models.py start=start:list_registered_models end=end:list_registered_models
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/registered_models.ts start=start:list_registered_models end=end:list_registered_models
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/registered_models.rs start=start:list_registered_models end=end:list_registered_models
```

:::

::::

## Create a registered model

Create a new registered model. The server allocates a managed storage location
under which the model's version artifacts are stored.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/registered_models.py start=start:create_registered_model end=end:create_registered_model
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/registered_models.ts start=start:create_registered_model end=end:create_registered_model
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/registered_models.rs start=start:create_registered_model end=end:create_registered_model
```

:::

::::

## Get a registered model

Retrieve details for a specific registered model.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/registered_models.py start=start:get_registered_model end=end:get_registered_model
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/registered_models.ts start=start:get_registered_model end=end:get_registered_model
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/registered_models.rs start=start:get_registered_model end=end:get_registered_model
```

:::

::::

## Create a model version

Create a new model version. It starts in `PENDING_REGISTRATION`, and the server
assigns a monotonically increasing version number and a storage location for the
artifacts.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/registered_models.py start=start:create_model_version end=end:create_model_version
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/registered_models.ts start=start:create_model_version end=end:create_model_version
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/registered_models.rs start=start:create_model_version end=end:create_model_version
```

:::

::::

## Finalize a model version

After writing all artifacts to the version's storage location, finalize it to
transition its status to `READY`.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/registered_models.py start=start:finalize_model_version end=end:finalize_model_version
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/registered_models.ts start=start:finalize_model_version end=end:finalize_model_version
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/registered_models.rs start=start:finalize_model_version end=end:finalize_model_version
```

:::

::::

## List model versions

Retrieve the versions of a registered model.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/registered_models.py start=start:list_model_versions end=end:list_model_versions
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/registered_models.ts start=start:list_model_versions end=end:list_model_versions
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/registered_models.rs start=start:list_model_versions end=end:list_model_versions
```

:::

::::

## Accessing model artifacts

To read or write a model version's artifacts, vend a temporary credential scoped
to the version's storage location. This requires the metastore's
`external_access_enabled` flag and the caller's `EXTERNAL_USE_SCHEMA` privilege on
the parent schema, and is exposed via the temporary-credentials client
(`temporary_model_version_credential`).
