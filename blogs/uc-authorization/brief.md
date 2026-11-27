---
title: "Unity Catalog 0.8: finer privileges, movable ownership, and an external policy engine"
slug: uc-authorization
status: idea
tags: [unity-catalog, governance]
author: Robert Pack
post_type: deep-dive
audience: Platform engineers running OSS Unity Catalog who know GRANT and the catalog hierarchy, and want to know what 0.8 changes about who may do what.
summary: Unity Catalog 0.8 adds BROWSE, MANAGE and three more privileges, ownership transfer, audit records, and an OPA hook that moves access decisions out.
---

<!--
Scaffolded 2026-11-27 from a sweep of unitycatalog/unitycatalog main since 0.7
branched (894d1aeb, 2026-10-05) up to f59e83d3 (2026-11-25). 0.8 is not tagged
yet; every pointer below is pinned to f59e83d3 and must be re-pinned to v0.8.0.
The facts are collected in index.md; the angle and outline get settled in
dedicated sessions. Companion posts: unity-catalog-storage (the storage half of
0.8) and uc-open-sharing.
-->

## 1. Hook / thesis

Working thesis, to be settled: 0.8 is the release where OSS Unity Catalog's
access model becomes something you can run, not just demo. It has
Databricks-shaped privileges, ownership that can move, and an audit trail. It
also lets you take the access decision out of the server entirely and give it
to a policy engine you already run.

## 2. Audience

Platform and security engineers who operate or evaluate OSS UC. They know
`GRANT`, catalogs, schemas and credential vending (link E02/E03 rather than
re-explain). They don't know the 0.8 privilege matrix, the strict-checks
migration, or how the OPA hook works.

## 3. Tone / voice

First person and opinionated. The stance to test: an external decision point is
the right direction, but 0.8's seam is only half open:
- the provider is a closed `casbin|opa` switch;
- grants keep going to UC's tables even when OPA decides;
- groups are still missing.

Say so plainly; don't oversell.

## 4. Key takeaways (draft)

- Five new privileges: `BROWSE`, `MANAGE`, `READ METADATA`, `WRITE VOLUME`,
  `CREATE MODEL VERSION`. Grants are now validated against object types.
- Stricter checks are on by default. For example, `MODIFY` no longer stands in
  for `SELECT` on metadata. A temporary flag keeps the old rules while you
  migrate.
- Ownership transfer works through `PATCH owner` on every securable.
- Audit records: credentials issued, permission changes, cleanup queued, through
  a pluggable `AuditSink`.
- OPA mode: UC asks an external engine about each privilege over a small
  HTTP/JSON contract. Any engine that speaks it can decide. Our Cedar PDP is
  the test case (open).

## 5. Outline (placeholder; refine in a dedicated session)

1. **What 0.8 changes about access.** The answer-first summary.
2. **The new privileges and what each unlocks** `[table]`. BROWSE discovery,
   MANAGE delegation, READ METADATA, WRITE VOLUME.
3. **Stricter by default.** The `strict-privilege-checks` migration, and what
   breaks for existing grants and clients.
4. **Ownership and audit.** Transfer semantics, audit records and sinks.
5. **Taking the decision out of the server** `[code]`. The OPA contract: input
   document, `result.allow`, fail-closed. What stays in UC.
6. **Bring your own PDP?** The Cedar experiment. Depends on the open questions
   in §10.
7. **What's still missing.** Groups (SCIM groups drafts), service principals.

## 6. Source material

All `unitycatalog` pointers are at `f59e83d3` (re-pin to `v0.8.0`):

- `unitycatalog · docs/server/auth.md · f59e83d3`: OPA authorization,
  permission-check migration, valid privilege grants, MANAGE, BROWSE,
  ownership transfer, table credential permissions, multi-instance policy
  refresh.
- `unitycatalog · docs/server/configuration.md · f59e83d3`: "Audit records".
- `unitycatalog · server/src/main/java/io/unitycatalog/server/auth/UnityCatalogAuthorizer.java · f59e83d3`:
  the authorizer interface.
- `unitycatalog · server/src/main/java/io/unitycatalog/server/auth/OpaAuthorizer.java`,
  `OpaInputBuilder.java · f59e83d3`: the OPA call and the input document.
- `unitycatalog · server/src/main/java/io/unitycatalog/server/UnityCatalogServer.java · f59e83d3`
  (`initializeAuthorizer`): how the provider is chosen.
- `unitycatalog · server/src/main/java/io/unitycatalog/server/utils/ServerProperties.java · f59e83d3`:
  `server.authorization.provider` enum `casbin|opa`.
- `unitycatalog · etc/conf/opa-example.rego · f59e83d3`: the example policy.
- PRs:
  - OPA: #2077 `4b2c35e4`, #2078 `d5f78591`, #2110.
  - Privileges: #2091 (API), #2084 `f2585c00`, #2085 `d5237a4d`,
    #2086 `46daf40d`, #2087 `a9c956e6`, #2088 `c7242ae9`.
  - Ownership: #2149 `a94bd66c`, plus #2313.
  - Strictness: #2016 `5e4e3d76`, #2023 `49170d20`, #2014 `8dfad7aa`,
    #2017, #2018, #2015.
  - Audit: #2028 `1459dcbd`, #2029 `36f7e3ce`, #2030 `039ca890`.
  - CSRF: #1994 `45320ad5`.
  - Open: groups #2208–#2210; external IdP #2196–#2207; permissions-update
    validation #2387, #2386.
- Roadmap: unitycatalog/unitycatalog#2327 (open) names 0.8 "S3-compatible
  storage, identity, and authorization".
- Cedar PDP (the BYO-PDP experiment):
  - `breakwater · docs/pdp.md, crates/pdp/src/http.rs`: `olai-pdp`.
  - `trestle · crates/olai-auth/src/authz/wire.rs`: the wire API.
  - `mangrove · crates/server/cedar/UnityCatalog.cedarschema`: the operation-level UC namespace.
  - `luminescent-lakehouse · crates/authz-neon`: the deployed PDP and its policies.

*Prior art (ours):*
- `blogs/trust-in-your-open-lakehouse/`: governance patterns.
- `blogs/cross-repo-abac/`: policy across services.
- `blogs/governed-lakehouse/` (idea): decision and enforcement points across
  the stack.

This post is the UC-0.8-specific, product-level piece. Link to those posts for
the architecture argument.

## 7. Call to action

Turn on authorization with strict checks on a 0.8 server and audit your grant
scripts against the object-type table. Optionally, point UC at OPA with the
example policy.

## 8. Publishing target / format

`unitycatalog` (primary). Possibly cross-post to `openlakehouse` if the Cedar
section lands. Time it with the 0.8 release, next to the storage post.

## 9. Verification / accuracy notes

- Every claim in index.md is read from code or docs at `f59e83d3`, not run.
  Run the OPA example (`opa run` + `etc/conf/opa-example.rego`) on a 0.8
  server before publishing.
- Re-check the privilege table and the strict-checks semantics at the tag. The
  flag is documented as temporary.
- Don't state a groups claim until #2208–#2210 merge or are deferred.

## 10. Open questions / risks

- **Cedar PDP integration path.** Options:
  - an OPA-compatible route on `olai-pdp` (breakwater);
  - a sidecar adapter;
  - an upstream UC change (request headers on the decision call, or a neutral
    HTTP/AuthZEN authorizer).

  Decide in a dedicated session, and check that the principal maps onto UC's
  (UUID, email, `external_id`).
- **Grants under OPA.** UC's grant API writes native records that OPA ignores.
  How do we tell readers where grants live?
- Do our Trestle environments need an OPA (or PDP) module to make the post
  runnable? This ties to the Trestle 0.8 environment work.
- Disclosure: Databricks-authored post about Databricks-originated OSS.
