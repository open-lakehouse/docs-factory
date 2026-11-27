---
title: Unity Catalog storage — credentials, external locations, and managed storage
slug: unity-catalog-storage
status: draft
tags: [unity-catalog, governance, lakehouse]
author: Robert Pack
target: unitycatalog
---

<!--
Imported from Google Doc "Unity Catalog Concepts", tab "Storage" (t.0), 2026-07-03.
Only the first tab was imported; the doc's other tabs are out of scope for this post.
The doc carries 6 reviewer comments (Alex Jiang, TD Das, Michelle Leon, + one from
Robert Pack); they are folded into §9/§10 below, not silently resolved.

Source pointers in §6 were verified against a local unitycatalog checkout on
2026-07-03; verified discrepancies are logged in §9 rather than fixed on import.
-->

## 0.8 refresh (2026-11-27)

This post becomes the **storage post for the Unity Catalog 0.8 release**. Its
governance companion is `blogs/uc-authorization/`. 0.8 adds what this post was
missing: a local, S3-compatible backend that UC vends scoped credentials for.
That fills the `TODO` in "Try this at home" and makes the "default-safe" argument
runnable on a laptop. The sections below this one stay as imported, and this
section overrides them where they conflict.

**What changes in the brief:**

- **§1 thesis gains a second half.** The handrail now works on any S3-compatible
  store: MinIO, Ceph, SeaweedFS, RustFS, Garage. Not just AWS.
- **§5 outline.** Add a section "S3-compatible storage" `[code]` after "Grants
  and credential vending". Rewrite "Try this at home" `[code]` on a local
  RustFS (or MinIO) with STS, run from a Trestle environment.
- **§6 sources.** Re-pin from `v0.5.0` to `v0.8.0`; until it's tagged, use
  `f59e83d3`. The original pointers are now three releases stale.
- **§9 verification.** The 0.5-era CLI and Spark notes need redoing against
  0.8 (Spark 4.3 connector, Delta 4.4.1).

**0.8 facts** (read at unitycatalog `f59e83d3`, not run):

- **The `s3_compatible` credential (experimental, off by default).** Turned on
  with `server.s3-compatible-storage.enabled=true`. The stack is #2170
  `dfc1e454` (spec), #2171 `76801b61` (credential), #2172 `cdc1006b` (vending),
  #2173 `466cf326` (Hadoop/CLI), #2174 `d45a106f` (tests), #2175 `557667da`
  (Helm key) and #2169 `03dc48b1` (credentials stored as text).
- **Secrets are encrypted at rest.** The secret access key is write-only,
  encrypted with AES-256-GCM, and bound to its credential id and field. The key
  is `UC_SERVER_CREDENTIAL_ENCRYPTION_KEY` (#2171).
- **Vending, with STS.** With `assume_role`, UC calls AssumeRole at the
  storage's `sts_endpoint`, or at the S3 endpoint when none is set. The session
  policy is scoped to the path, with no KMS statement
  (`AwsPolicyGenerator.generatePolicy(…, isS3Compatible)`) (#2172).
- **Vending, without STS** (Ceph, Garage): `server.s3-compatible-storage.static-key-vending`
  picks between two modes:
  - `endpoint-only` (the default): engines bring their own keys.
  - `static-key`: clients get the key pair, refetched hourly.
- **Region.** It's discovered with an anonymous `HeadBucket` and cached, with
  `us-east-1` as the fallback.
- **What the server tells engines.** Delta API config carries `s3.endpoint` and
  `client.region`; Iceberg REST config adds `s3.path-style-access`.
- **What engines do with it.** The Hadoop/Spark connector and the CLI set S3A
  endpoint, region and path-style per bucket from the vend. That lets AWS S3
  and local storage coexist (#2173).
- **UC's own tests** run MinIO, SeaweedFS and RustFS with STS, and Ceph and
  Garage without (`server/src/test/.../teststorage`). A scope test checks that
  a vended session can't reach a sibling path, a prefix twin, or the bucket
  root. These suites run manually, not in CI (#2174).
- **Assumed to land (open):** #2289 moves the endpoint from the credential to
  the **external location**.
  - It renames the credential to `s3_compatible_access_key`.
  - It adds `addressing_style` (`PATH` | `VIRTUAL_HOSTED`).
  - The CLI's `--s3_endpoint` becomes `external_location --endpoint`.

  Don't write API or CLI samples until it merges. Related open PRs: #2264
  (non-host bucket names), #2267 (shared region lookup), #2265 (Iceberg loads
  without an ETag).
- **Related merged storage work:**
  - Server-side cache for vended credentials: #1958 `a9b66f6a`, #2007, with
    hit/miss metrics in #1991.
  - GCS downscoped tokens stop at the path boundary (#2094).
  - External-location delete and validation fixes (#1989, #2163, #2240).
  - Local FileIO doesn't follow symlinks (#1972).
- **GCS credentials (open; assume they land for 0.8):** #2273 (vend from
  storage credentials), #2260 (service-account key), #2379 (keyless
  `gcp_server_identity`). Azure stays "Beyond 0.8" (roadmap #2327).

**Runnable path and our environments.** Today `envs/uc-aws` (and `uc-local`,
`uc-mlflow`) fake AWS:
- an Envoy that answers for `s3.amazonaws.com` and `sts.*`;
- an `sts-shim` in front of RustFS that drops the `kms:` statement RustFS
  rejects and re-signs. Its wildcard expansion has been inert since 0.7.0
  (#1817).

With `s3_compatible`, a new environment can run RustFS with its own STS and no
shim. This needs a Trestle release:
- the feature flag and encryption key in `server.properties`;
- `s3_compatible` credential and location bootstrap;
- the shim and AWS hostnames made optional.

Keep `uc-aws` for the real-AWS `aws_iam_role` path. UC's harness pins RustFS
1.0.4; ours is 1.0.1.

**New open questions:**
- Does a single vended endpoint resolve from the host, from in-network clients
  and from the server? Today the AWS-hostname trick hides this.
- Is "experimental" in 0.8 a word the post should lead with, or caveat?

## 1. Hook / thesis

Unity Catalog turns storage from a sprawl of committed credentials and unscalable
bucket ACLs into three simple, composable securables — **credentials**, **external
locations**, and **managed storage** — that let any-sized team access data across a
large estate securely by default. "Always use the handrail": the safe path should be
the easy path.

## 2. Audience

Platform builders/operators, data practitioners, and the security folks who govern
them, on teams adopting or evaluating (open-source) Unity Catalog. Assumed knowledge:
comfortable with cloud object storage (S3 buckets, IAM roles), SQL `GRANT`, and the
idea of a catalog/schema/table hierarchy. Not assumed: familiarity with UC's specific
abstractions or credential vending.

## 3. Tone / voice

First person, opinionated, lightly wry — the author's "always use the handrail" and
manufacturing-plant-safety framing is the spine of the voice. Stated stance:
credential vending + managed storage should be the **default**, not an advanced
option; distributing long-lived storage credentials to users is a mistake teams keep
making. Keep the anecdote-led warmth (a reviewer explicitly liked it); tighten the
terminology that confused reviewers without flattening the voice.

## 4. Key takeaways

- Almost everything in a lakehouse is **just files** — data, tables, notebooks, ML
  models, even agent extensions — so storage access is *the* foundational governance
  problem.
- UC models storage with three primitives: **credentials** (a secret for a bucket),
  **external locations** (a URL + a credential), and **managed storage** (UC picks
  the physical layout so you don't have to name/place it yourself).
- **Grants** assign privileges to principals; **credential vending** hands clients a
  short-lived, downscoped token instead of a long-lived key.
- The security win: long-lived powerful credentials stay in one place; users only
  ever hold short-lived downscoped ones; policy changes propagate almost immediately
  (bounded by the vended-token lifetime), with no key rotation.

## 5. Outline

Working H2s (sentence-case; each should lead with the answer — QUALITY.md facet f).
Mark code-carrying sections `[code]`.

1. **The handrail** — anecdote → thesis: safety must be the default, in a plant and
   in a lakehouse.
2. **It's all just files** — storage is the foundation; the recurring failure modes
   (committed creds, aging layouts, ACL/policy sprawl). Introduce credentials +
   external locations as the two base abstractions, and tables/volumes/models as
   just paths within a location.
3. **Managed storage** — why hand physical layout/naming to UC (the "two-way door"
   argument). *Needs sharper contrast with external locations — reviewers found this
   unclear (see §10).*
4. **Identity, then authorization** — every principal needs "agency"; authn (IdP)
   vs. authz; why direct-credential distribution and bucket-level ACLs don't scale.
   *Reframe the "agents need agency" heading — collides with AI-agents (see §10).*
5. **Grants and credential vending** `[code]` — the `GRANT` securable + the vending
   flow (prove identity → request asset → receive downscoped, short-lived token) and
   its two payoffs (small blast radius, near-instant policy propagation).
6. **Try this at home** `[code]` — run OSS UC locally, create a credential, register
   an external location, read/write via Spark. *Several commands are inaccurate as
   written — see §9; fix during drafting against the pinned ref.*
7. **Summary** — restate the three primitives and the default-safe posture; hit the
   "managed storage should be the default" message harder (reviewer Michelle Leon).

## 6. Source material

*Code (cross-repo) — pin to the `v0.5.0` release tag, NOT the CI branch the local
checkout happened to be on (`ci/ghcr-manual-publish` @ `17ff8d46`):*

- `unitycatalog · api/all.yaml · v0.5.0` — `SecurableType` enum (metastore, catalog,
  schema, table, function, volume, registered_model, external_location, credential)
  and the `Privilege` enum. The authoritative list of securables (cite `all.yaml`,
  not the generated `api/Models/SecurableType.md` stub, which has no enum body).
- `unitycatalog · examples/cli/src/main/java/io/unitycatalog/cli/utils/CliParams.java · v0.5.0`
  — exact CLI flags: `--name`, `--url`, `--credential_name`, `--aws_iam_role_arn`,
  `--storage_root` (underscores, not hyphens).
- `unitycatalog · examples/cli/src/main/java/io/unitycatalog/cli/{CredentialCli,ExternalLocationCli}.java · v0.5.0`
  — the `credential create` / `external-location create` command dispatch.
- `unitycatalog · connectors/spark/src/main/scala/io/unitycatalog/spark/UCSingleCatalog.scala · v0.5.0`
  — the Spark catalog class the "try this at home" Spark config references.
- `unitycatalog · build.sbt · v0.5.0` — artifact id `unitycatalog-spark`,
  `hadoopVersion` default `3.4.2`, Scala `2.13.17`; note the Spark-version-qualified
  module name (`unitycatalog-spark_<spark>_2.13`). `version.sbt` = `0.5.0-SNAPSHOT`.
- `unitycatalog · compose.yaml`, `docs/docker_compose.md` · v0.5.0 — the documented
  local-run path is `docker compose up -d` (server `:8080`, UI `:3000`); the
  `unitycatalog/unitycatalog:latest` tag is real, `:all-in-one` is not (see §9).

*Prior art / related:*

- Our own **Trust in your Open Lakehouse** post (`blogs/trust-in-your-open-lakehouse/`)
  covers credential vending as one of three governance patterns. This post is the
  concrete, product-anchored companion to that argument — link it; don't re-derive
  the vending theory, point back to it.
- Martin Fowler, "TwoHardThings" (https://martinfowler.com/bliki/TwoHardThings.html)
  — the "naming things is hard" reference already in the draft.
- Cambridge Dictionary definition of *agency* (already cited in the draft).

*External refs:*

- UC deployment docs — source is `docs/server/deployment.md`; the canonical URL is
  likely `https://docs.unitycatalog.io/server/deployment/` (verify — the draft links
  `/deployment/` without the `/server/` segment).
- PR https://github.com/unitycatalog/unitycatalog/pull/1374 "feat: add example for
  IAM everywhere setup" — **closed, never merged**; its example is not in-tree. Use
  only as background, not as an authoritative setup reference (see §9).

## 7. Call to action

Run OSS Unity Catalog locally (the corrected "try this at home"), register your own
external location + credential, and make credential vending the default in your
platform. Secondary: read the Trust post for the governance theory behind vending.

## 8. Publishing target / format

unitycatalog. Constraints: a concept/how-to post (fact/command-dense), so the §6/§9
verification matters most; front matter portable per §3; the Spark/CLI snippets want
`snippets/` extraction once corrected so they're runnable and version-pinned. TD Das
flagged SEO: the title/subtitle must contain the real search terms ("External
Location", "Credentials", "Unity Catalog") — reflected in the working title above,
which replaces the confusing "Managing storage / managed storage" wordplay.

## 9. Verification / accuracy notes

The draft's runnable section has verified inaccuracies (checked against the local
`unitycatalog` checkout, 2026-07-03) — **fix during drafting against `v0.5.0`, do not
ship as-is:**

- **CLI flags use underscores, not hyphens.** Draft has `--aws-iam-role-arn` and
  `--credential-name`; actual are `--aws_iam_role_arn` and `--credential_name`.
- **`unitycatalog/unitycatalog:all-in-one` does not exist.** No such tag in the repo;
  the documented local-run path is `docker compose up -d`. `:latest` is real. Rewrite
  the "get an instance running" step accordingly (or verify an `all-in-one` image on
  Docker Hub out-of-band before relying on it).
- **Spark/dependency versions are stale.** Draft pins `unitycatalog-spark_2.13:0.4.0`
  and `hadoop-aws:3.4.0`; repo is `0.5.0(-SNAPSHOT)` with `hadoop-aws` default
  `3.4.2`. Bump and re-verify; account for the Spark-version-qualified artifact name.
- **The S3/IAM setup step is a literal `TODO`** in the source. PR #1374 (the intended
  reference) is closed/unmerged, so its example isn't in-tree — either find where the
  IAM-everywhere example actually landed or write a minimal, verified setup.
- **"Managed location" is not a securable type** — it's a `storage_root` property on
  catalog/schema. Phrase it as a property/root, not a securable, for accuracy.
- The trailing Spark builder snippet in the source is orphaned (no heading/context);
  either integrate it into "try this at home" or drop it.
- Verify the deployment-docs URL (`/server/deployment/` vs `/deployment/`).
- Compile/run every corrected snippet against `v0.5.0` before publish (§6/§10).

## 10. Open questions / risks

Reviewer comments to resolve during drafting (from the source doc):

- **Terminology (Alex Jiang ×3, TD Das):** "Managing storage / managed storage" title
  is confusing wordplay → replaced in the working title. The **managed-vs-external
  location** distinction "needs to be made more clear" and "contextualized more" — the
  draft makes it seem like the only difference is naming; sharpen it (managed = UC owns
  the physical layout/lifecycle; external = you point UC at storage you already own).
  **"Agents need agency"** collides with the now-dominant AI-agent meaning — reframe
  the heading (e.g. "Every principal needs agency" / "Identity and access").
- **Messaging (Michelle Leon):** hit the "UC managing storage simplifies your life and
  should be the default" message harder in the conclusion.
- **SEO (TD Das):** ensure the real keywords (External Location, Credentials, Unity
  Catalog) are in the title/subtitle — done in the working title; keep through drafting.
- **Disclosure / COI:** Databricks-authored post about Databricks-originated OSS (Unity
  Catalog). Disclose affiliation per the target's requirement (§10 conventions).
- **Series?** Standalone for now. This is plausibly the seed of a "Unity Catalog
  Concepts" series (the source doc has sibling tabs); don't create a SERIES.md arc
  until those earn briefs. Note the overlap with the Trust post explicitly instead.
