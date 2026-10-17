# author — Omnigent agent for blog posts and docs pages

An [Omnigent](https://omnigent.ai/docs/use/custom-agents) multi-agent workflow
for both kinds of content in this repo:

- **blog**: an author's dump (thoughts, a rough structure, ideas, links) becomes
  a review-ready draft in `blogs/<slug>/index.md`.
- **docs**: a page path, a `planned:` nav slot, an accepted content request, or
  a model element becomes a tested page under `content/<project>/`.

It drives the same lifecycle as the repo skills. The roles are shared and each
dispatch names its kind, while the procedure lives in skills (`blog-post` /
`blog-review` for blogs, `docs-write` / `docs-review` for docs, plus
`authoring-prime`, `docs-query`, `humanizer`, and `review-feedback`). The
criteria stay in `blogs/QUALITY.md` and `docs/design/docs-quality.md`, which
the agents read instead of restating.

## Run

From the repo root (host skills and every path in the prompts resolve from
the cwd):

```bash
omni run ./agents/author/
```

Then:

- **Blog:** paste the dump. Name a slug if you have one ("slug:
  uc-row-filters"), and say "run straight through" to skip the plan gate.
- **Docs:** name the target, for example "write planned slot H03 in
  unitycatalog", "fill content request <id>", "explain lakehouse.volume", or
  "fix the privileges table in content/unitycatalog/how-to/006-manage-volumes".
- **Revise:** `revise <slug>` or `revise <page path>` works the review-app
  threads on it.

`cross_reviewer` and `answer_probe` run on the `codex` harness, so they need
an OpenAI/Codex provider (`omnigent setup`). Without one the orchestrator says
so and continues with Claude only. The reviser's MCP needs a review token
(`just feedback login`). Completing content requests needs `requests:write`.

## Phases

| # | Phase | Blog | Docs | Gate |
|---|---|---|---|---|
| 1 | Plan | `planner`: plan + outline skeleton in `index.md` | `planner`: context pack (`docsnip query`, journeys, pins, env, R01) + placement plan | author confirms the plan |
| 2 | Write | `writer`: full draft, verified `snippets/` | `writer` (`docs-write`): page, scripts and claims, `nav.yml`, `compat --fix` | |
| 3 | Review | `reviewer` (`blog-review`) ∥ `cross_reviewer` (a, c, d); one revise pass | `reviewer` (`docs-review`) ∥ `cross_reviewer` (a, b); one revise pass | |
| 4 | GEO | `answer_probe` → `geo_optimizer` → voice check | (none; facet f covers citability) | |
| 5 | Hand-off | branch `blog/<slug>` | branch `docs/<project>-<slug>` | author approves; push and PR ask by policy |
| 6 | Revise | `reviser` (review-feedback MCP) | same, plus rerunning scripts and completing requests | |

A trivial docs edit (a typo, a link, one value) skips Plan, and its review runs
`docs-review` in `lite` mode without the cross-review.

Guardrails, as config:

- `reviewer` and `cross_reviewer` can't write files.
- `planner`, `writer`, and `reviser` may write only under `blogs/`,
  `content/`, and `architecture/model/views/`, and never
  `content/<project>/compatibility.json`, which `docsnip compat --fix`
  regenerates. `envs/`, `architecture/dist/`, and `sites/` are out of reach,
  so a needed environment change comes back as a finding.
- `geo_optimizer` writes only under `blogs/`.
- The orchestrator writes nothing.
- Pushes and `gh pr create` ask for approval (`blast_radius`).
- Only the reviser sets `status: ready`, and only for approved content.

## Layout and the skill seam

```
config.yaml, prompt.md       orchestrator (author)
agents/<role>/config.yaml    one sub-agent per role, instructions in prompt.md
agents/<role>/skills/<n>/    bundled skills: always loaded for that role
```

Each role's `skills:` list filters which repo skills (`.claude/skills/`) it
sees. A repo skill wins over a user-global one with the same name, so the
roles get this repo's `humanizer`. Bundled skills under `agents/<role>/skills/`
load regardless, and `geo_optimizer/skills/geo` is the one bundled skill.
Shared procedure belongs in a repo skill. A prompt only says which kind
does what.

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
for d in [Path('agents/author'), *sorted(Path('agents/author/agents').iterdir())]:
    r = validate(parse(d, expand_env=False))
    print(d.name, 'ok' if r.valid else r.errors)
"
```
