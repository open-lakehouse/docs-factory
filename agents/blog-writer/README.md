# blog-writer — Omnigent agent for blog drafts

An [Omnigent](https://omnigent.ai/docs/use/custom-agents) multi-agent workflow
that turns an author's dump into a review-ready draft. The dump can be
thoughts, a rough structure, ideas, or links. It drives the same lifecycle as
the `blog-post` / `blog-review` / `review-feedback` skills. `blogs/CONVENTIONS.md`
and `blogs/QUALITY.md` stay the source of truth, and the agents read them
instead of restating them.

## Run

From the repo root (host skills and every path in the prompts resolve from
the cwd):

```bash
omni run ./agents/blog-writer/
```

Then paste the dump. Name a slug if you have one ("slug: uc-row-filters"),
and say "run straight through" to skip the plan gate. To work review-app
threads on an existing post, start with `revise <slug>`.

`cross_reviewer` and `answer_probe` run on the `codex` harness, so they need
an OpenAI/Codex provider (`omnigent setup`). Without one the orchestrator says
so and continues with Claude only.

## Phases

One document, `blogs/<slug>/index.md`, evolves from an outline skeleton into
the draft. There is no `brief.md`. The plan travels in the session and lands
in the PR description.

| # | Phase | Agent(s) | Output | Gate |
|---|---|---|---|---|
| 1 | Plan | `planner` | plan + outline skeleton in `index.md` | author confirms plan |
| 2 | Write | `writer` | full draft, verified `snippets/` | |
| 3 | Review | `reviewer` (Claude, `blog-review`) and `cross_reviewer` (codex), in parallel; one `writer` revise pass | merged findings | |
| 4 | GEO | `answer_probe` (codex web search) → `geo_optimizer` (bundled `geo` skill) → `reviewer` voice check | citability edits, `geo.md` | author reviews diff; PR opened |
| 5 | Revise | `reviser` (review-feedback MCP) | edits, PR, thread replies | |

Guardrails, as config:
- `reviewer` and `cross_reviewer` can't write files.
- The other agents may write only under `blogs/`. The writer and reviser may
  also write to `architecture/model/views/` for diagrams.
- The orchestrator writes nothing.
- Pushes and `gh pr create` ask for approval (`blast_radius`).
- The reviser's MCP exposes only list, get, reply, and status.

## Layout and the skill seam

```
config.yaml, prompt.md       orchestrator (blog_writer)
agents/<role>/config.yaml    one sub-agent per role, instructions in prompt.md
agents/<role>/skills/<n>/    bundled skills: always loaded for that role
```

Each role's `skills:` list filters which repo skills (`.claude/skills/`) it
sees. Bundled skills under `agents/<role>/skills/` load regardless. To give a
phase its own procedure, add a bundled `SKILL.md` there. `geo_optimizer/skills/geo`
is the first one. Prefer that over growing a `prompt.md`.

Models aren't pinned. Each harness runs its provider's default. To pin one,
set `executor.model` on that role (check the IDs with `sys_list_models`).
Don't pin the orchestrator, because a pinned brain pins the family its
workers route within.

## Validate

```bash
~/.local/share/uv/tools/omnigent/bin/python -I -c "
from pathlib import Path
from omnigent.spec.parser import parse
from omnigent.spec.validator import validate
for d in [Path('agents/blog-writer'), *sorted(Path('agents/blog-writer/agents').iterdir())]:
    r = validate(parse(d, expand_env=False))
    print(d.name, 'ok' if r.valid else r.errors)
"
```
