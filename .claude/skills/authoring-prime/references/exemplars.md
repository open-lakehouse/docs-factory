# Exemplars

Pages to imitate, by content type. Find the type you are writing, read only
its pages, and study the listed pattern. If a listed page has moved, take
another `ready` page of the same type from `content/<project>/nav.yml`. If the
type is unclear, ask.

All paths are repo-relative. Every docs exemplar is `status: ready`, so its
scripts gate CI and its claims render.

## Docs

### Tutorial

- `content/unitycatalog/tutorials/001-getting-started/index.md`: the minimal
  shape. One happy path, `:::prerequisites` with tools only, a `::::journey`
  whose steps are exactly what the reader types, and the environment step left
  to the emitter.
- `content/unitycatalog/tutorials/005-first-python-function/index.md`: a
  multi-step tutorial that builds state. Side information (what a call does,
  where it runs) goes in `:::note`/`:::tip`, and each step's region is one
  interactive-session input.

### How-to

- `content/unitycatalog/how-to/004-manage-catalogs-and-schemas/index.md`: the
  reference how-to (`content/README.md` names it). It shows the anatomy:
  intro, prerequisites, `## Set up the client`, one imperative `##` per task
  with interface tabs, required privileges, and next steps.
- `content/unitycatalog/how-to/006-manage-volumes/index.md`: a CLI tab
  backed by a region-marked `.sh` and its `_cli.py` driver
  (`verifies = "volumes.sh"`), with consequences called out.
- `content/unitycatalog/how-to/009-python-dataframes/index.md`: several
  client libraries on one task, where each tab is a claim in the
  compatibility matrix.

### Explanation

- `content/unitycatalog/explanation/004-external-and-managed-tables/index.md`:
  `explains: lakehouse.table`, the concept's one canonical page, with
  `references:` to the specs and engines it relates and a LikeC4 diagram. It
  stays engine-neutral, with no steps.
- `content/unitycatalog/explanation/002-credential-vending/index.md`: a
  mechanism explained with a `likec4` sequence diagram from
  `docs-views.likec4`, ending where its guarantees end.

### Reference

- `content/unitycatalog/reference/001-features-and-limitations/index.md`
  (R01, `private`): the internal record of known issues (with **Affects** and
  the error string), absences, and scope. Published pages never link it; they
  state a limitation inline only when it blocks their task.

### Landing / overview

- `content/unitycatalog/explanation/001-what-is-unity-catalog.md`: the
  project's entry concept. It gives an answer-first intro and points readers
  to the next tutorial and how-tos.

## Blogs

Grouped by front matter `post_type`. Types without an exemplar yet (`how-to`,
`comparison`, `benchmark`) borrow the closest: a blog how-to reads like the
docs how-tos above, with the author's voice.

### `essay`: opinion or argument

- `blogs/uc-metric-views/index.md`: a first-person stance carried by an
  analogy (entropy), a `:::tldr` that links the tutorial, and a `::::journey`
  walkthrough with tested snippets. It ends on what the author learned.

### `essay`: platform or concept

- `blogs/uc-volumes/index.md`: argues why a primitive matters (volumes for
  agents) in a few long sections, with voice over citability.

### `announcement` / `deep-dive`

- `blogs/unity-catalog-delta-api/index.md`: a fact-dense `:::tldr`, a
  getting-started path early, then the API in detail with two journeys and a
  wrap-up.
