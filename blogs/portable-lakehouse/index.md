---
title: The Portable Lakehouse
slug: portable-lakehouse
status: idea
tags: [lakehouse, codegen]
series: The Composable Lakehouse
series_order: 7
author: Robert Pack
---

_Adjective still open._

**Thesis:** the same lakehouse plan should run on a laptop, against a cloud's
managed services, or on a cluster. Where it runs is a property of the plan,
not of each service.

## Scope

- One provider per resource role: run the database or object store in the
  stack, or bind to one the cloud already runs (aws-s3, hosted-postgres,
  Azure storage / azurite).
- Deploy targets: the plan is target-neutral and a `DeployTarget` renders it.
  Compose is built in today; kind / Kubernetes is planned (say so plainly).
- What has to stay constant across targets: addresses (`address()` per
  vantage), readiness gates, provisioned objects.
- From local to cloud without rewriting docs or clients: the same client env
  vars, a different provider.

## Trestle configuration

- The *Composable* stack, materialized three ways: all in-stack → hosted S3 +
  Postgres → Azure.
- Demo: the env file diff between targets plus the unchanged client code.

## Model hooks

- Deployment layer (`architecture/model/deployment/`) vs. the logical layer;
  infra implementations (`amazonS3`, `azureBlobStorage`, `postgresql`).

## Open questions

- Wait for the kind target before drafting, or ship Compose + hosted now and
  follow up?

**Prev:** *The Interoperable Lakehouse* · **Next:** *The Interactive Lakehouse*
