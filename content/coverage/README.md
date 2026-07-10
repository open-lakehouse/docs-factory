# content/coverage/ — the documentation coverage tracker

This directory is the **backlog and status ledger** for the delta.io and
unitycatalog.io documentation overhaul. It answers two questions:

1. **What should we cover?** — every Delta/UC feature and concept that deserves a
   page, derived from the published upstream sources.
2. **How far along are we?** — the status of each planned page and example.

It is *planning metadata*, not published content. Nothing here renders on the
preview site (`content/coverage/` is not a project bucket, so `site/src/sidebar.mjs`
ignores it).

## Files

- `delta.yaml` — fully enumerated Delta Lake backlog (all named table features +
  the docs.delta.io user-facing topics + foundational concepts).
- `unitycatalog.yaml` — **skeleton only**. High-level buckets, all `todo`. Expand
  after the Delta vertical slice lands.

## Why YAML

Machine-readable so tooling can validate it (see *Future automation* below) and so
it mirrors the existing `research/table-formats/delta-matrix.json` style. It is also
diff-friendly in PRs.

## Source-of-truth policy (read this before editing)

**Published upstream sources are authoritative** for what exists and what to cover:

| Source | Role |
|---|---|
| Delta [`PROTOCOL.md`](https://github.com/delta-io/delta/blob/master/PROTOCOL.md) | Canonical named-feature list + structural concepts. |
| [`docs.delta.io`](https://docs.delta.io/latest/) | User-facing feature docs / the topic checklist. |
| [Databricks docs](https://docs.databricks.com/aws/en/tables/) | Managed-platform framing + maintained feature-compatibility table. |

The internal research report (`research/table-formats/report.md`,
`delta-matrix.json`) is a **secondary, lower-confidence artifact** — much of it is
single-sourced. It **must not drive this backlog**. Use it only as an optional hint
for engine-support annotations, and when you do, tag it explicitly:

```yaml
duckdb: { status: todo, support: r, support_source: "research-report (unverified)" }
```

Any concrete `support` value **requires** a `support_source:`. Prefer the engine's
*own* published docs; leave it `unknown` until you have one.

## Entry schema

Each item under `topics:` looks like:

```yaml
- id: deletion-vectors            # stable kebab-case key
  feature: deletionVectors        # PROTOCOL.md identifier, or null for non-feature topics
  feature_class: reader-writer    # reader-writer | writer-only | n/a
  title: Deletion vectors
  priority: p1                    # p0 core | p1 common | p2 advanced
  sources:                        # PUBLISHED sources that document this topic
    protocol: true
    docs_delta_io: "What are deletion vectors?"
    databricks: "delta/deletion-vectors"
  pages:                          # planned Diataxis coverage; path OR via (shared page)
    explanation: { path: delta/explanation/deletion-vectors.md, status: todo }
    how-to:      { path: delta/how-to/enable-deletion-vectors.md, status: todo }
    reference:   { via: delta/reference/table-features.md, status: todo }
    tutorial:    null
  examples:                       # per-engine demonstrations
    python: { status: todo, support: unknown }
    # ... polars / duckdb / rust / spark
  notes: ""
```

**Vocabularies:**

- page / example `status`: `todo · drafting · draft · published · partial · blocked · n/a`
- `feature_class`: `reader-writer · writer-only · n/a`
- example `support`: `rw · r · w_partial · none · unknown` (default `unknown`)
- `priority`: `p0 · p1 · p2`
- `pages.<bucket>.path` must use a valid Diataxis bucket: `explanation`,
  `tutorials`, `how-to`, `reference` (matching the `content/<project>/` layout).
  Use `via:` instead of `path:` when the coverage lives on a shared page (e.g. many
  features are summarized in `delta/reference/table-features.md`).

## Workflow — keep it current

1. **Update status in the same PR as the change.** When a content page or example
   lands (or moves from draft to published), flip its `status` here in the same
   commit — the same discipline the repo already applies to regenerating
   `site-artifacts/`.
2. **New protocol feature → new `todo` topic.** Watch `PROTOCOL.md`. When Delta
   adds a named feature, add a topic entry (even if it stays `todo` for a while) so
   the backlog never silently falls behind the spec.
3. **Verify support before you claim it.** Never set an example `support` to a
   concrete value without a `support_source:`. If an engine can't run an example
   (e.g. a client that can't open a deletion-vectors table), mark that example
   `status: blocked` with a note rather than pretending it works.
4. **Prioritize by tier.** `p0` foundations first (they unblock everything), then
   `p1` common features, then `p2` advanced/type-support features.

## Future automation (intent — not built yet)

A planned `docsnip coverage` subcommand will make this ledger self-checking:

- **Fail** if a `content/**` page exists with no matching tracker entry (drift the
  other way — undocumented pages).
- **Warn** if a tracker entry claims `published` but the referenced page `path` or
  example file does not exist.
- Cross-check every `delta.yaml` `feature:` against the named features in
  `PROTOCOL.md` so a spec addition surfaces as a lint failure.

Until that lands, the checks in the plan's *Verification* section are run by hand.
