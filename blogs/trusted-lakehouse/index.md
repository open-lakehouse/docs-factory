---
title: The Trusted Lakehouse
slug: trusted-lakehouse
status: idea
tags: [lakehouse, governance]
series: The Composable Lakehouse
series_order: 4
author: Robert Pack
---

**Thesis:** governance decisions are only as good as the identities they act
on. Below the user's identity sits the workload's. A trusted lakehouse gives
every brick an attested, short-lived identity, so no service holds a standing
secret and every hop can prove who is calling.

## Scope

- Workload identity with SPIFFE: SPIFFE IDs, trust domains, and why a
  service identity is not a user identity (or an API key).
- SPIRE as the issuer: server + agent, node attestation and workload
  attestation (docker / k8s / unix selectors). An identity is earned by *what
  the workload is and where it runs*, not by a secret it was handed.
- SVIDs: X.509 for mTLS, JWT for bearer hops; short TTLs and automatic
  rotation, so revocation becomes "stop renewing".
- mTLS between bricks: Envoy fetches SVIDs over SDS and terminates/originates
  mTLS on gateway ↔ service hops (Trestle's gateway template already carries a
  `DownstreamTlsContext`). TLS everywhere else too: object store, Postgres,
  catalog.
- SVIDs as principals: the SPIFFE ID becomes the caller in Cedar/OPA
  decisions and the identity the catalog vends credentials to. This closes two
  `#designed` gaps in `architecture/design/governance.md`: the client-asserted
  principal (auth interceptor) and the single shared server token
  (per-principal vending).
- No static cloud keys: JWT-SVID → OIDC federation (STS
  `AssumeRoleWithWebIdentity`) for the services that still talk to cloud
  storage directly.
- Be honest about limits: none of this is built in Trestle today. Disclose
  what is shipped vs. proposed (CONVENTIONS §6).

## Trestle configuration

- Previous stack + a proposed `spire` module (server + agent) filling a
  workload-identity role; Envoy SDS wiring on the gateway and service sidecars.
- Demo: an un-attested container is refused at the mTLS handshake; an attested
  one receives an SVID, calls the catalog, and the decision log shows its
  SPIFFE ID. Then watch the SVID rotate without a restart.

## Model hooks

- `lakehouse.governance.authentication` facet: workload principals alongside
  user principals.
- governance.md `#designed` rows: auth interceptor, per-principal credential
  vending, network PIP (`in_trusted_environment`).
- A possible new role → contribution row in
  `architecture/integrations/trestle.yaml` (see open questions).

## Cross-links

- *The Governed Lakehouse* (user identity + policy; this post goes one layer
  down).
- *Trust in your Open Lakehouse* §Trusted Compute (the argument).
- IDEAS.md *"What makes compute trusted? Identity attestation over artifact
  facts"*: the deep cut on attesting against release checksums. This post is
  the configuration; that one is the design argument. Link, don't repeat.
- IDEAS.md *"Credential-less releases"*: the supply-chain half that produces
  the signed artifacts attestation can check.

## Open questions

- SPIRE as a Trestle module, or a hosted deploy target (ties into *The
  Portable Lakehouse*)?
- Does a workload-identity role map to `authentication` as full or partial?
- How much of the demo runs in compose, and what needs the kind lane (k8s
  workload attestation)?

**Prev:** *The Governed Lakehouse* · **Next:** *The Observable Lakehouse*
