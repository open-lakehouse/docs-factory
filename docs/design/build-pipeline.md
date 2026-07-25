# The content build pipeline

**Status:** design (records the consolidated state after the content-core
refactor).
**Scope:** cross-cutting — `content/`, `blogs/`, `site/`, `tools/docsnip/`,
`server/`.

This document explains how docs-factory turns authored Markdown into the
artifacts its consumers need, and the **content-parsing contract** that keeps
those consumers agreeing with each other. It is the companion to
[`information-system.md`](./information-system.md), which covers how content
*joins the estate model* (tags / `references:` → LikeC4 → entity pages, backlinks,
llms.txt). That document is about **meaning**; this one is about **mechanics** —
parsing, hashing, artifact generation, and the review-DB contract. Neither
repeats the other.

## 1. What the pipeline feeds

Authored content lives in three trees: `content/` (Diátaxis Markdown), `blogs/`
(narrative drafts), and each page's colocated `snippets/` (runnable, tested code
the page inlines via `file=` fences). Four consumers read them:

| Consumer | Reads | Produces |
|---|---|---|
| **`docsnip`** (Python, `tools/docsnip/`) | `content/`, `blogs/` | frontmatter/snippet validation |
| **Preview site** (`site/`, Vite + React + MDX) | `content/`, `blogs/` | the rendered site (live, via `import.meta.glob`) + per-project `*.llms.txt` (prebuild → `public/`) |
| **Version manifest** (`site/scripts/build-version-manifest.mjs`) | `content/`, `blogs/` | `content-versions.json` → the review DB |
| **`emit/`** (bun) | `blogs/` | flattened drafts for downstream targets |

## 2. The content-parsing contract

Four things must be computed **identically** everywhere they are computed,
because comments in the review layer anchor to them and the reader sees them
rendered:

1. **Fence resolution** — turning a `file=/start=/end=` fence into snippet text
   (dedented) plus the source line range it came from.
2. **Heading slugging** — the `id` each heading gets, matching `rehype-slug`
   exactly (including duplicate-heading `-1`/`-2` suffixes).
3. **Path identity** — a content path → `{area, project, bucket, slug}`,
   including folder-mode (`.../<slug>/index.md`), the `NNN-` order-prefix strip,
   and the `slug:` frontmatter override.
4. **Text normalization** — the lowercase/whitespace-collapse used for section
   fingerprints and comment quote/line hashes.

If any two consumers disagree on any of these, the review DB's anchors drift from
the rendered DOM and comments silently mis-anchor.

## 3. Why this was a problem (and the two bugs it caused)

Before this refactor, that contract was **re-implemented in ~6 places across two
languages**, coupled only by hand-maintained "must match X" / "mirror in Y"
comments: `frontmatter.py`/`snippetcheck.py` (Python), `build-version-manifest.mjs`
(Node), `remark-code-snippets.mjs` (render), `content-source.ts` + `content-ref.ts`
(site), and `server/src/anchor.ts` (server). The duplication produced two live
bugs:

- **Folder-mode identity mismatch.** The version manifest derived a doc's slug as
  the last path segment, so `.../001-getting-started/index.md` registered under
  `slug="index"` — a slug the site never requests. Comment anchoring was silently
  dead for every folder-mode page.
- **Dedent divergence.** The render plugin dedented a snippet region for display;
  the manifest did not. The DB stored un-dedented source text and line ranges, so
  code-comment line-hash re-anchoring never matched what the reviewer saw.

## 4. The JS/TS content-core (the authority)

The render-time truth already lived in JS (the remark plugin, `rehype-slug`,
`content-source.ts`) and was already shared with `emit/` (which imports the
remark plugin verbatim). So the contract now lives once, in
**`site/src/content-core/`** — dependency-light, DOM-free, Vite-free ESM that
Node/Bun and the browser can all import:

| Module | Owns |
|---|---|
| `fences.mjs` | `resolveFence()` — the one region resolver + dedent + line range |
| `slug.mjs` | `extractHeadings()` — rehype-slug-identical ids + section bodies |
| `identity.mjs` | `docIdentity()` / `parseDocPath()` — path → identity |
| `normalize.mjs` | `normalizeText` / `fingerprint` / `hashLineSync` |
| `frontmatter.mjs` | `splitFrontmatter` / `hashBody` |
| `walk.mjs`, `pipeline.mjs` | Node-side corpus walk → `buildVersionManifest()` |

Each former copy is now a thin adapter over content-core:
`remark-code-snippets.mjs` parses meta and calls `resolveFence`;
`build-version-manifest.mjs` is a ~20-line CLI over `pipeline.buildVersionManifest()`;
`content-source.ts`/`content-ref.ts` re-export the pure functions. The server
(`anchor.ts`) keeps its own tiny `normalize`/`hashLine` rather than reaching
across the package boundary into `site/` (that would couple the Neon Function
bundle to the site tree) — a **drift test** asserts its copies match content-core,
so the "must match" is enforced by CI, not by comment.

Both bugs are fixed **by construction**: the manifest goes through
`docIdentity` (correct folder-mode slug) and `resolveFence` (same dedented text +
line range the renderer shows).

## 5. Single-source vocabulary

The controlled vocabularies live once in **`content/vocab.json`**:

```json
{ "diataxis": [...], "projects": [...], "statuses": [...], "pageWorthyKinds": [...] }
```

The JS side reads it via `site/src/content-core/vocab.mjs` (Node) and
`site/src/vocab.ts` (browser, Vite-inlined JSON); the Python side via
`tools/docsnip/src/docsnip/vocab.py`. The old hand-mirrored copies in
`frontmatter.py`, `engine-map.ts`, `scope.ts`, and `explain.ts` are gone. Model
element ids are **not** here — they remain sourced from the LikeC4 model
(`architecture/dist/model.json`), a separate authority.

## 6. The stage graph, and what runs where

```
walk content/ + blogs/  ──►  split frontmatter  ──►  per page:
                                                       ├─ docIdentity   (identity)
                                                       ├─ extractHeadings (slug)
                                                       ├─ resolveFence*  (fences)
                                                       └─ validate       (Python: vocab + model ids)
                                                             │
              JS pipeline ──► content-versions.json (the DB contract) + *.llms.txt
              Python      ──► validation report
```

**JS is authoritative** for the render-truth parts (fence ranges, heading ids,
path identity, body/source hashes, normalization) — and now for `*.llms.txt`,
whose published URLs are derived from the canonical `docIdentity`/`parseDocPath`
rather than a Python re-implementation. **Python keeps** what is its own:
frontmatter vocabulary + model-id validation, `explains:` uniqueness, the tag
registry, the PEP 723 `scriptmeta` reader + the pytest tutorial harness, and
snippet marker-uniqueness checks. Rewriting the rest of docsnip or the pytest
harness in JS would be high-blast-radius for no correctness gain; the two
runtimes are instead tied together by `content/vocab.json` and the
cross-language drift tests (§8).

Invocation points: `site/package.json`'s `prebuild` runs the manifest **and**
the llms.txt generator (`site/scripts/build-llmstxt.mjs` → `site/public/`, which
Vite copies into `dist/`); `just version-manifest` / `register-versions` /
`llmstxt` / `check` behave as before.

## 7. The review-DB contract

`content-versions.json` is a build artifact (gitignored), not committed.
`server/scripts/register-versions.mjs` sends each entry to the `RegisterVersion`
RPC, which upserts a `content_version` (keyed on `(area, slug, content_hash)` —
idempotent; a frontmatter-only edit doesn't churn it), replaces its sections and
snippets, and **re-anchors** open comment threads (a 5-tier prose match + a
line-hash code match in `server/src/anchor.ts`; unmatched threads are marked
orphaned, never deleted). Because content-core makes the manifest's sections,
snippet ranges, and identity match the rendered DOM, re-anchoring lands where the
reviewer expects.

The interactive site and its review DB are **not yet released**, so the DB is
disposable: any output change (the two bug fixes both intentionally change output)
is handled by nuking and re-registering (`just db-reset` → `just register-versions`),
with no migration or byte-identical-output constraint.

## 8. Drift tests replace the "mirror in X" comments

The contract is enforced by tests, in two runners:

- **JS** (`bun test`, `site/src/content-core/__tests__/`): `resolveFence` text ==
  the remark plugin's output (incl. indented regions); `extractHeadings` ids == a
  real `rehype-slug` pass; `docIdentity` == `parseDocPath` + `slug:` override for
  every `content/**` path incl. folder-mode `index.md`; `normalizeText`/`hashLineSync`
  == the server and browser formulas; content-core vocab == `content/vocab.json`.
- **Python** (`pytest`, `tools/docsnip/tests/`): docsnip's vocab == `content/vocab.json`;
  docsnip's per-page body hash and derived identity == the JS `content-versions.json`
  (the cross-language contract).

These caught real drift while being written (a leading-newline difference between
the two frontmatter splitters, among others).

## 9. CI shape

- **`content`** — export the LikeC4 model, `docsnip check`, then `bun test src/content-core`.
- **`python-tests`** — the default pytest lane: docsnip drift/vocab tests + the
  colocated tutorial scripts run to completion (`uv run`).
- **`tutorials-services`** — the opt-in Docker lane for service-backed tutorials.
- **`review-api`** — builds `content-versions.json` (via content-core) and
  typechecks the server.
- **`preview-build`** — the full Vite build (exercises the render↔manifest
  agreement end to end).

## 10. Deprecations & deferred work

- **The engine/coverage machinery was removed.** An `engine → LikeC4 implementation`
  map (`ENGINE_ELEMENT`/`IMPL_BY_ENGINE`/`BUILT_ENGINES`) once fed a coverage
  matrix (`examples-manifest.json`). It conflated *language* with *engine*
  ("python → deltaRs" is false for a Python-for-UnityCatalog example; some engines
  are reachable via SQL or Python; some clients need no engine at all), and nothing
  consumed the artifact it produced. It — the map, the `engines:` frontmatter field,
  the `engine-map.ts` module, the AxisIndex engine facet, and the `::::tabs`
  plugin — was dropped.
- **The `examples/` tree was removed.** Its Delta snippets now live colocated under
  `content/**/snippets/` as PEP 723 scripts (tested by the same `content/conftest.py`
  lane); its `examples/rust` crate (a future UC-client stub) was dropped from the
  Cargo workspace.
- **Deferred: a real coverage model.** When the Rust + TypeScript client/example
  machinery is built, reintroduce a deliberate **language × engine × client**
  coverage model — one that distinguishes the language a snippet is written in, the
  engine it drives (if any), and the client library it uses — rather than the flat
  language==engine==implementation mapping removed here.

## 11. Open questions

- Extract `content-core` into a standalone package if a consumer outside `site/`
  ever needs it (today all consumers reach it by relative import, as `emit/`
  already does).
- ~~Whether to eventually move `*.llms.txt` generation into the JS pipeline~~ —
  done: it is a site prebuild step (`site/scripts/build-llmstxt.mjs`) reusing
  `content-core` identity, so the published-URL logic exists once. docsnip is now
  purely the content-contract validator.
