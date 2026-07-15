# Estate conflicts & open questions

_Unresolved contradictions and framing questions surfaced while walking the estate —
the input to a **structured interview** that reconciles the estate's divergent
messaging into one storyline. This is the opposite of [storyline.md](./storyline.md):
that file is the resolved, opinionated narrative; this is what's still open._

**Lifecycle (mirrors [`blogs/IDEAS.md`](../blogs/IDEAS.md)).** Each entry is
`- [ ]` open. On resolution, flip to `- [x]`, land the decision in
[storyline.md](./storyline.md) and/or [estate.yml](./estate.yml), and add a
back-pointer here to where it landed. Entry shape:

`- [ ] <conflict> — repos: <a, b> — <competing framings / options> — decision needed`

## Open

_(none — all entries below resolved in the 2026-07-13 interview.)_

## Resolved

_Entries graduate here with the decision and a back-pointer to where it landed.
Resolved in the **2026-07-13 structured interview**._

- [x] **"Names that will change."** The published crate prefixes (`olai-*`,
  `olai-uc-*`) are provisional. **Decision:** the direction of the alias was
  backwards in the map — **call sites use the aspirational, eventual-official
  identifiers** (e.g. `unitycatalog_common`) and `olai-*` / `olai-uc-*` is the
  **defensive publish-time shell** (via Cargo `package =`) that avoids polluting
  official namespaces before community consensus. So the codebase already reads as
  the eventual crates; only the *published prefix* is provisional. **Prose uses
  role-descriptive names** ("the catalog client crate"); literal names (either form)
  appear only in code blocks. → landed in [glossary.md](./glossary.md)
  (naming conventions) and [storyline.md](./storyline.md) (mangrove section).

- [x] **Mangrove's identity in prose.** **Decision: `mangrove` leads** (the repo +
  image name), introduced as "**a pluggable framework for building and integrating
  with UC**"; `unitycatalog-rs` (project) and the crate names are secondary. The
  "UC in Rust" reading stays explicitly ruled out. → landed in
  [glossary.md](./glossary.md) (mangrove terms) and [storyline.md](./storyline.md).

- [x] **Is "agent skills" augmentation built yet?** **Decision: built today** — posts
  may assert Open Sharing "agent skills" as a real, working example of augmenting
  surfaces UC OSS lacks (still pin + re-verify per §6 at draft time). → landed in
  [storyline.md](./storyline.md) (mangrove) and [glossary.md](./glossary.md)
  (augmentation).

- [x] **Who owns the policy story?** **Decision: both, cross-linked by register** —
  **breakwater owns the design story** (the engine-neutral decide/enforce core,
  "plug in, don't fork"); **hydrofoil owns the how-to story** (policy enforced in a
  running host; the ADRs live there). Posts cross-link by register. → landed in
  [storyline.md](./storyline.md) (breakwater + hydrofoil sections).

- [x] **Hydrofoil: product, lab, or hub?** **Decision: the integration hub is the
  canonical framing**; the named "Open Lakehouse" **desktop app is its demonstrable
  face**, not the headline, and never presented as shipped/stable (fork +
  unpublished-crate deps, §6). → landed in [storyline.md](./storyline.md)
  (hydrofoil) and retained in [estate.yml](./estate.yml) `pre_release_note`.

- [x] **Top frame: architecture-first vs governance-first.** **Decision:
  architecture-first** ("assemble OSS + build the gaps") is the confirmed *top* frame
  across the estate, with trust/governance as first-class threads — matching
  [`blogs/SERIES.md`](../blogs/SERIES.md). → landed in [storyline.md](./storyline.md)
  (top-framing note).

- [x] **Pre-release / fork honesty as a standing rule.** **Decision: graduate to a
  standing estate rule** — a short "Status & honesty" note in
  [storyline.md](./storyline.md) defers to `blogs/CONVENTIONS.md` §6 so it is not
  re-litigated per post; per-repo status notes stay in [estate.yml](./estate.yml).
  → landed in [storyline.md](./storyline.md) (Status & honesty).
