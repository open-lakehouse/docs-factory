---
title: The agentic factory is a distributed system. Check it like one.
slug: agentic-factory
status: idea
tags: [agents, formal-methods, rust, unity-catalog, delta-lake]
author: Robert Pack
post_type: essay
audience: Engineers building agent orchestration or catalog servers, who know Rust and have heard of TLA+ but haven't used a model checker.
summary: Agents in a factory are wrong some of the time; its control plane can't be. We model it, check our Rust against it, and check other catalogs the same way.
---

This brief collects what the post could cover. It's early. The verification
work it describes is proposed, not built (lakehouse-data PR #109), so the post
waits for at least the first model and its counterexample.

## 1. Hook / thesis

- An agent factory is a distributed system. Its workers are LLM sessions that
  are nondeterministic and wrong some of the time. It's safe only if the
  deterministic control plane around them is right, and that's what we model
  and check.

## 2. Audience

- People building agent orchestration (factories, multi-agent harnesses) or
  catalog servers.
- They know Rust and async, and they've heard of TLA+ and Jepsen. They haven't
  run a model checker themselves.

## 3. Tone / voice

- First person, opinionated. The stance is that prompts and evals don't make an
  agent system safe. Prompts steer the workers. The guarantees come from a small
  deterministic core, and that core should be held to distributed-systems
  standards.
- Honest about the gaps. The best material is our own documented limit: "run
  one reconciler per store".

## 4. Key takeaways

- Keep the LLM out of scheduling. Executors are pure state machines
  (`next(cx) -> actions`). That's what makes the factory checkable at all.
- Write the guarantees down as invariants: one lease holder, one session per
  step, approval binds a revision, fail closed. Then check them by machine.
- Start cheap. Reference-model property tests catch most drift. Model checking
  goes to the protocol. Proofs are for a few pure functions.
- One executable model can check our own code and someone else's server.
  Catalog-managed Delta commits are the example.
- Agents can draft the models. A person approves the invariant list, and the
  checker decides.

## 5. Outline

1. **Your agents will be wrong, so where does safety live?** The factory loop
   in one diagram: plan, approve, reconcile, sessions, PRs, gates. Mark which
   parts are deterministic.
2. **Executors are pure state machines.** The `NodeExecutor` trait and the
   reconciler pass. Code sample: the trait.
3. **The guarantees, written as invariants.** F1–F7 from the proposal: lease,
   one session per step, ready set, approved revision, retry once, watcher
   resume, fail-closed authz.
4. **The lease we knew was wrong.** `lease_run`'s own doc comment, the
   two-reconciler counterexample from the model, and the fencing fix checked by
   the same model. Code sample: the model's step and the trace. This section
   waits for V3.
5. **A ladder of checks.** Reference-model tests, then Quint and Apalache, then
   quint-connect into Rust, then shuttle and turmoil, then Kani. What each costs
   and what it caught.
6. **Checking catalogs we didn't write.** Catalog-managed commits: the RFC's
   invariants, mangrove's coordinator, the acceptance battery across our
   server, UC OSS Java and managed Databricks. What diverged. This section
   waits for V4.
7. **Agents write models, people approve invariants.** The 8.6% result, and
   the "model it" task kind.
8. **What's next.** Offering the commit model to delta-io, and the call to
   action.

## 6. Source material

- *Code (cross-repo):*
  - luminescent-lakehouse · crates/factory-core/src/factory.rs#L965-L1009 · 2c71fe1b1d63 — `lease_run`, "run one reconciler per store"
  - luminescent-lakehouse · crates/factory-core/src/driver/mod.rs#L10-L15 · 2c71fe1b1d63 — create-or-find by labels
  - luminescent-lakehouse · crates/factory-server/src/reconciler.rs#L1-L32 · 2c71fe1b1d63 — the pass, and executors as state machines
  - luminescent-lakehouse · docs/factory/execution.md · 2c71fe1b1d63 — "An LLM makes no scheduling decision"
  - mangrove · crates/delta-api/src/coordinator.rs#L1-L39 · 5c2d871710aa — the coordinator's six invariants, and the drift from the prose spec
  - mangrove · crates/delta-api/src/testing/coordinator_conformance.rs · 5c2d871710aa — one suite over every backend
  - mangrove · crates/acceptance · 5c2d871710aa — the battery across three targets
  - delta-kernel-rs · delta-kernel-unity-catalog/src/committer.rs · 68d50edf6b52 — a client of the same protocol
  - lakehouse-data · docs/proposals/formal-verification.md · PR #109 — invariants F1–F7 and C1–C7, the layers, the order
  - lakehouse-data · omnigent/docs/research/2026-11-formal-verification.md · PR #109 — tools and prior art, with sourcing marks
- *Prior art:*
  - Bornholt et al., "Using lightweight formal methods to validate a key-value storage node in Amazon S3", SOSP 2021: reference models, 16 issues stopped before production
  - Davis, Hirschhorn, Schvimer, "eXtreme Modelling in Practice", PVLDB 2020 (arXiv 2006.00915): test generation worked, trace-checking didn't
  - Jack Vanlightly, table-formats-tlaplus: Delta copy-on-write in TLA+, but nothing on catalog-managed commits
  - Our own posts: `omnigent-agent-scoping` (who owns an agent), `agentic-lakehouse`, `trusted-lakehouse`, `unity-catalog-delta-api`
  - How this post differs: agent-safety writing is mostly about prompts, sandboxes and evals. This post is about the control plane as a distributed protocol.
- *External refs:*
  - Delta `protocol_rfcs/accepted/catalog-managed.md` (delta-io/delta b53f6dd3d65b), the commit protocol
  - Cirstea, Kuppe, Loillier, Merz, "Validating Traces of Distributed Programs Against TLA+ Specifications", arXiv 2404.16075
  - Bisharat et al., "Can LLMs Write Correct TLA+ Specifications?", arXiv 2606.05792
  - Quint (quint-co/quint), quint-connect (informalsystems/quint-connect), Kani, shuttle, turmoil, proptest-state-machine

## 7. Call to action

- Read the commit model, and run it against your own catalog.
- Tell us about invariants your agent system relies on that nobody checks.

## 8. Publishing target / format

- Probably `openlakehouse` as primary, with a cross-post to `unitycatalog` for
  the catalog section. Or split it in two (see open questions).
- Essay length, two code samples (the executor trait, a model step), one LikeC4
  view of the loop.

## 9. Verification / accuracy notes

- Every factory claim must hold at the cited commit when the post is drafted.
  The lease gap may be fixed by then, which is the story, so cite both commits.
- Don't publish counterexamples or divergences in UC OSS or managed Databricks
  before they're filed upstream and acknowledged.
- The factory runs on internal services (Omnigent, factory-staging). Describe
  the framework (public, luminescent-lakehouse), not our deployment's names,
  hosts or identities.
- Tool versions and paper numbers come from the research doc. Re-check its 🔎
  claims before citing them.

## 10. Open questions / risks

- One post or two: the factory's control plane, then validating catalogs with
  one model.
- How much of the agent-safety literature (TraceFix, VMAO, SOTERIA) to engage.
  It's unread so far.
- Disclosure: we work on UC and Delta, and the post tests other
  implementations of them. Frame divergences as spec ambiguities found
  together, not scores.
