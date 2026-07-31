---
title: Unity Catalog storage — credentials, external locations, and managed storage
slug: unity-catalog-storage
status: draft
tags: [unity-catalog, governance, lakehouse, devrel]
author: Robert Pack
target: unitycatalog
---

<!--
Imported from Google Doc "Unity Catalog Concepts", tab "Storage" (t.0), 2026-07-03,
then reframed and corrected per author direction and the doc's reviewer comments:
- "managing storage / managed storage" wordplay retitled (Alex Jiang, TD Das: SEO);
- "Agents need agency" reframed to avoid the AI-agent collision (Alex Jiang);
- managed-vs-external distinction sharpened (Alex Jiang);
- "try this at home" commands corrected against the OSS unitycatalog v0.5.0 ref
  (CLI flags, docker path, dependency versions) — see brief.md §9.
Runnable snippets should be re-verified against v0.5.0 and extracted to snippets/
before publish. See brief.md for the full source-verification log.
-->

# Unity Catalog storage: credentials, external locations, and managed storage

**Unity Catalog turns storage from a liability into a default-safe path.** Instead of
scattering long-lived cloud keys and hand-maintaining bucket ACLs, you describe your
storage with three small primitives — credentials, external locations, and managed
storage — and let the catalog vend short-lived, downscoped access on demand. This post
walks those primitives and ends with a local instance you can try yourself.

## Key takeaways

- Almost everything in a lakehouse is **just files** — data, tables, notebooks, ML
  models, even agent extensions — so governing storage access is *the* foundational
  problem, not a detail.
- Unity Catalog models storage with three primitives: a **credential** (a secret for a
  bucket), an **external location** (a URL plus a credential), and **managed storage**
  (the catalog owns the physical layout so you don't have to).
- **Grants** assign privileges to principals; **credential vending** then hands a
  client a short-lived, downscoped token instead of a long-lived key.
- The payoff: powerful long-lived credentials live in exactly one place, users only
  ever hold short-lived downscoped ones, and a policy change takes effect almost
  immediately — no key rotation, no ACL sprawl.

## Always use the handrail

Safety only works when the safe path is the default path. When I worked near one of my
previous employer's manufacturing sites, you could spot colleagues even off the clock:
on any staircase, we'd walk in a neat line, holding the handrail as if our life
depended on it. Even a single step had a prominent sign telling you to hold on. I found
it funny at first — until you watch trains, cars, autonomous vehicles, and drones all
moving through confined space at one of the biggest manufacturing sites in the world,
and you realize safety has to be an automatic reaction, not a case-by-case judgment
call.

Your lakehouse is no different. A plethora of file-based assets has to be stored,
discovered, accessed, and governed, and I learned the hard way to assume everything I
build will end up in production — so I default to the safe practice every time. Use
version control for code. Handle authentication and authorization properly for every
remote service. Reach for the handrail. This post is about how Unity Catalog makes the
safe path the easy one for storage: streamlining collaboration across data teams,
keeping the security office happy, and removing a pile of day-to-day friction.

## It's all just files

Storage sits at the heart of every lakehouse, because nearly everything you touch along
the data value chain is a file on disk — data files, open tables, notebooks, ML models,
and, lately, the skills and extensions that agents run on. That makes storage the most
foundational building block in the architecture, and a reliable source of pain for the
people who operate it:

- Credentials get committed to repositories.
- Naming conventions and folder structures don't age well.
- User groups, access-control lists, and policies sprawl uncontrollably.

…and the list goes on. Unity Catalog (UC) mitigates all of these with a small set of
abstractions — the storage equivalent of always taking the handrail. Two of them are
the base you build everything else from:

- A **credential** is exactly what it sounds like: some secret that establishes trust
  with another service — here, a storage bucket (a "container", in some clouds).
  Passwords, tokens, and certificates are all flavours of credential.
- An **external location** is essentially a URL that references a storage path (say,
  `s3://my-bucket/path`) together with a credential to access it.

In many ways, that's already it. UC composes those two primitives into the
higher-level things you actually work with, each of which is *just a path within an
external location*:

- **Tables** — a path where the table's files live, ideally in an open table format
  like Delta or Iceberg.
- **Volumes** — a path holding arbitrary files.
- **Models** — you guessed it: files, ideally in an open, interchangeable format like
  ONNX.

## External vs. managed storage: who owns the layout?

The difference between an external location and managed storage is *who decides where
the bytes go*. With an external location, **you** own the storage and point UC at a
path you've already laid out. With **managed storage**, UC owns the physical layout: it
chooses the paths and lifecycle for the tables and volumes you create, so you never
have to invent a bucket structure or a naming scheme for physical files.

That matters more than it sounds, because [naming things is
hard](https://martinfowler.com/bliki/TwoHardThings.html) — and once you've named
something, you tend to regret it soon after. Managed storage makes the physical layout a
two-way door: you name your catalog, schema, and table at the logical level, and UC
handles the sustainable physical storage schema underneath. Fewer irreversible
decisions, less bikeshedding, a layout that stays coherent as the estate grows.

## Identity first, then authorization

Every principal that operates on a data platform needs *agency* — the ability to take
action — and agency starts with identity. A principal (a person or a machine) proves it
is who it claims to be, typically through an Identity Provider (IdP); that's
**authentication**. Deciding whether that principal may perform a given action — say,
read from a specific storage location — is a separate step: **authorization**.

Authorization is where storage tends to get hairy:

- Handing storage credentials (like access keys) directly to users bypasses
  authentication entirely.
- Access controls work as a binary switch at the bucket level, but don't scale to the
  path or file level.
- Access expressed in semantic terms (catalog / schema / table) is hard to keep in
  sync with physical storage as the estate grows.

This is where two more pieces come in: a securable called **grants**, and a
conceptually simple but surprisingly powerful pattern called **credential vending**.

## Grants and credential vending

A **grant** assigns a privilege to a principal — nothing more exotic than that:

```sql
GRANT CREATE CATALOG ON METASTORE TO engineering
```

**Credential vending** is what happens when that principal actually reaches for data.
Rather than holding a standing key, the client acquires a token from your IdP — outside
UC, fully owned by your org — to prove its identity to UC. It then asks UC for access
to a specific asset and receives a **downscoped token, valid for a limited time**, for
just the storage location where that asset lives. Two properties make this worth
adopting as the default:

- The client only ever proves *identity*; it never receives a credential with a large
  blast radius.
- A policy change propagates almost immediately — the longest delay is the lifetime of
  an already-vended token. No credential invalidation or rotation required.

## Try this at home

You can run all of this locally against the open-source Unity Catalog. Start an
instance with the project's Docker Compose setup (server on `:8080`, UI on `:3000`):

```bash
docker compose up -d
```

<!-- TODO(verify): confirm the compose file / images against the pinned v0.5.0 ref
before publish; the original draft used a `unitycatalog/unitycatalog:all-in-one`
image that does not exist in-tree. See brief.md §9. For deployment options see
https://docs.unitycatalog.io/server/deployment/ (verify the exact path). -->

Define a convenience alias so you can drive the `uc` CLI without a local build:

```bash
alias uc='docker run -it --network="host" unitycatalog/unitycatalog:latest ./bin/uc --server http://localhost:8080'
```

For the example to be meaningful you need real storage to persist to, so create an S3
bucket and an IAM role UC can assume.

<!-- TODO: minimal, verified S3 + IAM-role setup steps. The doc pointed at
unitycatalog PR #1374 ("IAM everywhere") but that PR was closed unmerged, so its
example is not in-tree — write a minimal verified setup or link one that landed.
See brief.md §9/§10. -->

Register the credential (note the underscore flags):

```bash
uc credential create \
  --name my-s3-credential \
  --aws_iam_role_arn arn:aws:iam::123456789012:role/my-data-role
```

Register the bucket as an external location that uses it:

```bash
uc external-location create \
  --name my-s3-data \
  --url s3://my-bucket/data \
  --credential_name my-s3-credential
```

Now point Spark at the catalog to read and write through UC. This uses UC's Spark
catalog with OAuth, vending credentials for the external location on demand:

```python
builder = (
    pyspark.sql.SparkSession.builder.appName("external-credential")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.spark_catalog", "io.unitycatalog.spark.UCSingleCatalog")
    .config(f"spark.sql.catalog.{catalog_name}", "io.unitycatalog.spark.UCSingleCatalog")
    .config(f"spark.sql.catalog.{catalog_name}.uri", f"{workspace_url}")
    .config(f"spark.sql.catalog.{catalog_name}.auth.type", "oauth")
    .config(
        f"spark.sql.catalog.{catalog_name}.auth.oauth.uri",
        f"https://accounts.cloud.databricks.com/oidc/accounts/{account_id}/v1/token",
    )
    .config(f"spark.sql.catalog.{catalog_name}.auth.oauth.clientId", clientId)
    .config(f"spark.sql.catalog.{catalog_name}.auth.oauth.clientSecret", secret)
    .config("spark.hadoop.fs.s3.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
    .config("spark.sql.defaultCatalog", catalog_name)
)

extra_packages = [
    "io.unitycatalog:unitycatalog-spark_2.13:0.5.0",
    "org.apache.hadoop:hadoop-aws:3.4.2",
]

spark = configure_spark_with_delta_pip(
    builder, extra_packages=extra_packages
).getOrCreate()
```

<!-- TODO(verify): the artifact may carry a Spark-version qualifier
(unitycatalog-spark_<spark>_2.13) at v0.5.0; confirm the exact coordinate and that
0.5.0 / hadoop-aws 3.4.2 are what a reader should use. Extract to snippets/ and run
it before publish. See brief.md §9. -->

## Summary: make the safe path the default

Use Unity Catalog to keep a registry of external locations and the credentials that
reach them, and you can meet your data and security teams' growing demand for secure,
governed access across the whole estate:

- Long-lived, powerful credentials stay contained in a single place.
- Users only ever use short-lived, downscoped credentials to reach tables and volumes.
- Managed storage keeps the on-disk layout well-structured — and it should be your
  default, not an afterthought.

Credential vending is one of three governance patterns I've argued for at the platform
level; if you want the theory behind *why* the catalog should vend rather than hand out
keys, see [Trust in your Open Lakehouse](../trust-in-your-open-lakehouse/). Then go
reach for the handrail: run the local instance above, register your own external
location, and make vended, downscoped access the default in your platform.

<!-- CTA note: primary CTA is "run OSS UC locally + adopt vending as default";
secondary is the Trust post. Finalize once the "try this at home" steps are verified. -->
