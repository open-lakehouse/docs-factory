# Docs-site emission

**Status:** built for Unity Catalog (`sites/unitycatalog-docs/`, `emit/docs/`).
**Scope:** `emit/docs/`, `emit/targets/docs-site.mjs`, `sites/`.

We used to plan on emitting `content/unitycatalog/` into the upstream UC MkDocs
site ([`unitycatalog-documentation-plan.md`](./unitycatalog-documentation-plan.md)
§11). That would drop most of what the factory renders: callouts, tabs,
journeys, LikeC4, code chrome, and the agent-facing surfaces (`.md` twins,
`llms.txt`, JSON-LD, sitemap). So we emit into a **dedicated static docs site**
instead. Its shell lives in this repo at `sites/<name>/` until it gets its own
repository or replaces the upstream docs.

## The split: smart emitter, simple shell

The factory already owns parsing, snippet resolution, identity, navigation, head
metadata, hashing, and twins. The emitter applies all of that and writes
**fully resolved artifacts**. The shell only renders them and imports nothing
from docs-factory, so it can move to another repo unchanged.

| Emitter-owned path (gitignored here) | Contents |
| --- | --- |
| `src/content/<bucket>/<slug>.md` | Page Markdown with snippets inlined, links mapped to site routes, and `:::` directives kept. |
| `src/generated/site.json` | Navigation tree and page list (route, title, section trail, headings, prev/next). |
| `src/generated/heads.json` | Per-route `<head>` from `content-core/head.mjs` `pageHead()`. |
| `src/vendor/plugins/` | Verbatim copies of the preview's directive plugins (`site/src/plugins/`). |
| `public/` | `.md` twins, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `robots.txt`, `scripts.json` + scripts, images, LikeC4 PNGs and web component. |
| `.docs-emit.json` | The emit manifest (below). |

The shell owns everything else: layout, components, styles, and the prerender
build. Each route is rendered to `dist/<route>.html` with its head tags and full
content, then hydrated.

## Why pages stay Markdown

The preview's directive plugins (callouts, tabs, tldr, journey, likec4) emit
MDX nodes that can't be serialized back to text. One of them, the journey body,
is a custom node. So instead of emitting JSX, the `docs-site` target keeps the
page in its authored shape. The emitter vendors those plugins into the shell,
and the shell runs them at build time.

This gives us:
- **One renderer.** A page renders the same in the preview and on the site.
- **Readable PRs.** A PR into the target repo diffs as a docs change rather than as JSX.
- **Convention 6 holds** (richness is a property of the renderer).

The cost: the plugins import their components from
`@/components/{callout,tldr,content-tabs,journey,LikeC4View}`, so those module
paths and export names are part of the contract between the emitter and the
shell.

## Selection and URLs

- A publish emit takes `status: ready` pages (`isPublic()`), with no DB
  involved. `--drafts` adds `draft` pages for a local preview. `idea` pages and
  `planned:` nav slots never ship.
- `emit/docs/sites/<site>.mjs` `hrefFor(identity)` is the only URL mapping.
  Every route, canonical, twin, sitemap entry, and rewritten link goes through
  it. The factory builders (`pageHead`, `sitemapUrls`, `toEntry`, `scriptEntry`,
  `remark-source-links`) take it as an option and default to the preview's own
  routes.
- A link to a page this emit doesn't publish (an unready page, another project,
  a typo) **fails a publish emit**. With `--drafts` the emit only warns. Either
  way the link is unwrapped to its label, so the site never ships a 404.
  `model:` links become plain text until the site has model pages.

## Full regeneration, minimal writes

Every run renders the whole site in memory, so a failure leaves the target
untouched. Then the sync:
- writes only files whose bytes differ **from disk**, so a hand edit is
  overwritten;
- deletes files the previous manifest listed that this run didn't produce;
- refuses any path outside the emitter-owned set.

Rendering is deterministic: an unchanged source writes zero files, LikeC4 PNGs
included.

`.docs-emit.json` records:
- `source`: the commit, and whether `content/` or the model had uncommitted changes;
- per page: source path, route, `contentHash` / `rootHash` (from
  `content-core/pipeline.mjs` `entryFor`), per-section hashes, and output files;
- `files`: path → sha256 for every emitter-owned file.

The change report (`--report <file.md|file.json>`) diffs this against the
previous manifest:
- **Added / removed pages.**
- **Renamed:** same `contentHash`, new route.
- **Changed:** source hashes differ. The report lists the exact sections that
  changed.
- **Render-only:** same source, different output bytes. This means the emitter,
  nav, or shell contract changed.

Section hashes come from the **rendered** page, not from the Merkle tree. The
tree hashes a `file=` snippet by its whole source file, so one edit would flag
every section quoting that file. The rendered page has only the quoted regions
inlined, so its hashes name exactly the section a reader sees change.

## Deferred

- **Search:** Pagefind over the built `dist/`.
- **Redirects:** for legacy MkDocs paths (plan §7 migration map) and for renames
  the manifest records.
- **Shell CI:** a build job for the shell (it needs Chromium for the LikeC4 export).
- **Gating:** DB `released` gating for publish emits.
- **Versions:** versioned docs (per UC release).
- **External delivery:** emitting into an external repo, which is `--out <dir>`
  plus a PR whose body is the report.
- **Model pages:** model-entity pages and `explains:` context (the agentic-docs Phase 2 equivalent).
