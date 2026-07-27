---
title: Composable Docker Compose
summary: Some known patterns in Docker compose that lend itself well to composable systems.
diataxis: how-to
project: open-lakehouse
status: idea
---

Building something composable forces us to think about composability at several layers.
When running multiple inter-dependent services [docker compose] is a fairly light weight
option define services and their internal networking.

The main artefcat to maintain for docker compose is the compose file, often `compose.yaml`.

The remainder of this document dela with how we can structure compose files and leverage
several features to create a framework of conventions that favours reusability and
extensibility across the various lakehouse variants we want to deploy. 

- olai-stack-topology

[docker compose]: https://docs.docker.com/compose/
