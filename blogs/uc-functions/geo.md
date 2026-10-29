# GEO report: Unity Catalog functions: one definition for Spark, apps, and agent tools

## Reader questions
| Question | Answering passage | Probe: cited today | Our edge |
|---|---|---|---|
| Q1 Use a UC function as an AI agent tool? | § "Turning a function into an agent tool" lead + toolkit snippet | docs.unitycatalog.io (langchain-tools), GitHub READMEs, docs.databricks.com | Open source path only: `UnitycatalogFunctionClient`, explicit function names, the wildcard-as-allowlist risk |
| Q2 Call a UC function from Spark SQL in open source UC? | § "Calling a function from a query engine" lead | UCSingleCatalog.scala, Spark FunctionCatalog API, Databricks SQL examples | Probe gap #1: the exact error, the session-UDF workaround, and its caveats (Python only, `19.99D`, stale copy) |
| Q3 Where does a UC function run? | intro + `:::tldr` bullet 1 + § "Running a function from an app or a notebook" lead | docs.unitycatalog.io (run-functions) | Names the client class and both modes (sandbox child process vs `execution_mode="local"`), so it can't be mixed up with another vendor's "local mode" |
| Q4 Control who can run a function? | § "The grants decide who can fetch a function" lead | docs.unitycatalog.io (uc-basics) | Probe gap #2: per-call check, and "access, not freshness" with `clear_function_cache()`; the untested caveat stays |
| Q5 Same function with LangChain, OpenAI, Claude? | § "Turning a function into an agent tool", the sentence before the table, plus the table | GitHub READMEs (mixed setup) | Probe gap #3: one three-package comparison, open source only |

## Applied
- Section-leading answer — § "Calling a function from a query engine": the lead sentence now carries the workaround as well ("…but it can run one you fetch with `unitycatalog-ai` and register as a session UDF"), so Q2 lifts as a single sentence.
- Canonical entity name — § "Running a function from an app or a notebook": the lead names `UnitycatalogFunctionClient` and the local-mode switch `execution_mode="local"` (per the run-functions how-to). This answers the probe's "local mode" trap for Q3.
- Canonical entity name — § "Turning a function into an agent tool": "pass the function client" is now "pass the `UnitycatalogFunctionClient`". This separates the open source client from the one the probe saw surfacing for Q1.
- Lead for the comparison table — same §: added "The same function works with LangChain, OpenAI, and Claude:" before "three integration packages ship the toolkit", so the table's lead answers Q5 in the reader's terms.
- Reader term — `:::tldr` bullet 4: "Anthropic Messages tool" is now "Anthropic Messages tool for Claude". Readers ask about Claude, not the Messages API.
- Quotable fact — § "The grants decide who can fetch a function": "access, not freshness" now ends with "until it calls `clear_function_cache()`" (backed by the Manage Python functions replace section), so the Q4 revocation/caching point stands alone.

## Skipped
- Version in intro or leads (e.g. "Unity Catalog 0.7") — docs follow a latest-only policy with no release numbers in prose. The pins already sit in the v0.7.0 / ai-v0.4.0 source links. Adding one to the prose would make it go stale on the next bump.
- Intro — already answer-first, about 55 words, with a named function and `EXECUTE`. No change.
- `:::tldr` — already 5 fact-rich bullets. Only the one term changed.
- Spark § second paragraph ("What does work is…") — slightly repeats the new lead now. I left it, because it introduces the snippet in the author's sequence (voice/structure).
- "Where the guardrails live" lead — already answers. No change.
- FAQ — not added. This is an essay, so an FAQ would be forced.
- Literal question headings — rejected (QUALITY.md adapt rule).

## Gaps the post doesn't fill
- Q4 end-to-end authorization run — the privilege rules come from `FunctionService.java`, and the post says so. A docs run with authorization enabled (grant, call, revoke, call again from a cached client) would turn the caveat into a tested result.
- Q4 revocation vs cached code — the post says each call re-fetches, which suggests a revoke takes effect on the next call even when the body is cached. No source shows that directly. One tested sentence would close it.
- Q2 SQL-bodied functions in Spark — the post says these can't be fetched as callables. There's no alternative path for them.

## Publish-target proposals
- Meta description: `summary` unchanged (about 158 chars, answer-first, names Unity Catalog, Spark, apps, agents).
- FAQPage candidates: none (opinion piece).
- HowTo: no.
- Entities for `about`/`mentions`: Unity Catalog (open source); Unity Catalog functions; `unitycatalog-ai` (`UnitycatalogFunctionClient`, `UCFunctionToolkit`); `unitycatalog-langchain`; `unitycatalog-openai`; `unitycatalog-anthropic`; Apache Spark; LangChain; OpenAI Chat Completions; Anthropic Claude (Messages API); marimo.
