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

**Thesis:** an agent factory is a distributed system whose workers are
nondeterministic and wrong some of the time. It's safe only if the deterministic
control plane around them is right, so that's where verification goes. We model
the control plane, check our Rust against the model, and then point the same
model at Unity Catalog servers we didn't write.

The outline, the sources and the open questions are in [`brief.md`](brief.md).
