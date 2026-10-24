# Versioning the docs: latest only, one manifest

The emitted docs sites describe **one release per project: the current one.**
We don't publish archived per-version snapshots. Since version numbers rarely
appear in prose, a release bump is a pin rewrite plus a CI run, not an edit
to every page.

## Why latest only

Every runnable example is a CI test against a pinned server image, so a page
is only as true as the release it's tested against. Keeping an older version
of the site would mean keeping its test stack running too, or publishing pages
nobody checks anymore. Two alternatives were rejected:

- **A branch per minor release**, emitted to `/0.6/`, `/0.7/` with a version
  switcher. This multiplies the CI matrix and backport work while the projects
  are pre-1.0 and readers mostly run the latest release.
- **Conditional blocks in the source** (`:::version{since=0.7}`). This needs
  scripts that are tested against several servers, and it fragments pages
  that should read as one.

Readers on an older server get history in three places: boundary phrasing in
the pages, the **Affects** column of R01's known issues, and upstream release
notes.

## The rules

1. **The release is stated once.** `content/unitycatalog/release.yml` holds it,
   together with the companion pins (Python client, Spark connector,
   delta-spark, PySpark, and the Iceberg spec). Readers see it in the
   environment title that the emitter puts in every `:::prerequisites` box
   ("Unity Catalog 0.6.0", from `envs/environments.yml`). Prose doesn't repeat
   it.
2. **Prose uses a version only as a boundary.** For example: "requires 0.4.0 or
   later", "deprecated since 0.6.0", "fixed in 0.7.0". A version that scopes a
   statement ("In 0.6.0 the server…", "as of 0.6.0", "a 0.6.0 server answers…")
   becomes present tense, because the release is implied.
3. **Version-specific facts have a fixed place:**
   - R01 (*Features, scope, and limitations*): support state and known issues.
   - R02 (*Choose a client or engine*): the compatibility matrix.
   - Version tables such as H07's Spark coordinates.
   - Exact pins in commands and scripts.
   - Upstream links pinned to `blob/vX` or `tree/vX`, so a cited source line
     doesn't move on `main`.
4. **Commands pin exactly.** A reader's `uv run --with unitycatalog-client==X`
   matches what CI runs. A range is also a shell redirect when unquoted.
5. **Known issues have a stable anchor** (`#known-issues`). Each server row
   says which releases it **Affects**. Third-party rows keep the client
   version they were verified with, since the defect depends on it.

## Tooling

`docsnip check` runs `docsnip versions` (`tools/docsnip/src/docsnip/versions.py`):

- **Pins (error).** Every pin under `content/unitycatalog/`, `envs/`, and the
  site config has to match the manifest:
  - image tags
  - Python and Maven pins
  - `blob/vX` links
  - environment titles
  - the REST API `ref`

  A UC package installed with a range in a page is also an error.
- **Prose (warning).** A bare release number in tutorial, how-to, or
  explanation prose that has no boundary wording. Code, tables, link URLs, and
  a package's version (`` `unitycatalog-client` 0.6.0 ``) don't count.

`just bump-uc 0.7.0` moves the manifest, along with every pin that tracked the
old release, and rewrites all matches. The R01 rows and third-party versions
stay as they are. The pin rewrite is half of a bump; the
[release review](#release-review) is the other half.

The Delta docs use the same scheme with their own manifest,
`content/delta/release.yml`, and rule set (`DELTA` in `versions.py`). Their
release is Delta Spark's. `pyspark`, `deltalake`, and `duckdb` are pins, the
latter two versioned independently: `just bump-delta 4.5.0` moves the release,
and the other pins change in the manifest followed by `docsnip versions --fix`.
Delta has no environment title yet, so its pages name the versions in their
prerequisites (`` `deltalake` 1.6.6 ``), which the rules also check.

## Release review

CI catches a behavior a script asserts. It can't catch a sentence saying what a
release lacks: "the server has no groups" stays in the page after a release
adds them. So a bump PR also re-reads the claims a release can change. The
`release-bump` skill (`.claude/skills/release-bump/`) runs this procedure;
[release-bump-agent.md](release-bump-agent.md) sketches the agent it could
become.

### Keep pages evergreen

The less prose depends on the release, the less a bump has to re-read:

- Describe what the server does. A statement of absence ("doesn't implement
  X", "has no API for Y") is release-sensitive. Its home is R01, in *Not in
  Unity Catalog OSS* or the known issues. Other pages link there instead of
  repeating the list.
- Don't write "yet", "currently", or "for now". They date the page without
  telling the reader when it changes.
- When a script can pin a limitation with an assert, add one, so CI reports
  the fix.

### After a bump

1. CI runs every script against the new image. A failure is a behavior claim
   to fix.
2. Find what changed upstream. Diff the API spec (`api/all.yaml`) between the
   old and new tags, and read the release notes, for new endpoints, securable
   types, `TableType` values, and privileges. For Delta, look for new table
   features and new engine write support.
3. Re-verify R01's known issues. Move fixed rows to a short "Fixed in 0.7.0"
   note for upgraders, which drops out one release later. Add the new release
   to the **Affects** column of rows that still reproduce.
4. Re-read the release-sensitive pages below, then grep the rest of the
   project for absence wording (`doesn't`, `not supported`, `no API`,
   `not implemented`, `Databricks`). Check each hit against step 2.
5. Re-read the "since" and "or later" boundaries the release changes.
6. Fix a claim that no longer holds. If it stated an absence outside R01,
   move the absence to R01 and link to it.

The PR description lists every claim reviewed: page, claim, verdict (holds,
changed, or unsure), and evidence (an upstream path at `blob/vX`). An unsure
claim stays unsure in the table for a reviewer to settle.

### Release-sensitive pages

These pages make claims a release can change. A page that adds such a claim
outside R01 joins the list in the same change.

| Project | Page | What to re-check |
| --- | --- | --- |
| unitycatalog | R01 `reference/001-features-and-limitations` | Every section: support state, known issues, *Not in Unity Catalog OSS*. |
| unitycatalog | R02 `reference/002-clients-and-engines` | The client and engine matrix. |
| unitycatalog | E03 `explanation/003-uc-basics` | Securable types, the `TableType` note, the privilege model, principals (no groups or service principals), and the Databricks note. |
| unitycatalog | H07 `how-to/013-metric-views`, T08 `tutorials/008-first-metric-view` | Spark's metric-view limits (YAML version, replace, rename). |
| unitycatalog | H47 `how-to/012-iceberg-rest` | Which tables the Iceberg endpoint serves; UniForm. |
| unitycatalog | H12 `how-to/020-run-functions` | On a `unitycatalog-ai` bump: the one-client `gather` deadlock, the process-wide `nest_asyncio` patch (uvloop), `close()` not closing the connection, `async def` registration, `EXECUTOR_DISALLOWED_MODULES` parsing, the sandbox's blocked imports, limits, and kill signals, local-mode result caching, the list-argument remedy, and the Python 3.12 advice. |
| delta | `reference/090-coverage`, `reference/001-table-features` | Engine support per feature. |
| delta | `how-to/003-append-and-overwrite-data` | DuckDB's write limits. |
