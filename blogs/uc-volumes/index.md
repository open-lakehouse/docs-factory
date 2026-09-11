---
title: Unity Catalog Volumes for the Agentic Lakehouse
slug: uc-volumes
status: idea
tags: [unity-catalog, lakehouse]
author: Robert Pack
target: unitycatalog
---
:::tldr
- UC Volumes provide a powerful abstraction for managing unstructured data.
- Volumes are fundamental building block for rich user experiences and storage based services
- Skills, sub-agents, and other file-based AI assets are largely conventions over volumes
:::

The usage of object stores as the storage layer particularly for composable data systems
has been on a continuous rise for several years. For analytical workloads, separated
storage and compute - a key concept of the Lakehouse Architecture - is the de-facto
standard, and even some transactional workloads are following suite.

And while we as a community made great strides managing and governing tabular assets
in object storage via catalogs in recent years, we always kept an escape hatch around.
This escape hatch is plain storage; data pipelines read configuration files, data scientits
develop ideas as scratch files in some personal storage location, and many more examples
where folks need to quickly park something for later use or reference.

Those of you building or using data platforms frequently, will already anticipate the issues
arising from such patterns: missing discoverability and fragmented governance. You will also 
recognize these as challenges we already encountered and solved for tabular assets,
particularly those based on open table formats.

In the following sections we will explore how UC leverages well-established abstractions 
and capabilities to define a Volume securable, and see how Volumes can be leveraged to
create higher-level functionality and user experiences.

## Volumes as platform primitive

Before diving deeper, let's take a more formal look at what Volumes are and what metadata
we associate with it. 

```json file=volume.json
```

The first thing to note is that Volumes are a first class data asset organized within
the catalog/schema hierarchy. As such it is governed and discoverable just like other assets.
In the same vain can supply comments to clarify the intended use of a volume.

The most relevant piece of information though is the storage location. This can be any path under
a previously registered external location or automatically created when the location is `MANAGED`
by Unity Catalog. Using the same credential vending mechanics we already employ for tables via
the temporary credential APIs and of course the UC Delta API and IRC protocol implementation in UC,
we have battle-tested abstractions to negotiate access to volumes.

As we see, using storage credentials, external (or managed) locations, and a path, we have defined
a Volume sbstraction. While this already solves a lot of the aforementioned discoverability and
governance issues we identitifed, it is worthwhile to take a step back and step into the shoes
of someone designing and building an on-prem data platform. What key experiences does this person
want to offer their users?

Going out on a limb here, but likely users expect some sort of notebook environment and maybe 
a SQL editor experience to interact with the data in stored on platform. What does this
have to do with Volumes? Notebooks usually manifest as some sort of file, be it `.ipynb`,
`.json`, or plain `.py` files. In case of a SQL editor, you might want to persist state not only
in the browser, but make it resumable and sharebale by storing it as a `.sql` file. In fact
embedding a text editor to display and edit SQL will get you a long way towards an incredibly
rich editing experience.

By introducing system schemas and or injected configuration into existing tooling, platform
engineers can leverage volumes to build such file-centric experiences with discoverability
and governance build in from the groiund up, not as an additional application-specific
layer bolted on after the fact.

But that is not all.

## Volumes as AI primitive

In todays world no platform story is complete without agents and AI as primary interfaces.
So why are we boring you with plain old storage when there is so much more exciting things
to talk about? Well, if we look under the hood, system prompts, skills, and even
sub-agents are just instructions (usually markdown files) along with file-based resources/scripts
referenced in these instructions.

Lets have a look at the most common [convention](https://agentskills.io/home) for agent skills.

```sh
my-skill/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
└── ...               # Any additional files or directories
```

As we can see, an agent skill is just a storage location (Volume), which contains files that
adhere to some form of convention. Granted, if you want to fully integrate skills into your
platform you need addtitonal metadata in order to properly set up an environment/sandbox where
your agents can safely run and use the skill. Luckily, there are also conventions for this
via the OpenSharing [protocol for agent skills](https://github.com/OpenSharing-IO/OpenSharing/blob/main/spec/protocols/AGENT_SKILLS.md).

Beyond extending the abilities of your agents via such direct integrations, the community at large
is also hard at work to provide a semantic layer on top of the Lakehouse. And while this is an
expansive and evolving field including the recently announced 
[metric view](https://unitycatalog.io/blogs/uc-metric-views/) support in Unity Catalog,
by now you might now be surprised to learn that Volumes are again a great primitive to
build part of your semantic layer.

The idea of an [LLM-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
quickly gained traction, and got formalized via the [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing).
By design this is a very lightweight specification, with the only hard requirement to put a
`type` field into the frontmatter of a markdown file. 

Again we see that the fundamental building block is ultimately files. The power comes from the
well known UX concept of [progressive disclosure](https://en.wikipedia.org/wiki/Progressive_disclosure),
which just so happens to align nicely with how we want to populate agent context, loading
only the pieces into context that are relevant to the task at hand. Much like skills, individual
pages of such a wiki along with the relations to other concepts in the knowledge graph can
effectively be shared using the OpenSharing protocol, particularly [pages](https://github.com/OpenSharing-IO/OpenSharing/blob/main/spec/protocols/GLOSSARY.md).

## Wrapping Up

Every now and then we come across concepts that seem obvious in retrospect
and are simple yet incredibly powerful upon closer examination. To me,
volumes are just that, a governed, secured, and discoverable storage location
that provides significant value on its own, and serves as a key building
block for a wide range of use cases across AI, agents, and platform engineering.

Go build!
