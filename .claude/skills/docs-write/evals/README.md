# docs-write evals

Behavioral evals for the drafting rules that are easiest to get wrong: writing at
the reader's altitude, and keeping procedures concrete without inventing steps.
Each case pairs a general behavior with a fixture in a different domain, so a
passing run means the rules generalize rather than that one area happens to work.

The specs are taken from `ready` pages in this repo (named at the top of each
spec), not invented. If a page changes, refresh its spec from the page.

| # | Fixture | Domain | Tests |
|---|---|---|---|
| 1 | `spec-table-credentials.md` | Credential vending | Altitude, labeled: the internal section stays out of a how-to |
| 2 | `spec-aws-storage-role.md` | AWS storage | Concrete steps, with the missing IAM console flow flagged rather than invented |
| 3 | `spec-time-travel.md` | Delta time travel | Control: a clean concept spec causes no false flags and loses no facts |

The cases run at the trivial tier on stubs outside `content/`, so placement,
scripts, and `nav.yml` aren't exercised. Those are covered by `docsnip check` and
`check-nav.mjs` on real pages.

Run them with the `skill-creator` plugin (`evals/evals.json` convention), which runs
each case in an isolated subagent and has an LLM judge `expected_output`. Without
it, run the prompt by hand and judge the stub. The skill edits the stubs, so reset
them (`git checkout -- .claude/skills/docs-write/evals/fixtures`) between runs.
Grow the suite with new domains, never by making a case vaguer.
