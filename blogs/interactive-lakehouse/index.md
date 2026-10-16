---
title: The Interactive Lakehouse
slug: interactive-lakehouse
status: idea
tags: [lakehouse, unity-catalog]
series: The Composable Lakehouse
series_order: 8
author: Robert Pack
---

_Adjective still open (Interactive / Experimental / ML?)._

**Thesis:** a lakehouse is also where people explore data and train models, and
the notebooks and experiments they produce should be governed assets on the same
platform, not side systems.

## Scope

- Notebooks on the platform: `notebooks` (marimo) behind the gateway, reading
  governed tables and volumes with vended credentials.
- Experiments and models: `experiment_tracking` (mlflow). Be honest that
  tracking isn't the whole model lifecycle (the model marks it *partial*).
- Asset kinds beyond tables: volumes, functions, models. The catalog governs
  data *and* AI assets.
- Sets up the finale: these assets are what agents will consume next.

## Trestle configuration

- Previous stack + `marimo` (`notebooks`) + `mlflow` (`experiment_tracking`).
- Demo: a notebook reads a table, trains a small model, logs it, and
  registers it in the catalog.

## Model hooks

- `lakehouse.modelTracking`; asset kinds (`architecture/design/asset-kinds.md`);
  `marimo`, `mlflow` implementations.

**Prev:** *The Portable Lakehouse* · **Next:** *The Agentic Lakehouse*
