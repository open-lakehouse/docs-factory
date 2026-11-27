---
title: "Open Sharing: share what Unity Catalog governs, with any Delta Sharing client"
slug: uc-open-sharing
status: idea
tags: [unity-catalog, data-sharing, governance, delta-lake]
author: Robert Pack
post_type: deep-dive
audience: Data platform engineers who know Unity Catalog tables and grants, and want to share governed Delta tables with partners without copying data or opening up the catalog.
summary: Open Sharing serves the Delta Sharing protocol from Unity Catalog, so tables the catalog governs can be shared with any Delta Sharing client, no copies made.
---

<!--
Scaffolded 2026-11-27. The UC integration is an open 6-PR stack
(#2145, #2151, #2152, #2146, #2147, #1825, by littlegrasscao, opened
2026-11-06). The roadmap PR #2327 lists "Open Sharing server integration"
under "Beyond 0.8", so this post isn't tied to the 0.8 release; time it with
the stack's merge. Re-read the PRs when they land: everything below is from PR
descriptions, not merged code.
-->

## 1. Hook / thesis

Working thesis: sharing belongs in the catalog that already governs the data.
With Open Sharing embedded, a Unity Catalog server shares its Delta tables over
the open Delta Sharing protocol, with UC's own users, privileges and credential
vending. Recipients use any Delta Sharing client.

The post has two parts: Open Sharing in general (the protocol, the project,
why it's open), and UC supporting it.

## 2. Audience

Data platform engineers who know UC tables, grants and credential vending.
Partners or other teams need read access to some tables. They may have heard
of Delta Sharing but not of OpenSharing, the open server implementation.

## 3. Tone / voice

First person and opinionated. The stance: sharing shouldn't be a separate
product with its own copy of permissions. It's a protocol in front of the
catalog.

## 4. Key takeaways (draft)

- Open Sharing is an open-source Delta Sharing server
  ([OpenSharing-IO/OpenSharing](https://github.com/OpenSharing-IO/OpenSharing)).
  UC embeds `io.opensharing:opensharing-server-core` 0.1.1.
- It's off by default. Turning it on with `server.opensharing.enabled=true`
  requires `server.authorization=enable` and `server.opensharing.public-url`.
- It adds shares and recipients as securables, with `CREATE SHARE`,
  `USE SHARE`, `CREATE RECIPIENT` and `USE RECIPIENT` on the metastore.
- A table resolves for sharing only if the caller could read its data in UC.
  Credentials are vended by UC for the table's own location.
- The same protocol has a Rust implementation in our estate (distributary),
  which shows the protocol is the contract.

## 5. Outline (placeholder)

1. **Sharing is a catalog concern.** The thesis, answer first.
2. **What Open Sharing is.** The Delta Sharing protocol, the OpenSharing
   project, provider and recipient roles.
3. **Open Sharing inside Unity Catalog.** Configuration, the provider API
   (`/api/2.1/unity-catalog/opensharing/provider`), share and recipient
   securables, authorization.
4. **Share a table end to end** `[code]`. Create a share, add a table, create
   a recipient, activate, read with a Delta Sharing client. Needs a merged
   stack and a Trestle environment.
5. **One protocol, several servers.** Distributary (Rust) and mangrove's
   sharing state. The protocol is the interop surface.
6. **What's next.** Agent skills and volumes as shared objects (an IDEAS.md
   thread)?

## 6. Source material

- `unitycatalog` PR stack (open; re-pin when merged):
  - #2145: the connector and its dependencies.
  - #2151: `os_*` tables as schema step V3.
  - #2152: authorization, with the share and recipient securables and their
    privileges.
  - #2146: the share API and `docs/server/opensharing.md`.
  - #2147: the recipient API and share grants.
  - #1825: the protocol and recipient activation.
  - Superseded: #2144 (closed).
- OpenSharing project: https://github.com/OpenSharing-IO/OpenSharing. Includes
  OpenSharing-IO/OpenSharing#183 and #184 (in 0.1.1).
- Delta Sharing protocol: https://github.com/delta-io/delta-sharing/blob/main/PROTOCOL.md
- Our estate:
  - `distributary`: OpenSharing / Delta Sharing in Rust (`architecture/estate.yml`).
  - `mangrove · crates/sharing` (`olai-uc-sharing`): provider state.
  - `luminescent-lakehouse`: the PDP's `OpenSharing` caller namespace
    (`crates/authz-neon/README.md`).
- Prior art: the "Volumes: the file abstraction…" entry in `blogs/IDEAS.md`
  mentions Open Sharing of agent skills.

## 7. Call to action

Enable Open Sharing on a UC server and share one table with a Delta Sharing
client. Read the OpenSharing project.

## 8. Publishing target / format

`unitycatalog` primary; consider cross-posting to `delta` (Delta Sharing
readers). Time it with the stack's merge.

## 9. Verification / accuracy notes

- Everything here is from PR descriptions. Verify against merged code and
  `docs/server/opensharing.md`.
- Check which tables can be shared: the connector refuses non-Delta tables and
  tables without a storage location (#2145). Check which storage backends
  credential vending covers. S3 currently uses the region configured per
  bucket.

## 10. Open questions / risks

- **Naming:** is it "Open Sharing" (UC roadmap) or "OpenSharing" (the project
  and package)? Use the project's own spelling for the software.
- **Timing:** "Beyond 0.8" per the roadmap. Does the stack land in 0.8 anyway?
- **Runnable demo:** this needs a Trestle environment with sharing turned on,
  plus a client lane (`delta-sharing` Python).
- **Relationship to Databricks Delta Sharing:** frame it carefully, with
  disclosure.
