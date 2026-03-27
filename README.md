# docs-factory

Structured research and content artifact store for the open lakehouse ecosystem.

This repository holds the outputs of research pipelines — engine analysis, gap analyses, community signals, support matrices, and content inventories — organized by topic. These artifacts are the authoritative inputs for content generation, ecosystem outreach, and documentation work.

## Structure

| Path | Contents |
|---|---|
| `research/delta-lake/` | Delta Lake ecosystem coverage reports, engine support analysis, community signals, and synthesis documents |

Future research topics will follow the same pattern: `research/<topic>/`.

## How reports get here

Research pipelines produce structured markdown reports covering documentation coverage, engine support, community signals, and gap analysis. Once reviewed, outputs are committed here under the appropriate `research/<topic>/` path. The synthesis files (coverage matrix, gap analysis, journey inventory) and the consolidated artifact (`SUPPORT-MATRIX.md`) are committed alongside the source reports.

## How to use this repo

- **Content generation**: the gap analysis and journey inventory files are the authoritative input for deciding what content to create next and in which engines
- **Ecosystem outreach**: the outreach opportunities sections in synthesis files identify which engine maintainers to engage and why
- **Human review**: browse `research/` to find structured findings before drafting blog posts, how-tos, or reference pages
- **Cross-repo tasks**: register this repo in the content pipeline's cross-repo config to enable automated content workflows that reference these files
