# Front-matter schema

Both `brief.md` and `index.md` open with a YAML `---` block. Field names align with
MkDocs Material / Docusaurus so a post ports to a real publishing target with
minimal reshaping. This mirrors `blogs/CONVENTIONS.md` §3 — that file wins if they
ever diverge.

```yaml
---
title: <Working title>
slug: <kebab-slug>
status: idea | draft | ready
date: <YYYY-MM-DD>            # last touched; advances as the post matures
tags: [<from tags.yml>, …]    # every tag MUST exist in blogs/tags.yml
series: <arc name>            # omit if the post is standalone
series_order: <n>             # omit if standalone
author: <Full Name>           # real person; the byline. never "Admin"
target: <delta | unitycatalog | openlakehouse | …>
---
```

Where a post is *emitted* (a published site) is recorded per target in
`blogs/<slug>/.emitted.json`, not in front matter (a draft can go to several
targets; the SEO canonical `<link>` is the publishing site's concern). See
CONVENTIONS.md §5, "Emit to a downstream target".

- **`tags`** — every tag must exist in `blogs/tags.yml`. Reuse before coining; if
  none fits, add the new tag (with a one-line description) to `tags.yml` in the same
  change. Never let a tag live only in a post.
- **`author`** — the named author byline (a real person, never "Admin"; QUALITY.md
  facet (e)). The visible bio/credentials and the `Person`/`sameAs` Microdata are
  supplied by the **publishing target** at release, not duplicated per post — see
  QUALITY.md's publish-target section.
- **`status`** advances through the lifecycle; `date` is the last-touched date.
