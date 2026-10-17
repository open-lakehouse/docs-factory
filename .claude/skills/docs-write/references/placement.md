# Placement plan

Decide where the content goes and how it connects, before drafting. Run this
in a sub-agent when one is available: it reads several nav files and pages,
and only the plan needs to come back. A sub-agent has no skill directory, so
paste the brief below into its prompt with the inputs filled in.

```
Plan placement for a docs page in this repo (docs-factory). Read-only.

Requirement: [backlog row, content request, element id, or description]
Target files: [paths, if any]
Project: [unitycatalog | delta | open-lakehouse]

1. Read content/<project>/nav.yml and the pages around the likely section.
   Pick the Diátaxis bucket by the reader's goal (learn → tutorials, do a task →
   how-to, understand → explanation, look up → reference). If a `planned:` slot
   matches, the page fills it: keep its `id:`, and carry its `request:` into
   the report.
2. Run `uv run docsnip query explain <element>` for the page's main concept.
   An explanation `explains:` it, unless `citedBy`/`page` shows a page that
   already does (one canonical page per element; extend that one instead).
   Its `out`/`in` edges and `citedBy` pages are the cross-reference candidates.
   Use `examples-for <element>` for the tested scripts to reuse or link.
3. Read content/<project>/compatibility.yml. List the journeys this page
   demonstrates (existing ids, or a new `family.task` to propose) and the
   interfaces it will tab.
4. Name the environment: the registry key in envs/environments.yml the scripts
   will point `compose` at (envs/unitycatalog/compose.yaml by default for Unity
   Catalog, envs/uc-aws/compose.yaml for S3 or PostgreSQL). Say if none fits.
5. Scope it: one page, or several. Split on distinct reader goals or audiences.
   Merge sections that only make sense together. A page that needs H4 is two
   pages.
6. Return the plan below. Don't write files.
```

## The plan

```markdown
# Placement: <title>

- **File:** content/<project>/<bucket>/<NNN-slug>/index.md (create | edit)
- **Bucket / reader goal:** …
- **Frontmatter:** title, summary, diataxis, project, explains, references
- **nav.yml:** section trail `A › B`; `page: <bucket>/<slug>` (+ `id:` of the
  filled `planned:` slot; `label:` if the title is long)
- **Outline:**
  - H2 … (what it covers; which script region; which interface tabs)
  - H2 …
  - Next steps: <links, from nav neighbors and model edges>
- **Journeys / claims:** `<journey>` per interface (works | fails + known issue)
- **Environment:** <registry key>; tutorial step 1 is emitted, or how-to
  prerequisite bullet
- **Cross-references:** inbound (pages that should link here), outbound
- **Related updates:** R01 rows, other pages that restate what this page now owns
- **Open questions:** …
- **Request:** <content-request id, if any>
```
