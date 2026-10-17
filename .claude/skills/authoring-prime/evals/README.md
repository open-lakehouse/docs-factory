# authoring-prime evals

Behavioral evals for the primer's on-demand exemplar catalog. `authoring-prime`
is read-only, so these grade what the agent retrieves after priming, not the
prose it writes. The "fixtures" are the real `references/exemplars.md` and the
pages it lists, so a passing run also confirms those paths still resolve.

| # | Prompt targets | Tests |
|---|---|---|
| 1 | How-to exemplars | On-demand retrieval and cross-type isolation |
| 2 | "Is there a command for examples?" | No phantom skill |
| 3 | Explanation vs. blog essay | Type mapping across docs and blogs |
| 4 | Where a Delta how-to goes | Control: a placement question doesn't load the catalog |
| 5 | Vague "make it look like ours" ask | Routing from a naive prompt |

Run them with the `skill-creator` plugin (`evals/evals.json` convention): it runs
each case in an isolated subagent and has an LLM judge `expected_output`. Without
the harness, run a prompt by hand and judge the answer. Expect run-to-run
variance, so judge a case more than once. When `references/exemplars.md`
changes, update the expected paths in cases 1, 3, and 5.
