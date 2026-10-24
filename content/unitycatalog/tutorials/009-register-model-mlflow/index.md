---
title: Register and reload a model with MLflow
summary: Log a model with MLflow, register it as a model version in Unity Catalog, and load it back by name.
diataxis: tutorial
project: unitycatalog
references:
  - unityCatalogServer
  - mlflow
status: draft
---

In this tutorial you log a small model to an MLflow tracking server, register
it in Unity Catalog, and load the registered version back to make a
prediction.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
:::

## Log a model

```python file=./snippets/hello_mlflow.py start=start:log end=end:log
```

## Register it in Unity Catalog

```python file=./snippets/hello_mlflow.py start=start:register end=end:register
```

## Load the registered version

```python file=./snippets/hello_mlflow.py start=start:load end=end:load
```
