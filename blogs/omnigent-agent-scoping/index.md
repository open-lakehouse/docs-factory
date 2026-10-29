---
title: Whose agent is it anyway?
slug: omnigent-agent-scoping
status: draft
tags: [agents, governance]
author: Robert Pack
target: openlakehouse
post_type: essay
audience: Teams of non-admin users building custom agents together on a shared, hosted Omnigent server, who share sessions and keep their agents in one repo.
summary: On a shared Omnigent server, teammates drive your agent in a shared session, but launching it gives them a frozen copy. Keep one source everyone installs from.
---
On a shared Omnigent server, every agent you install or copy belongs to exactly
one person. (Server agents, which only admins register, are the exception.)
Share a session and your teammates drive your agent live. If they fork the
session or launch from it, they get a copy they own, and that copy never hears
from you again. A team without admin rights keeps one agent only by keeping one
source that everyone installs from.

:::tldr
- An installed Omnigent agent's ID is derived from its owner and its name, so
  every teammate who installs the same folder gets a separate agent.
- Only the owner or a workspace admin can change an agent. An edit grant on a
  shared session is "deliberately insufficient."
- Collaborators with edit access run the owner's live agent. When the owner
  re-adds the installed agent, sessions bound to it get the new version on the
  next turn.
- As of v0.19.0, read access to a session is enough to fork it or launch its
  agent, and that gives you a frozen copy with no link back to its source.
- `omnigent agent add` updates your agent in place. One branch that everyone
  installs from keeps the team in step.
:::

## Several of us edit one agent repo

Several of us share one Omnigent server, none of us are admins, and we keep
our agents in one repo. Each agent is a folder: a spec, prompts, sub-agents,
bundled skills. We all change those folders and we share sessions all the time.
So the question we kept asking was: are we all updating the same agent?

We assumed yes, and we were wrong. Our first loop was `omni run` on every edit
(`omni` is [the short alias][alias] for `omnigent`). It piled up agents with
the same name, and `--resume` quietly skipped our local edits. So we wrote our
own tooling to update one agent in place instead of creating a new one each
time. Building it is how we learned the scoping rules below. Most of them are
deliberate.

## Any agent in a session you can see is one you can pick

If you can read a session, you can launch the agent it uses. The design doc
states the rule: using an agent
"[requires ownership or READ on a session that uses it][design-use]". The
agent-listing tool that agents call, `sys_agent_list`, follows it and returns
[agents bound to sessions you can access][agents-tool] next to the built-ins,
shared sessions included. We found that the least obvious rule of all: you
pick agents through sessions, not from a registry.

The web picker is narrower. It looks for agents in
[the first 30 of your own sessions][picker-scan], not in sessions others have
shared with you. A teammate's agent can be one tool call away in a chat and
still be missing from your new-session menu.
<!-- UNVERIFIED: that a teammate's agent is absent from B's web picker after a
share. Source-backed (useAvailableAgents.ts), not observed with two accounts on
our hosted server. -->

## Every agent has exactly one owner

Each agent you install has a single owner, and only that owner or a workspace
admin can change it. When you install an agent, its ID is a hash of
[the owner and the name][installed-id], so "one install per owner and name" is
enforced by the primary key. Three of us installing the same folder makes three
agents.

The owner-only rule has held [since v0.15.0][cl-7750], and v0.16.0
[extended it to MCP servers and agent bundles][rel-0160], as a breaking
change. The server's own comment explains why: an edit grant on a session is
"[deliberately insufficient][auth-helper]", because sharing hands out edit
access and several sessions can point at one agent. There's no team layer to
lean on either. Omnigent's permissions are per user and per session, with
"[No org/team model][prd]".

## Sharing a session shares the agent, not the keys

A shared Omnigent session lets teammates run your agent but not change its
definition.
Sharing grants a level: read watches the session, edit co-drives it, and
manage can also [grant access to others][grant-manage] (the
[collaboration docs][collab] cover read and edit). With edit access, a teammate
drives your agent in your session. The design doc says it directly:
"[collaborators acting in the owner's session run the owner's agent][design-shared]",
and only the owner can edit it. The server applies the same rule to sub-agents,
which [act in the owner's session][orchestration] too.

The keys that stay with you are the agent's: its bundle, its config, its MCP
servers. The authority while it runs is a different matter. The collaboration
docs warn that an edit collaborator who drives the agent
[gets your access][collab] to the host's filesystem, credentials, and network.
Share edit only with people you'd trust at your keyboard.

I like this design. A shared session hands your teammate a working agent along
with the transcript, and the owner's update reaches everyone in it. Re-add the
installed agent, and every session bound to it
[picks up the new version on its next turn][cli-add] (terminal sessions when
they relaunch).

That "bound to it" matters. A session keeps the agent ID it was created with.
One started with `omni run`, or one running a copy, doesn't move onto your
install when you add an agent of the same name, because the install has its
own ID. Upstream tests pin this: a
[same-named upload and install stay separate][test-separate]. So a teammate's
merged change reaches a session you're sharing only when you re-add it and
that session runs your installed agent.

## Agents travel by copy, on purpose

Once someone forks or launches your agent, they own a separate copy, and that
copy doesn't change when yours does. Say A shares a session on agent X with B.
As of v0.19.0, B only needs read access to [fork it][fork-read] or start a new
session from X. Either way, the server [gives B a copy B owns][agent-for-user]:

- a new random ID, at version 1, owned and editable by B;
- stored in its own right, so it survives A deleting the session or removing X;
- frozen: nothing A changes later reaches it;
- with no provenance. The [agent record][agent-entity] has no "copied from"
  field. Only the name and description carry over.

If B then shares a session on that copy with C, C copies B's copy the same
way. So agents spread as a chain of frozen copies, and none of them knows where
it came from. Re-sharing A's session itself is different: if B has manage access
and shares it with C, C joins A's session, and by the same rule C should be
driving A's live agent.

| What you do | Whose agent runs | Live or frozen | Do the owner's changes reach it? |
|---|---|---|---|
| Drive a shared session at edit level | The owner's | Live | Yes, when the owner re-adds the install the session uses |
| Fork the session | Your copy | Frozen | No |
| Launch a new session from its agent | Your copy | Frozen | No |
| Join after a manage-level re-share | The owner's (inferred) | Live | Yes, as for edit |

<!-- UNVERIFIED: that C drives A's live agent after B re-shares A's session at
manage level (table row 4). Inferred from the "collaborators act in the owner's
session" rule, not observed. -->
<!-- UNVERIFIED: the A → B behavior with two real accounts (fork copy appears in
B's `agent list`; A's re-add updates the shared session but not B's copy).
Source-backed, not observed on our hosted server. -->

This is on purpose. The copy exists so that
"[its owner can never change code that runs in the caller's sessions][agent-for-user]",
and the design doc lists sharing agents with other users or teams as a
[non-goal][design-nongoal]: "only server agents are global." I agree with the
reasoning: without it, anyone who shares a session with you could push code
into your sessions. The cost is that copies travel with nothing but a name, and
names collide.

:::warning[Two agents, one name]
A copy you picked up sits next to your own install under the same name, and
so does every agent `omni run` uploaded from changed files. The picker shows
one agent per name, [the one changed most recently][picker-recency], so you
can't always tell which one you're running. `omnigent agent list` shows
both with their IDs, and `omnigent agent remove` takes the ID when
[two agents share a name][cli-list].
:::

## Updating in place is built in now

Omnigent now does what we built our own tooling for. Since
[v0.18.0][cl-8677], `omnigent agent add` installs an agent once and replaces
your copy in place when you re-add it.

| Command | What it does |
|---|---|
| `omnigent agent add <dir>` | Installs, or replaces your agent of that name in place. Changed files bump the version, and sessions bound to it pick it up [on their next turn][cli-add]. Identical files are a [no-op][test-noop]. |
| `omnigent agent add owner/repo[@agent]` | Installs from a [GitHub repo][cl-9801]'s default branch. `@agent` [picks one agent][cli-parse] out of a repo that holds several. |
| `omnigent agent add https://github.com/owner/repo/tree/<ref>` | Installs from a branch or tag. The ref [can't be a commit SHA][cli-parse]. |
| `omnigent agent list` / `remove` | Lists [your agents][cli-list] with IDs. [Removes][cli-remove] one by name or ID. |
| `omni run <dir>` | Identical files [reuse one agent][uploaded-id]. Changed files create a new one. |
| `PATCH /v1/agents/{id}`, or Settings (v0.19.0) | Edits an agent's config ([#10280][pr-10280], [#10426][pr-10426]). The Settings UI sits behind the [`custom_agents_settings_ui` flag][flag], off by default and set server-wide, so only a server admin can turn it on. PATCH is the route a non-admin has. |

The GitHub install clones over HTTPS with git's terminal prompt
[turned off][cli-clone], so whether a private repo works depends on the git
credentials on your machine.
<!-- UNVERIFIED: `agent add owner/repo` against a private repo. Likely needs a
git credential helper; not tried on our hosted server. -->

So the loop is: edit, `omnigent agent add`, send the next turn. Stop using
`omni run` to iterate. Every edit to the files gives you another agent.

## So does everyone update the same agent?

No. Everyone on a non-admin team owns a separate agent. What keeps the team in
step is that everyone installs from one source:

- Everyone installs from the repo's main branch, with
  `omnigent agent add <dir>` from a checkout of main or the GitHub form on the
  default branch, and re-adds after each merge.
- A shared session runs its owner's agent, so the owner re-adds to give
  everyone in it the merged change. That works only if the session is bound to
  the owner's installed agent.
- If you come from the `omni run` workflow, your old sessions are still bound
  to the uploaded agents. A new agent version
  [doesn't rewrite existing sessions][spec-sessions], and since v0.17.0 a
  session's agent can't be switched in place: `switch-agent` returns 410 and
  the server says to [fork the session into another agent][cl-8795]. The fork
  route [binds the agent you name][fork-switch] instead of the source's. So
  fork them into your installed agent before you expect updates there, or
  before you remove the old agents.
- If you forked or launched from a teammate's session, you have a copy sitting
  next to your install under the same name. Remove it by ID so you know which
  one you're running.

That's our setup now. (Admins have a shortcut: a server agent, registered
with `omnigent server --agent` or `OMNIGENT_BUILTIN_AGENT_DIRS`, is the only
kind that's [global][design-motivation]. We aren't admins on our server.)

If your team shares sessions and one agent repo, check `omnigent agent list`
today. You may find more agents than you expected. Then make main the one
everyone installs from. The [collaboration docs][collab] cover share levels,
and the [custom agents docs](https://omnigent.ai/docs/use/custom-agents) cover
the agent format.

[installed-id]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/db/utils.py#L1134
[uploaded-id]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/db/utils.py#L1149
[cli-clone]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/cli.py#L11752
[cli-add]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/cli.py#L11780-L11808
[cli-list]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/cli.py#L11916
[cli-remove]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/cli.py#L11938
[agent-for-user]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/bundles.py#L183-L233
[agent-entity]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/entities/agent.py#L37-L46
[orchestration]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/routes/_sessions/orchestration.py#L11591-L11593
[auth-helper]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/routes/_auth_helpers.py#L477
[fork-read]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/routes/sessions/routes_core.py#L3497
[agents-tool]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/tools/builtins/agents.py#L224
[picker-scan]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/web/src/hooks/useAvailableAgents.ts#L207-L213
[picker-recency]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/web/src/hooks/useAvailableAgents.ts#L44-L53
[flag]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/feature_flags.py#L28
[design-motivation]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/designs/REUSABLE_USER_AGENTS.md#L35
[design-nongoal]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/designs/REUSABLE_USER_AGENTS.md#L80
[design-shared]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/designs/REUSABLE_USER_AGENTS.md#L453
[prd]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/designs/PROJECTS_PRD.md#L69
[cl-7750]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/CHANGELOG.md#L875
[cl-8677]: https://github.com/omnigent-ai/omnigent/pull/8677
[rel-0160]: https://omnigent.ai/releases/0.16.0
[cl-9801]: https://github.com/omnigent-ai/omnigent/pull/9801
[pr-10280]: https://github.com/omnigent-ai/omnigent/pull/10280
[pr-10426]: https://github.com/omnigent-ai/omnigent/pull/10426
[cli-parse]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/cli.py#L11673-L11686
[alias]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/pyproject.toml#L412-L413
[design-use]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/designs/REUSABLE_USER_AGENTS.md#L452
[grant-manage]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/routes/sessions/routes_permissions.py#L102-L116
[collab]: https://omnigent.ai/docs/collaborate
[test-noop]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/tests/server/routes/test_agent_install.py#L472
[test-separate]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/tests/server/routes/test_agent_install.py#L804
[spec-sessions]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/docs/AGENT_YAML_SPEC.md#L629-L630
[cl-8795]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/CHANGELOG.md#L461
[fork-switch]: https://github.com/omnigent-ai/omnigent/blob/d43340fec4e7d2d767f319d715e84aa82f4d1bc8/omnigent/server/routes/sessions/routes_core.py#L3539-L3542
