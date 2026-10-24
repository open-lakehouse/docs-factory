# Front-matter schema

Both `brief.md` and `index.md` open with a YAML `---` block. Field names align with
MkDocs Material / Docusaurus so a post ports to a real publishing target with
minimal reshaping. This mirrors `blogs/CONVENTIONS.md` §3 — that file wins if they
ever diverge.

```yaml
---
title: <Working title>
slug: <kebab-slug>
status: idea | draft | ready | private
tags: [<from tags.yml>, …]    # every tag MUST exist in blogs/tags.yml
series: <arc name>            # omit if the post is standalone
series_order: <n>             # omit if standalone
author: <Full Name>           # real person; the byline. never "Admin"
target: <site> | [<primary>, <cross-post>, …]   # from vocab.json blogTargets
post_type: essay | how-to | deep-dive | announcement | comparison | benchmark
audience: <who it's for and what they already know, one line>
summary: <the answer-first one-liner, ≤160 chars>
---
```

Publish timing is not frontmatter: last-updated comes from registered
`content_version` rows; the intended ship day is RevOps `target_release_date`.
Emit stamps the downstream site's publish date at emit time.

Where a post is *emitted* (a published site) is recorded per target in
`blogs/<slug>/.emitted.json`, not in front matter. A cross-posted post lists every
site in `target:`; the first is the primary, and the emitter points the others'
SEO canonical `<link>` at the primary's copy. See
CONVENTIONS.md §5, "Emit to a downstream target".

- **`tags`** — every tag must exist in `blogs/tags.yml`. Reuse before coining; if
  none fits, add the new tag (with a one-line description) to `tags.yml` in the same
  change. Never let a tag live only in a post.
- **`author`** — the named author byline (a real person, never "Admin"; QUALITY.md
  facet (e)). The visible bio/credentials and the `Person`/`sameAs` Microdata are
  supplied by the **publishing target** at release, not duplicated per post — see
  QUALITY.md's publish-target section.
- **`post_type`, `audience`, `summary`**: the brief's durable fields (CONVENTIONS
  §3). Set them when the brief or plan settles, and keep them in sync if the
  post's type or reader changes. `post_type` must be in `content/vocab.json`
  `postTypes`, and `summary` is at most 160 characters and doubles as the
  published description.
- **`status`** advances through the lifecycle (idea → draft → ready). `ready`
  follows a reviewer's approval in the review app, and merging it to main is the
  release. `private` marks a post that is reviewed but never published; it needs
  no `target`.
