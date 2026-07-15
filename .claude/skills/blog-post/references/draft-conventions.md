# Draft conventions (`draft.md`), cross-repo sourcing, series

Condensed from `blogs/CONVENTIONS.md` §5–§7 — that file wins if they diverge. For
what "good" looks like as a scored rubric, see `blogs/QUALITY.md`.

## Draft (`draft.md`)

- **Voice.** First person, authored, opinionated — a stance is a feature. State the
  point of view; don't hedge into neutrality.
- **Structure.** Lead with the hook/thesis; short sections with **descriptive,
  sentence-case H2s**; baseline-first, defer depth; end on the call to action.
- **Code samples.** Minimal, real, pulled from a cited ref; prefer a compiling
  excerpt over a sketch; label the language; show only the load-bearing lines.
  Verify against the pinned ref before publish.
- **Linking.** Link source code at a **pinned permalink** (commit or tag, not a
  moving branch); link the prior art you're responding to and the CTA target. Link
  on first mention; don't over-link; use **descriptive anchor text**.
- **Front matter** present; keep the body portable across targets.

## Diagrams as code — LikeC4 preferred

Author diagrams in [LikeC4](https://likec4.dev) (`assets/*.likec4` is the source of
truth) and commit both the source and the rendered image in the post's `assets/`, so
the draft renders without a build step. This matches the `docs-factory` repo's
architecture model, which adopted LikeC4 as its canonical source of architectural
fact.

- **Sequence diagrams** are a LikeC4 `dynamic view` — ordered
  `source -> target "label"` steps. Render with **`--sequence`** for a real lifeline
  layout; without it the static export falls back to a box-and-arrow graph
  ([likec4#2532](https://github.com/likec4/likec4/issues/2532)):
  `npx likec4 export png --sequence -o . blogs/<slug>/assets` (static export needs a
  headless Chromium once: `npx playwright install chromium`). `likec4 start <dir>`
  opens the interactive viewer.
- Keep a post's diagram **self-contained in its `assets/`** unless it truly belongs
  in the shared `docs-factory` model (whose logical layer is deliberately ref-free
  and technology-agnostic — protocol/wire detail stays in the post).
- Reference the rendered image from `draft.md` as `![alt](./assets/<name>.png)` with
  real alt text; regenerate a different export (SVG, inline) at publish if the target
  needs it.
- **D2** ([d2lang.com](https://d2lang.com)) stays fine for an existing `.d2` or a
  quick one-off: commit `.d2` + `.svg`, render with `blogs/render-diagrams.sh` (needs
  `brew install d2`). Prefer LikeC4 for new diagrams.

## Runnable examples (one supported way)

When a code sample is worth *running*, keep the runnable file in the post's
`snippets/` — it is the verified source of truth; `draft.md` shows only the
load-bearing lines and links to it. Name files `<verb>_<subject>.<ext>`. Every
snippet opens with a header comment: what it does, `Run:`, `Needs:`, and the pinned
ref it was `Verified:` against.

- **Python — inline deps, run with `uv`.** Declare dependencies inside the `.py` in
  a [PEP 723](https://peps.python.org/pep-0723/) `# /// script … # ///` block, so a
  reader copies the file and runs `uv run <file>.py` — no venv or `pip`.
  `dependencies` is required (use `[]` if none); set `requires-python` and **pin
  dependency versions** (a committed snippet is a reproducible artifact). Edit with
  `uv add --script <file>.py '<pkg>'`. Note: `uvx` is `uv tool run`, for *published*
  tools — **not** local files; use `uv run`.
- **Services — Docker Compose.** Run backing services with `docker compose up -d`;
  prefer the upstream `compose.yaml` at a pinned image tag, and document the ports.
- **Shell / REST — capture, don't hand-write.** A REST snippet is a real captured
  transcript; use `curl -sS --fail-with-body`; pass secrets/endpoints as named env
  vars, never inlined.
- **Verify before publish**, and record it in the header's `Verified:` line + the
  brief's §9. There is deliberately **no build/run script** (unlike diagrams) — the
  examples are few and several need live services. `blogs/CONVENTIONS.md` §5 is the
  fuller version; it wins if they diverge.

## Cross-repo source material

Blogs draw on code across many repos, so cite it precisely — never a bare
"see delta-rs":

```
repo · path/to/file_or_dir · PR #/commit/tag — what it shows
delta-kernel-rs · kernel/src/scan/mod.rs · v0.3.0 — scan-state builder
```

Pin the ref to a **tag or commit SHA**, not a branch, so a snippet is reproducible.
Pointers rot — re-verify each at publish time. When a real, compilable excerpt is
worth preserving separately, keep it in the post's `snippets/`; otherwise a fenced
block inline in `draft.md` is enough.

## Series / story arcs

When a post is part of a multi-post narrative, record the arc in `blogs/SERIES.md`
(name + through-line + ordered post list) and set `series`/`series_order` in the
front matter. Each post must **stand on its own** — a reader landing mid-arc
shouldn't be lost — while advancing the arc: open with a one-line "previously /
where this fits" and link prev/next. Keep the arc's thesis in `SERIES.md` so
individual briefs don't drift from it.
