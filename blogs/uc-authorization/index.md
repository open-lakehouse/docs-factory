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

# Unity Catalog 0.8: finer privileges, movable ownership, and an external policy engine

_Fact collection, not a post yet. Each fact is tagged **[read]** (read in
unitycatalog code or docs at
[`f59e83d3`](https://github.com/unitycatalog/unitycatalog/tree/f59e83d35fcd4a99415711d0d6551325a156f43c),
not run), **[open]** (in an open PR, so assume it lands but re-check), or
**[to test]** (needs a spike). Re-pin to `v0.8.0` when it's tagged. The angle
and outline are in `brief.md`._

## New privileges

- **[read]** 0.8 adds five privileges ([#2091](https://github.com/unitycatalog/unitycatalog/pull/2091),
  #2084–#2088): `BROWSE`, `MANAGE`, `READ METADATA`, `WRITE VOLUME`, and
  `CREATE MODEL VERSION`.
- **[read]** Each privilege is grantable only on listed object types. A grant on
  the wrong type is rejected with `INVALID_ARGUMENT`, and the whole request
  fails before anything is saved ([#2014](https://github.com/unitycatalog/unitycatalog/pull/2014)).
  This validation runs even with `server.authorization=disable`. Existing
  invalid grants stay in place and can still be revoked (`docs/server/auth.md`,
  "Valid privilege grants").

  | Privilege | Object types |
  | --- | --- |
  | `BROWSE` | Catalog, external location |
  | `CREATE MODEL VERSION` | Catalog, schema, registered model |
  | `READ VOLUME`, `WRITE VOLUME` | Catalog, schema, volume |
  | `READ METADATA` | Every securable, including the metastore |
  | `MANAGE` | Catalog, schema, table/view, volume, function, registered model, external location, storage credential (not the metastore) |

- **[read] MANAGE** permits:
  - full metadata and grant inspection;
  - grant changes and supported metadata updates;
  - deletion and ownership transfer.

  A manager can grant themselves data access. Usage grants are needed only
  above the scope of the MANAGE grant. A rename through MANAGE also needs the
  matching create privilege (auth.md, "MANAGE").
- **[read] BROWSE** on a catalog lets a user discover its schemas, tables,
  views, functions, models and volumes without usage grants.
  - Native get and list APIs need `include_browse=true` to use it.
  - The response is marked `browse_only=true`. Tables hide storage, properties
    and view definitions; functions hide `routine_definition`.
  - BROWSE grants no data access, no credentials, no changes, and no engine
    table loads.
  - A filtered list page can be empty and still carry a `next_page_token`
    (auth.md, "Discover objects with BROWSE").
- **[read] Volume writes** need `USE CATALOG` + `USE SCHEMA` + `READ VOLUME` +
  `WRITE VOLUME`. Volume ownership satisfies the volume check.
- **[read] READ METADATA alone** doesn't permit table credentials (auth.md,
  "Table credential permissions").

## Stricter checks by default

- **[read]** `server.authorization.strict-privilege-checks` defaults to `true`.
  It's documented as temporary and slated for removal
  ([#2023](https://github.com/unitycatalog/unitycatalog/pull/2023)).
  Setting it to `false` keeps the previous rules during a migration. The
  setting covers:
  - grant validation (MANAGE grants are always validated);
  - Iceberg `loadTable` / `loadCredentials` credentials, which need
    `USE CATALOG` + `USE SCHEMA` + `SELECT`, or ownership at each level
    ([#2015](https://github.com/unitycatalog/unitycatalog/pull/2015));
  - table metadata, where `MODIFY` no longer substitutes for `SELECT` for
    details, listings and existence checks across UC REST, Delta and Iceberg
    REST ([#2016](https://github.com/unitycatalog/unitycatalog/pull/2016));
  - volume and model renames by an owner, which also need the create privilege
    in the schema ([#2017](https://github.com/unitycatalog/unitycatalog/pull/2017),
    [#2018](https://github.com/unitycatalog/unitycatalog/pull/2018)).
- **[read]** With OPA, the strict flag also changes *which* privileges UC asks
  OPA about.
- **[read]** Table credentials: read needs `USE CATALOG`, `USE SCHEMA` and
  `SELECT`, or ownership at each level. Metastore admin, parent ownership, or
  `MODIFY` alone isn't enough. Read/write additionally needs `MODIFY` or
  ownership. Iceberg credentials for UniForm tables stay read-only.

## Ownership transfer

- **[read]** Set `owner` in an object's PATCH request to transfer ownership to
  an existing user ([#2149](https://github.com/unitycatalog/unitycatalog/pull/2149)).
  - Table and function PATCH supports *only* the owner change.
  - For views, functions and models, a user can take ownership themselves; a
    metastore admin can assign it to someone else.
  - Credential and external-location PATCH used to accept and *ignore* `owner`.
    It now transfers ownership, so clients that echo the old owner back need
    updating.
- **[read]** The owner and its `OWNER` grant are written in one transaction.
  - If the local reload of the permission cache fails, the request returns
    `UNAVAILABLE` even though the transfer may have committed. Until a reload
    succeeds, native checks on that instance deny everyone, admins included.
  - Multi-instance deployments need `server.authorization.policy-refresh=true`.
    It's off by default, polls every `PT1M`, and can miss a concurrent commit.
- **[read]** You can't delete or deactivate the metastore owner
  ([#2121](https://github.com/unitycatalog/unitycatalog/pull/2121)).

## Audit records

- **[read]** The server can write one JSON line for each of these events
  ([#2028](https://github.com/unitycatalog/unitycatalog/pull/2028),
  [#2029](https://github.com/unitycatalog/unitycatalog/pull/2029),
  [#2030](https://github.com/unitycatalog/unitycatalog/pull/2030)):
  - each storage credential it issues;
  - each permission change;
  - each storage cleanup it queues for a dropped managed table, volume, model,
    or model version.

  Audit is off by default; it's turned on with `server.audit.sink`
  (`docs/server/configuration.md`, "Audit records").
- **[read]** Sinks:
  - `FileAuditSink` ships with the server and writes to the Log4j `audit`
    logger, which goes to `etc/logs/audit.log`.
  - Or your own `io.unitycatalog.server.audit.AuditSink` class on the
    classpath, with a public no-arg constructor. It must be thread-safe and
    should queue its writes.

  Records are best effort. The server refuses to start if the audit logger
  config would silently drop records.
- **[read]** A contrast worth making: audit is pluggable by class name, the
  authorizer isn't (see below).

## OPA: the decision leaves the server

- **[read]** Configuration
  ([#2077](https://github.com/unitycatalog/unitycatalog/pull/2077),
  [#2078](https://github.com/unitycatalog/unitycatalog/pull/2078)):
  `server.authorization=enable`, `server.authorization.provider=opa`,
  `server.authorization.opa.decision-url=…`, and
  `server.authorization.opa.response-timeout` (default `PT5S`).
  - Startup fails if the decision URL is missing.
  - The URL must be HTTP(S), with no credentials and no fragment.
- **[read]** UC still evaluates its own authorization expressions, and sends
  **one request per leaf privilege**. For example, creating a table asks for
  `USE_CATALOG` on the catalog, `USE_SCHEMA` and `CREATE_TABLE` on the schema,
  and `CREATE_EXTERNAL_TABLE` on the location when one applies. `OWNER`
  alternatives are asked too, with short-circuiting.
  - Path resolution, overlap validation and staging-table creator checks stay
    in UC.
- **[read]** Input document (`OpaInputBuilder.java`):

  ```json
  {"input": {
    "principal": {"id": "<UC user UUID>", "email": "alice@example.com", "external_id": "…"},
    "privilege": "CREATE_TABLE",
    "resource": {"id": "<UUID>", "type": "SCHEMA", "name": "reports",
                 "parents": [{"id": "<UUID>", "type": "CATALOG", "name": "analytics"}]}}}
  ```

  - Names are local, and parents run from the schema up to the catalog.
  - No groups, no native grants, no owner fields, and no cloud credentials are
    sent. UC doesn't forward the user's token.
- **[read]** OPA must answer `{"result": {"allow": <bool>}}`. Anything else
  fails the request with HTTP 503, as do transport errors, timeouts and HTTP
  errors. UC never falls back to native grants.
  - Decisions are reused within one expression evaluation or a list
    evaluation, never across requests.
  - Pending OPA calls are cancelled with the UC request.
- **[read]** Grant, revoke and list APIs keep writing UC's **native** records,
  which don't affect OPA decisions. Creates and deletes keep maintaining native
  owner and hierarchy records, so switching back to Casbin uses them.
- **[read]** SCIM asks OPA for metastore `OWNER` before deleting or
  deactivating a user. In OPA mode, the policy has to grant it to protected
  users.
- **[read]** The example policy `etc/conf/opa-example.rego` (OPA 1.x, package
  `uc.authz`) allows `admin` and looks grants up in OPA's own `data.grants`.

## Is it only OPA? The seam

- **[read]** The provider is a closed enum: `server.authorization.provider` is
  `casbin|opa` (`ServerProperties.java`), and `initializeAuthorizer` in
  `UnityCatalogServer.java` instantiates one or the other. Nothing loads a
  custom authorizer class.
- **[read]** The Java seam `UnityCatalogAuthorizer` is generic: grant/revoke,
  hierarchy, `authorize` / `authorizeAny` / `authorizeAll`, and
  `listAuthorizations`. `OpaAuthorizer` wraps `JCasbinAuthorizer` for
  bookkeeping and replaces only the decisions.
- **[read]** In practice, the open seam is the **wire contract**. Any HTTP
  service that accepts the input document and answers `result.allow` can stand
  in for OPA.

## Bring your own PDP: our Cedar PDP

- **[read]** Our PDP is breakwater's `olai-pdp`, deployed as the `authz` Neon
  Function in luminescent-lakehouse (`crates/authz-neon`). It speaks
  `olai_auth::wire`: `POST /v1/authorize` and `/v1/authorize/batch` with
  `principal` / `action` / `resource` entity refs plus caller-supplied Cedar
  entities. It requires a caller `Authorization: Bearer` secret
  (`AUTHZ_TOKEN_<NAME>`).
- **[read]** Three mismatches with UC's OPA authorizer:
  - **Request format:** OPA's input document versus `/v1/authorize`.
  - **Caller authentication:** UC sends no credentials, and none are allowed
    in the URL.
  - **Granularity:** UC asks one privilege on one securable, identified by UUID
    and local name. mangrove's `UnityCatalog` Cedar namespace has one action
    per *API operation*, keyed by full name.
- **[read]** Where they line up:
  - UC sends the parents, so an adapter can build the Cedar entities and the
    full name.
  - The PDP's loader already supplies `privileges` / `inherited_privileges`
    and group memberships from its own `authz` store, which fills UC's
    missing-groups gap.
  - A policy for Java UC is simpler than mangrove's, because UC has already
    reduced the operation to privileges.
- **[to test]** Paths:
  1. an OPA-compatible route on `olai-pdp`;
  2. a sidecar adapter;
  3. upstream UC: configurable headers on the decision call, or a neutral HTTP
     or AuthZEN authorizer.

  Plus principal mapping: match UC's `email` or `external_id` against the
  PDP's `Lakehouse::User`.

## Related hardening in 0.8

- **[read]** CSRF protection for cookie login and writes
  ([#1994](https://github.com/unitycatalog/unitycatalog/pull/1994)).
- **[read]** OIDC key destinations are constrained and providers cached
  ([#1990](https://github.com/unitycatalog/unitycatalog/pull/1990)).
- **[read]** The token signing key can be read from an operator key file
  ([#2081](https://github.com/unitycatalog/unitycatalog/pull/2081)).
- **[read]** Opt-in UC token exchange in the client's `OAuthTokenProvider`
  ([#2037](https://github.com/unitycatalog/unitycatalog/pull/2037)). Draft
  #2201 would remove it again.
- **[open]** Groups: SCIM groups at `/scim2/Groups` (#2208), group grants and
  ownership (#2210), and `bin/uc group` (#2209). All are drafts, and the
  roadmap (#2327) lists them for 0.8.
- **[open]** External IdP series (#2196–#2207): Okta-conformant SCIM, IdP
  access tokens accepted directly, create-on-first-sign-in.
- **[open]** A permissions update validated as a whole before any write
  (#2387), and the principal filter applied on get-permissions (#2386).
