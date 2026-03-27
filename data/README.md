# data/

This directory contains structured data files derived from the Delta Lake documentation research.

## coverage-matrix.json

A machine-readable representation of the journey × engine documentation coverage matrix.

### Schema

```json
{
  "meta": {
    "generated_from": ["...source files..."],
    "generated_date": "YYYY-MM-DD",
    "engines": ["spark", "delta-rs", "duckdb", "polars", "daft", "datafusion", "trino", "prestodb", "flink", "clickhouse"],
    "support_values": ["supported", "not-supported", "not-applicable", "unknown"],
    "docs_values": ["documented", "undocumented", "not-applicable", "unknown"],
    "legend": { "✅": "...", "⚠️": "...", "❌": "...", "—": "...", "?": "..." }
  },
  "journeys": [
    {
      "slug": "read-full-table-scan",
      "title": "Read — full table scan",
      "category": "fundamentals",
      "priority": "P0",
      "engines": {
        "spark":      { "support": "supported", "docs": "documented" },
        "delta-rs":   { "support": "supported", "docs": "documented" },
        "duckdb":     { "support": "supported", "docs": "documented" },
        "polars":     { "support": "supported", "docs": "documented" },
        "daft":       { "support": "supported", "docs": "documented" },
        "datafusion": { "support": "supported", "docs": "documented" },
        "trino":      { "support": "supported", "docs": "documented" },
        "prestodb":   { "support": "supported", "docs": "documented" },
        "flink":      { "support": "supported", "docs": "documented" },
        "clickhouse": { "support": "supported", "docs": "documented" }
      },
      "gap_count": 0
    }
  ]
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `slug` | string | URL-safe unique identifier for the journey |
| `title` | string | Human-readable journey name from the research matrix |
| `category` | string | One of: `fundamentals`, `table-operations`, `change-data-streaming`, `explanation`, `reference` |
| `priority` | string | `P0` (critical), `P1` (high), `P2` (medium) — based on community signal strength from gap analysis |
| `engines` | object | Per-engine support and docs status (see value enums below). `null` means not assessed for this engine in this category |
| `gap_count` | integer | Count of engines where `support == "supported"` and `docs != "documented"` |

### Value enums

**support:**
- `supported` — the feature is implemented and available
- `not-supported` — the feature is absent or blocked
- `not-applicable` — the engine is not in scope for this journey (e.g., read-only engine for a write journey)
- `unknown` — not confirmed by research

**docs:**
- `documented` — feature has a dedicated how-to guide or is well-covered in the engine's official docs
- `undocumented` — feature exists but is undocumented, unstable, or only accessible via manual workarounds
- `not-applicable` — engine does not support the feature (no docs needed)
- `unknown` — not confirmed by research

### Categories

| Category | Description |
|---|---|
| `fundamentals` | Core read/write operations, time travel, storage config |
| `table-operations` | DML, schema management, optimization, maintenance |
| `change-data-streaming` | CDF, streaming source/sink, streaming options |
| `explanation` | Conceptual/architectural topics (covered per-docs-site, not per-engine) |
| `reference` | Reference material: table properties, version matrices, API docs |

### Notes on the explanation category

Entries in the `explanation` category were assessed against a smaller set of documentation sites (official docs, delta-rs docs, DuckDB docs, Polars docs, Daft docs) rather than per-engine. The `datafusion`, `trino`, `prestodb`, `flink`, and `clickhouse` engine fields are `null` for these entries. `gap_count` is computed only over the non-null engine entries.

## Update process

1. Re-read `research/delta-lake/synthesis-coverage-matrix.md` and `research/delta-lake/synthesis-gap-analysis.md` after each research wave update.
2. Update the per-engine cells to reflect corrections and new findings.
3. Recompute `gap_count` for each journey: count engines where `support == "supported"` and `docs != "documented"` (null entries are excluded).
4. Update `meta.generated_date`.
5. Validate JSON is well-formed before committing.

## Source

Generated from:
- `research/delta-lake/synthesis-coverage-matrix.md` — the full journey × engine matrix
- `research/delta-lake/synthesis-gap-analysis.md` — gap inventory and priority scores
