# ADR-0004: OmniDocsDoc runs standalone in CI; a shared Omnigent server is opt-in

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Supersedes | — |
| Superseded by | — |

## Context

[OmniDocsDoc](../design/omni-docs-doc.md) runs an Omnigent agent nightly in
GitHub Actions to update the docs for upstream merges. Omnigent can run it
two ways:

- **Standalone.** `omni run <agent>` starts a local server and runner in the
  job. `--no-session` makes the store disposable. This is what Omnigent's
  GitHub Actions guide does.
- **Against a shared server.** `omni run <agent> --server <url>` uploads the
  agent definition and keeps the session on the server, where it can be
  watched live, resumed with `--resume`, and shared through the permissions
  API. The runner, and with it every tool call, still runs in the job.

A shared server would let maintainers watch a night's session, or steer it
afterward with `--resume`, instead of reading a log. It also costs:

- **Hosting.** Docker with Postgres, Fly (at least 1 GB), or the Databricks
  managed service, which is in beta.
- **An unattended credential.** Machine tokens from `/oauth/token` expire
  after an hour, or a Databricks service principal profile serves a Databricks
  Apps server. Omnigent doesn't document how `omni run --server` picks either
  up in CI.
- **Another host holding transcripts.** Those transcripts quote repo content
  and upstream PR text.

## Decision

Run standalone. The record of a run is:

- the rolling PR, with its ledger of per-PR verdicts and the run summary;
- one commit per run, with an `Upstream-PRs:` trailer;
- a workflow artifact with the run context, the agent's stdout and stderr,
  and the conversation log from `omni run --log`.

The workflow keeps one switch. When the `OMNIGENT_SERVER_URL` repo variable is
set, it passes `--server` instead of `--no-session`. Wiring its credential is a
spike to finish before anyone sets the variable.

Locally, `just omni-docs-doc` keeps a saved session, so a maintainer can watch
a run as it happens.

## Consequences

- No new service to run or secure, and a run depends only on the model
  endpoint and GitHub.
- Nobody can watch a CI run live or resume it. Reading the artifact and
  re-running with `max_prs` is the debugging loop.
- Revisit when the Databricks-managed Omnigent service accepts a service
  principal from Actions, or when maintainers want to steer nightly sessions
  rather than review their output. The longer-term alternative is an Omnigent
  scheduled task in a managed sandbox, as sketched for review feedback in
  [`agent-feedback.md`](../design/agent-feedback.md#deferred-hosted-runs).
  That would replace the workflow, not extend it.
