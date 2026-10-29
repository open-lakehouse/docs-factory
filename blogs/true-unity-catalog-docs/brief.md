---
title: The true Unity Catalog docs
slug: true-unity-catalog-docs
status: draft
tags: [unity-catalog, delta-lake, lakehouse]
author: Robert Pack
target: unitycatalog
post_type: deep-dive
audience: Data and platform engineers evaluating Unity Catalog OSS who have read conflicting claims about what works with it
summary: Every claim in the Unity Catalog docs is a script CI runs against the pinned release, so what works, and what doesn't, is proven rather than asserted.
---

## 1. Hook / thesis

The community argues about what does and doesn't work with which catalog; we
built Unity Catalog docs that may only state what a script proved, so the docs
are the answer to that argument.

## 2. Audience

- Data and platform engineers choosing or running Unity Catalog OSS with more
  than one engine, who have seen forum threads, slide decks, or comparison
  posts disagree about feature support.
- Secondary: docs and DevRel people who want to build docs this way.
- Assumes: what a catalog and a table format are, basic CI. Not assumed: our
  harness, PEP 723, or how the docs sites are built.

## 3. Tone / voice

First person, opinionated, a little combative about misinformation but never
about other projects. The stance: "works with" is a claim that needs evidence,
and a failure is as useful a fact as a success. Databricks teaches us to be
truth-seeking; this post shows what that looks like as engineering, not a
slogan. Honest about the limits (what we haven't covered yet).

## 4. Key takeaways

- Every code block on a docs page is a region of a script CI runs against the
  pinned release; the page references the script, nothing is copied.
- Support tables are rendered from claims scripts make, including claims that
  something *fails*; the script asserts the failure, so CI notices the day an
  engine adds support.
- Deployment architectures (local server, simulated S3 + PostgreSQL) are
  generated, versioned environments the same scripts run against.
- One release manifest pins every version; a bump is a CI run plus a review of
  every claim the release can change.
- Known issues live in one place, with the exact error string a reader sees.

## 5. Outline

1. The true Unity Catalog docs — the debate, truth-seeking, the rule.
2. Every code block is a test — fences + regions + PEP 723 (code sample).
3. One harness, many languages — runners and CI lanes.
4. Claims, not adjectives — compatibility claims, `fails`, rendered tables
   (code sample: a claims block).
5. A failure is a fact too — known issues with error strings.
6. Deployments are tested like clients — generated environments.
7. Metadata that keeps pages honest — frontmatter, nav, release manifest,
   git-ready-is-release. (No C4 model: separate post.)
8. A renderer that only shows what's proven — emitter, docs sites, `.md`
   twins, `llms.txt`, embedded tables.
9. Up to the agentic lakehouse — what's next (placeholder until built).
10. What to do with this — CTA.

## 6. Source material

*Code (this repo, pin to the merge commit before publishing):*
- docs-factory · `content/conftest.py` — runs every snippet script as a test;
  drafts run as `xfail`, ready pages gate.
- docs-factory · `.github/workflows/ci.yml` — lanes `scripts-default`,
  `scripts-spark`, `scripts-jvm`, `scripts-rust`, `scripts-services`.
- docs-factory · `tools/docsnip/src/docsnip/cli.py` — `docsnip check` =
  validate + snippetcheck + versions + compat + prose.
- docs-factory · `tools/docsnip/src/docsnip/compat.py` — claims → tables; a
  `fails` string must appear in the script.
- docs-factory · `content/unitycatalog/compatibility.yml` / `.json` — 10
  interfaces, 64 journeys, 6 tables (Delta: 8 interfaces, 52 journeys).
- docs-factory · `content/unitycatalog/how-to/008-duckdb/` — exemplar page +
  `snippets/duckdb_tables.py` with works and fails claims.
- docs-factory · `content/unitycatalog/reference/001-features-and-limitations/`
  — known issues tables.
- docs-factory · `content/unitycatalog/release.yml` — release 0.7.0 + pins;
  `just bump-uc`; `docs/design/docs-versioning.md`.
- docs-factory · `envs/environments.yml`, `envs/unitycatalog/`, `envs/uc-aws/`
  — Trestle-generated environments.
- docs-factory · `emit/docs/emit-docs.mjs`, `sites/` — emitter and static sites.
- docs-factory · `docs/decisions/ADR-0002-git-ready-is-release.md`.

*Counts (re-measure before publishing):* 36 content pages; 50 Python snippet
scripts, 10 shell, 8 SQL, 1 each Scala/Java/Rust.

*Prior art:* executable docs (doctest, mdBook `{{#include}}`, Rust doc tests,
mkdocs snippets): those test that code runs; we additionally make the support
claims and tables derive from the tests.

## 7. Call to action

- Before believing (or posting) "X doesn't work with Unity Catalog", check the
  compatibility tables on docs.unitycatalog.io and run the linked script.
- Found a wrong cell? Open an issue with a failing script; it becomes a test.

## 8. Publishing target / format

unitycatalog.io blog (MDX via `blog-emit`). ~2,000–2,500 words. `:::tldr`
must be in the site's callout TYPES (see UC site callout gap). Link the docs
site pages, not repo paths, if the repo isn't public.

## 9. Verification / accuracy notes

- Re-count pages, scripts, journeys, interfaces at publish time.
- Confirm docs.unitycatalog.io is live with these pages at `ready` before
  linking; today most pages are drafts.
- Confirm whether docs-factory is public; if not, describe the mechanism and
  link only published docs.
- Check the DuckDB claims against the then-current pins (DuckDB 1.5.4 today);
  the post's example must match the live table.
- **Blocking before publish:** coverage up to the agentic lakehouse (agents,
  MCP, AI functions) must exist and be tested; section 9 is a placeholder.

## 10. Open questions / risks

- Tone: fighting misinformation must not read as attacking other catalogs or
  engines. Keep examples about our own matrix.
- Do we name specific "myths"? Prefer phrasing as questions we see asked.
- The C4 model and metadata graph get their own post; keep it out here.
