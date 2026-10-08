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
stay as they are. After a bump:

1. CI runs every script against the new image. A failure is a behavior claim
   to fix.
2. Re-verify R01's known issues. Move fixed rows to a short "Fixed in 0.7.0"
   note for upgraders, which drops out one release later. Add the new release
   to the **Affects** column of rows that still reproduce.
3. Re-read the "since" and "or later" boundaries the release changes.

## Drafting against the next release

Some pages can only be written against a release that isn't out yet, such as
the deployment guides that rely on 0.7's health endpoints. The manifest's
`next:` block holds that release, any pins only it has (the Helm chart, which
versions on its own cadence), and the folders written against it:

```yaml
next:
  release: 0.7.0
  pins:
    unitycatalog-chart: 0.1.0
  paths:
    - content/unitycatalog/how-to/012-deploy-docker-compose/
```

Files under `paths` are checked against `next`, and everything else against
the current release. A page under `paths` must stay a draft: `docsnip check`
fails if one is `ready` while the block exists. While a released artifact is
missing, the test harness builds a stand-in for it from the release branch.
`just bump-uc 0.7.0` folds the block into the manifest. After that the pages
are ordinary drafts that can be approved, and their tests use the published
artifacts.

The same scheme carries over to the Delta docs when they land: a
`content/delta/release.yml` and its own rule set.
