// Unit tests for the re-anchor matchers. Run with `bun test`.
//
// The matchers take a postgres.js `Sql` tagged-template client. We stub it with
// a tiny fake that (a) returns a queued result for the single SELECT of thread
// roots, and (b) records every UPDATE so we can assert what changed. Queries are
// distinguished by their SQL text (select vs update) — enough for these tests.
import { describe, expect, test } from "bun:test";
import {
  findQuote,
  hashLine,
  type NewSection,
  type NewSnippet,
  type NewSource,
  normalize,
  reanchorCodeThreads,
  reanchorThreads,
} from "./anchor.js";
import type { Sql } from "./db.js";

// --- pure helpers ----------------------------------------------------------

describe("normalize", () => {
  test("lowercases and collapses whitespace", () => {
    expect(normalize("  The  Broker\nVENDS ")).toBe("the broker vends");
  });
});

describe("hashLine", () => {
  test("is stable and ignores trailing whitespace", () => {
    expect(hashLine("df.write   ")).toBe(hashLine("df.write"));
    expect(hashLine("a")).not.toBe(hashLine("b"));
  });
  test("ignores leading indentation (dedent-invariant)", () => {
    // The browser hashes the rendered dedented line; this side hashes the full
    // indented source line. Both must agree so indented snippet regions
    // re-anchor by line-hash.
    expect(hashLine("    df = spark.read")).toBe(hashLine("df = spark.read"));
  });
});

describe("findQuote", () => {
  const text = normalize("The broker vends short-lived tokens to the engine.");
  test("finds an exact quote", () => {
    expect(findQuote(text, normalize("vends short-lived tokens"))).toBe(
      text.indexOf("vends short-lived tokens"),
    );
  });
  test("returns -1 when absent and dissimilar", () => {
    expect(findQuote(text, normalize("completely unrelated phrase here"))).toBe(-1);
  });
  test("fuzzy-matches a lightly edited quote above threshold", () => {
    // one word changed out of four → 0.75 overlap; drop threshold to accept.
    expect(
      findQuote(text, normalize("vends short-lived credentials tokens"), 0.6),
    ).toBeGreaterThanOrEqual(0);
  });
});

// --- Sql fake --------------------------------------------------------------

interface Update {
  sql: string;
  values: unknown[];
}

/**
 * Build a fake `Sql`. `rootRows` is returned for the first (select) call;
 * every subsequent call is treated as an update and recorded. Returns the fake
 * plus the captured updates array.
 */
function fakeSql(rootRows: unknown[]): { sql: Sql; updates: Update[] } {
  const updates: Update[] = [];
  let selectServed = false;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    if (text.startsWith("select") && !selectServed) {
      selectServed = true;
      return Promise.resolve(rootRows);
    }
    updates.push({ sql: text, values });
    return Promise.resolve([]);
  };
  return { sql: tag as unknown as Sql, updates };
}

// --- prose re-anchoring ----------------------------------------------------

describe("reanchorThreads (prose)", () => {
  const sections: NewSection[] = [
    {
      anchorSlug: "credential-vending",
      fingerprint: "credential vending",
      text: "The broker vends short-lived tokens to the engine.",
    },
    {
      anchorSlug: "governance",
      fingerprint: "governance",
      text: "Policies are enforced centrally by the catalog.",
    },
  ];

  test("tier 1: quote stays in its own section → un-orphans + refreshes start", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "1",
        anchor_slug: "credential-vending",
        anchor_fingerprint: "credential vending",
        orphaned: true,
        selector_quote: "vends short-lived tokens",
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections);
    expect(orphaned).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("selector_start");
    expect(updates[0].sql).toContain("orphaned = false");
  });

  test("tier 2: quote moved to another section → relinks slug + start", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "2",
        anchor_slug: "governance",
        anchor_fingerprint: "old heading",
        orphaned: false,
        selector_quote: "vends short-lived tokens",
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections);
    expect(orphaned).toBe(0);
    expect(updates[0].sql).toContain("anchor_slug");
    expect(updates[0].values).toContain("credential-vending");
  });

  test("tier 3: heading-level comment on a surviving slug → kept", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "3",
        anchor_slug: "governance",
        anchor_fingerprint: "governance",
        orphaned: false,
        selector_quote: null,
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections);
    expect(orphaned).toBe(0);
    expect(updates).toHaveLength(0); // nothing to change
  });

  test("tier 4: fingerprint match relinks a renamed heading", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "4",
        anchor_slug: "old-slug",
        anchor_fingerprint: "governance",
        orphaned: false,
        selector_quote: null,
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections);
    expect(orphaned).toBe(0);
    expect(updates[0].values).toContain("governance");
  });

  test("tier 5: no match → orphaned (kept), counted", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "5",
        anchor_slug: "gone",
        anchor_fingerprint: "gone heading",
        orphaned: false,
        selector_quote: "text that no longer exists anywhere at all",
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections);
    expect(orphaned).toBe(1);
    expect(updates[0].sql).toContain("orphaned = true");
  });

  test("fast path: unchanged section is kept without a quote scan", async () => {
    // A thread whose quote WOULD NOT be found by the scan (it's not in any
    // section), but whose section is in unchangedSlugs → kept, not orphaned.
    const { sql, updates } = fakeSql([
      {
        id: "6",
        anchor_slug: "governance",
        anchor_fingerprint: "governance",
        orphaned: false,
        selector_quote: "text the scan would never find",
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections, new Set(["governance"]));
    expect(orphaned).toBe(0);
    // Not orphaned (it was already un-orphaned, so no update at all).
    expect(updates).toHaveLength(0);
  });

  test("fast path: unchanged + previously orphaned → un-orphaned", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "7",
        anchor_slug: "governance",
        anchor_fingerprint: "governance",
        orphaned: true,
        selector_quote: null,
      },
    ]);
    const orphaned = await reanchorThreads(sql, "blogs", "x", sections, new Set(["governance"]));
    expect(orphaned).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("orphaned = false");
  });
});

// --- code re-anchoring -----------------------------------------------------

describe("reanchorCodeThreads (code)", () => {
  const fileText = ["import x", "def read():", "    df = spark.read", "    return df"].join("\n");
  const snippets: NewSnippet[] = [
    { path: "snippets/x.py", region: "read", startLine: 2, endLine: 4, fileHash: "h1" },
  ];
  const sources: NewSource[] = [{ path: "snippets/x.py", text: fileText, fileHash: "h1" }];

  test("tier 1: region still present → kept (un-orphaned)", async () => {
    const { sql, updates } = fakeSql([
      {
        id: "1",
        orphaned: true,
        code_path: "snippets/x.py",
        code_region: "read",
        code_line_hash: hashLine("    df = spark.read"),
      },
    ]);
    const orphaned = await reanchorCodeThreads(sql, "blogs", "x", snippets, sources);
    expect(orphaned).toBe(0);
    expect(updates[0].sql).toContain("orphaned = false");
  });

  test("tier 2: line moved, region gone → relinks by line-hash", async () => {
    const moved = [
      "# new header",
      "import x",
      "def read():",
      "    df = spark.read",
      "    return df",
    ].join("\n");
    const orphaned = await runCode(
      [
        {
          id: "2",
          orphaned: false,
          code_path: "snippets/x.py",
          code_region: "",
          code_line_hash: hashLine("    df = spark.read"),
        },
      ],
      [], // no regions
      [{ path: "snippets/x.py", text: moved, fileHash: "h2" }],
    );
    expect(orphaned.count).toBe(0);
    expect(orphaned.updates[0].sql).toContain("code_line");
    // moved down by one line: original index 2 (0-based) → now index 3 → line 4
    expect(orphaned.updates[0].values).toContain(4);
  });

  test("tier 2: browser-captured dedented hash matches indented source line", async () => {
    // Regression: the browser hashes the rendered (dedented) line while the
    // source keeps its indentation. A dedent-invariant hashLine must still
    // re-anchor by line-hash instead of orphaning the comment.
    const orphaned = await runCode(
      [
        {
          id: "4",
          orphaned: false,
          code_path: "snippets/x.py",
          code_region: "",
          code_line_hash: hashLine("df = spark.read"),
        },
      ],
      [], // no regions
      [{ path: "snippets/x.py", text: fileText, fileHash: "h1" }],
    );
    expect(orphaned.count).toBe(0);
    expect(orphaned.updates[0].sql).toContain("code_line");
    // "    df = spark.read" is index 2 (0-based) → line 3
    expect(orphaned.updates[0].values).toContain(3);
  });

  test("tier 3: line deleted → orphaned (kept), counted", async () => {
    const orphaned = await runCode(
      [
        {
          id: "3",
          orphaned: false,
          code_path: "snippets/x.py",
          code_region: "",
          code_line_hash: hashLine("gone line"),
        },
      ],
      [],
      [{ path: "snippets/x.py", text: fileText, fileHash: "h1" }],
    );
    expect(orphaned.count).toBe(1);
    expect(orphaned.updates[0].sql).toContain("orphaned = true");
  });

  async function runCode(rows: unknown[], snips: NewSnippet[], srcs: NewSource[]) {
    const { sql, updates } = fakeSql(rows);
    const count = await reanchorCodeThreads(sql, "blogs", "x", snips, srcs);
    return { count, updates };
  }
});
