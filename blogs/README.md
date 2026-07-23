# Blogs

Authored, opinionated long-form posts and the research behind them — DevRel
writeups, deep dives into the open-lakehouse stack, and shorter pieces. This is
the landing space for blog ideas and drafts that otherwise scatter across the
sibling code repositories.

One folder per post; cross-cutting concerns live here at the `blogs/` root.

## Layout

```
blogs/
  README.md          # this file — cross-cutting concerns + post index
  CONVENTIONS.md     # how we write blogs — the process (voice, lifecycle, review)
  QUALITY.md         # the review rubric — the criteria (facets a–f, what "good" is)
  IDEAS.md           # ideas backlog — raw ideas parked before they earn a brief
  SERIES.md          # story arcs — multi-post narratives and their order
  tags.yml           # known-tag registry — the authoritative tag vocabulary
  <slug>/
    brief.md         # research/planning before prose (front matter + brief)
    draft.md         # the post itself, Markdown (source of truth)
    assets/          # OPTIONAL, on demand — images/diagrams
    snippets/        # OPTIONAL, on demand — extracted, verified code samples
```

## Posts

| Title | Folder | Series | Tags | Status | Target |
|---|---|---|---|---|---|
| Trust in your Open Lakehouse | [`trust-in-your-open-lakehouse/`](./trust-in-your-open-lakehouse/) | Building the Open Lakehouse (1) | governance, lakehouse, agents | draft | company blog |
| Unity Catalog storage | [`unity-catalog-storage/`](./unity-catalog-storage/) | — | unity-catalog, governance, lakehouse, devrel | draft | company blog |
| The UC Delta API | [`unity-catalog-delta-api/`](./unity-catalog-delta-api/) | — | unity-catalog, delta-lake, iceberg, lakehouse | draft | company blog |

## Workflow

The frontmatter status is **idea → draft → ready** (review happens in the review
app, tracked in the DB review lifecycle — not via frontmatter). Ideas are parked in
[`IDEAS.md`](./IDEAS.md); an idea earns its own `<slug>/` folder — at `status: idea`
early (worth ranking/reviewing before it's briefed), or with a `brief.md` at
`status: draft` — once you can write its one-line thesis and name its audience.
Voice, structure, cross-repo sourcing, the humanizer pass, and the multi-agent
quality-review pass are all written up in [`CONVENTIONS.md`](./CONVENTIONS.md) (the
*process*), with the scored quality criteria in [`QUALITY.md`](./QUALITY.md) (the
*rubric*).

Two skills execute this workflow (in `../.claude/skills/`):

- [`blog-post`](../.claude/skills/blog-post/) — author a post through the
  lifecycle (idea → draft → ready). Run it to start or continue a post.
- [`blog-review`](../.claude/skills/blog-review/) — the multi-agent review pass
  (dispatch → score → consolidate over facets a–f). Run it before marking a post
  `status: ready`.

Both skills read `CONVENTIONS.md` + `QUALITY.md` rather than restating them.

- Ideas backlog: [`IDEAS.md`](./IDEAS.md)
- Story arcs: [`SERIES.md`](./SERIES.md)
- Tag vocabulary: [`tags.yml`](./tags.yml)
- Process & review pass: [`CONVENTIONS.md`](./CONVENTIONS.md)
- Quality rubric: [`QUALITY.md`](./QUALITY.md)

## Relationship to other repos

Blogs routinely draw on code across the sibling repositories (delta-rs,
delta-kernel-rs, iceberg-rust, unitycatalog, arrow-datafusion, …); briefs cite
that code with pinned pointers rather than copying it. Writing that already
lives elsewhere — published posts in `openlakehouse-io` (a live site), draft
narratives in `trestle/examples` — is **tracked as pointers in `IDEAS.md`, not
migrated**. Those repos stay authoritative.
