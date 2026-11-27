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

# Open Sharing: share what Unity Catalog governs, with any Delta Sharing client

_Notes, not a post yet. Everything is from the open UC PR stack (#2145, #2151,
#2152, #2146, #2147, #1825) and is tagged **[PR]** until it's merged and
re-read. See `brief.md` for the angle and outline._

## What lands in Unity Catalog

- **[PR]** UC embeds OpenSharing (`io.opensharing:opensharing-server-core`
  0.1.1) to share the Delta tables it governs with Delta Sharing recipients
  (#2145).
- **[PR]** It's off unless `server.opensharing.enabled=true`.
  - It requires `server.authorization=enable`, because UC users own the shares.
  - It requires `server.opensharing.public-url`, the address recipients reach.
  - The server won't start without either, and the error names the setting
    (#2146).
- **[PR]** The provider API is served at
  `/api/2.1/unity-catalog/opensharing/provider`, behind UC's authentication and
  authorization. It creates, lists, gets, updates (add or remove tables,
  transfer ownership) and deletes shares (#2146). The recipient API and share
  grants follow in #2147. The Delta Sharing protocol and recipient activation
  follow in #1825.
- **[PR]** Shares and recipients are new securable types. `CREATE SHARE`,
  `USE SHARE`, `CREATE RECIPIENT` and `USE RECIPIENT` are metastore
  privileges. UC grants nothing on a share or recipient itself: they're roots
  in the hierarchy and in the OPA input, and the permissions API refuses them
  (#2152).
- **[PR]** OpenSharing's six `os_*` tables are UC schema step V3, on H2,
  PostgreSQL and MySQL. They're created whether or not sharing is on, and use
  UC's session factory and connection pool (#2151).

## How governance carries over

- **[PR]** The connector resolves a table only for a user UC lets read the
  table's data: `USE CATALOG`, `USE SCHEMA` and `SELECT`, or ownership.
  `READ METADATA` isn't enough. It refuses non-Delta tables and tables without
  a storage location (#2145).
- **[PR]** Credentials are vended by UC's credential vendor, for the table's
  own location only (#2145).
- **[PR]** Errors on the sharing routes use OpenSharing's `{errorCode, message}`
  body. A bad token is a 401 (#2146).

## Open Sharing beyond UC (our estate)

- distributary: OpenSharing / Delta Sharing in Rust, with protocol models, a
  client, an engine, a provider domain, and a sharing server that maps shares
  onto a catalog (`architecture/estate.yml`).
- mangrove's `olai-uc-sharing` crate holds provider state: shares, recipients,
  tokens, grants, activation, key rotation.
- The luminescent-lakehouse PDP already has an `OpenSharing` caller namespace.
