# Cross-estate patterns

The estate is organized by repo, but its **identity is these three opinionated
seams** that recur across repos. Each repo is an *application* of them; hydrofoil
is where several get composed into one experience. In the model these are tags
(`pattern-composition`, `pattern-agentic-cli`, `pattern-composable-ui`) on the
repos that apply them.

Frame them as **established-and-converging** — real today, still settling — not as
a finished standard.

## 1. Composition

**Compose independently-built pieces into one consolidated whole rather than
building monoliths.** Services, DataFusion integrations, and UIs are each
assembled, not fused.

- **Seam:** narrow port traits + a `Provides*` compile-time DI pattern (established
  in trestle) + `Arc<dyn Trait>` boundaries, so a piece can be swapped or reused.
- **Applied by:** trestle (establishes it), mangrove, headwaters, hydrofoil.
- **Exemplar:** hydrofoil composes services and multiple DataFusion integrations
  into a single consolidated session (the `session` component).
- **Status:** established; the estate's core design stance.

## 2. Agent-optimized CLIs

**Ship CLIs in two registers:** the classical one that mirrors API endpoints, and
an **agent-optimized** one that formats output for agent digestion and reframes the
surface as actionable, task-shaped verbs — so the lakehouse is genuinely usable
*by* AI, not just about it. This is where "open lakehouse **and ai**" is real
effort.

- **Seam:** a multi-mode render (table / json / agent), an interpreted `agent`
  envelope that prunes noise and appends `_next` follow-up hints, a `schema`
  capabilities primer, task-shaped **question-verbs** (return the answer, not an
  endpoint dump), structured JSON errors + stable exit codes.
- **Lead application:** headwaters' `hw` (ADR-0014, `docs/agent-cli-design.md`).
- **Aspiring:** mangrove (`uc`/`uc-server`) and others, still mostly
  endpoint-mirroring.
- **Downstream:** pairs with an agent harness (Databricks Omnigent).
- **Status:** emerging — `hw` is the strongest application today.

## 3. Composable / headless UI

**Build reusable, ideally headless UI components with pluggable seams, then wrap a
thin per-service app around them** — the UI analogue of service composition. The
same components should compose into one consolidated experience (in hydrofoil),
just as services compose into a session.

- **Seam:** shadcn components distributed by copy; headless presentational
  components + versioned data-fetching logic behind a **design-token contract**
  written as a `design.md` (per the
  [google-labs-code/design.md](https://github.com/google-labs-code/design.md)
  convention) — a machine-readable file fixing semantic token names/meanings that
  also teaches agents how to use the components.
- **Applied by:** mangrove (`node/ui-kit/DESIGN.md`), headwaters
  (`node/lineage-ui`), hydrofoil (`node/ui/DESIGN.md`).
- **Status:** established & converging; hydrofoil's consolidated experience is the
  direction of travel.

---

*These correspond to the `patterns:` block in `writing/estate/estate.yml`. That
file is being superseded by this model as the source of structural fact; the
narrative framing of these patterns lives in the writing estate's `storyline.md`.*
