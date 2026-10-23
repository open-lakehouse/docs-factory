# Drafting rules

Apply these to every docs page `docs-write` touches. Keep them in context
while drafting. The criteria behind them are in
[`docs/design/docs-quality.md`](../../../../docs/design/docs-quality.md). The
mechanical subset is enforced by `uv run docsnip prose`.

## The reader

- Write for the reader doing the task, not the engineer who built the
  feature. Say what they configure, run, or check. Leave out how the server
  brokers a token or which class handles a request. Test each sentence: does
  the reader do anything differently for knowing this? If not, cut it.
- Procedures are numbered steps, or one imperative `##` per task (how-tos).
  Each step is one action with the exact command, field, or value. Never use
  section headings as a substitute for steps.
- A step you can't write concretely is a missing fact. Leave
  `<!-- TODO(open question): … -->` and report it. Never paper over it with
  vague wording. A third-party console flow (AWS IAM, an IdP) needs its source
  or an SME.

## Facts

- State only what the context pack backs: a script assert, a claim, a model
  element, `release.yml`, or an upstream source pinned to `blob/vX`. Don't
  invent flags, defaults, limits, or error strings.
- Versions come from `release.yml` through the pinned command. In prose, a
  number marks a boundary only ("requires 0.4.0 or later"). Never write "In
  0.7.0…", "currently", or "not yet".
- Lead with what works. A limitation goes inline only when it blocks this
  page's task, stated as the condition then the action. Everything else is
  recorded in R01's known issues, a private page the draft never links.
- Name things as the model does. When a name is overloaded (the Unity Catalog
  specification versus the OSS server), say which one.

## Shape

- Present tense, active voice, second person, contractions allowed. One
  thought per sentence. Split a semicolon-joined pair.
- Sentence-case headings: H2 for tasks or main ideas, H3 for detail, no H4
  outside reference pages.
- Every code block is a `file=` fence and has a lead-in sentence ("To create
  the catalog, run:"). The one inline exception is the pinned command that
  opens the session (`uv run --with unitycatalog-client==0.7.0 python -m asyncio`),
  whose pin `docsnip versions` checks. How-tos show the session command without explaining
  shells. Tutorials put side information in `:::note`/`:::tip`.
- `:::prerequisites` lists only tools to install (linked) and assumed state.
  The emitter adds Docker and the stack line, so never describe starting a
  server.
- Bold is for UI labels and definition-list terms, not emphasis.
- Links: other docs pages by relative URL slug, with the `NNN-` prefix
  dropped (`../manage-volumes/index.md`, `../../tutorials/python-client/index.md`).
  Link concepts by `[label](model:<id>)` and external sources by pinned URL. The link
  text is the target's topic, never "here".
- Close a how-to or tutorial with two or three next steps: the next task in
  `nav.yml`, and the concepts the page's element relates to (`docsnip query
  explain` `out`/`in`), each with a verb that says what the reader does there
  ("Manage volumes", "Learn how credential vending works").
- Keep Databricks-only concepts out of task text.

## Scope

- Stay inside the work order. Don't restructure or add sections nobody asked
  for. Report what you'd change instead.
- Frontmatter: `title` (≤60 chars), `summary` (≤160 chars, an answer),
  `diataxis`, `project`, `status: draft` on new pages, `explains:` on an
  explanation, `references:` for the other elements it discusses.

## Generated files

Never hand-edit these. A hand edit is reverted on the next regeneration.
Change the source:

| Generated | Source |
|---|---|
| `content/<project>/compatibility.json`, `<!-- compat:… -->` blocks | script claims, `architecture/journeys/`, and `compatibility.yml` → `uv run docsnip compat --fix` |
| `envs/<name>/` renders, `plan.json`, `diagram.png`, `diagram.trestle-graph.json` | `envs/<name>/env.toml` → `just env-render <name>` (snapshot via `docsnip envs --fix`) |
| `envs/environments.generated.json` | `uv run docsnip envs --fix` |
| `architecture/dist/**` | `architecture/model/**` → `just arch-model` |
| `sites/**`, `site/src/generated/**` | the emitter and site build |

Pins across pages are rewritten by `just bump-uc` / `just bump-delta`, never
by hand.
