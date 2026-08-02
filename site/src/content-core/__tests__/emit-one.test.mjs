// emitOne (emit/emit.mjs) is the target-agnostic emitter core the twin driver and
// the blog CLI both call. This exercises it end-to-end with the md-twin target over
// a temp fixture: a `:::callout`, a `:::tldr`, and a `file=` snippet fence must all
// flatten/inline into portable markdown, and a doc with no images yields an empty
// manifest (no LikeC4 export → no Chromium needed).
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitOne } from "../../../../emit/emit.mjs";
import mdTwin from "../../../../emit/targets/md-twin.mjs";

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "emit-one-"));
  mkdirSync(join(dir, "snippets"), { recursive: true });
  writeFileSync(join(dir, "snippets", "hello.py"), 'print("hello from snippet")\n');
  writeFileSync(
    join(dir, "index.md"),
    [
      "---",
      "title: Fixture Page",
      "summary: A crisp summary.",
      "status: ready",
      "---",
      "",
      "Intro prose paragraph that is clearly long enough to be real prose.",
      "",
      ":::tldr",
      "- key fact one",
      "- key fact two",
      ":::",
      "",
      ":::warning",
      "Be careful with this.",
      ":::",
      "",
      "```python file=./snippets/hello.py",
      "```",
      "",
    ].join("\n"),
  );
  return dir;
}

test("emitOne flattens tldr + callout, inlines the snippet, empty manifest", async () => {
  const dir = makeFixture();
  try {
    const { output, frontmatter, manifest } = await emitOne({
      inputPath: join(dir, "index.md"),
      target: mdTwin,
      likec4OutDir: join(dir, ".likec4-export"),
      assetsDir: dir,
    });

    // Constructs flattened — no raw directives leak.
    expect(output).toContain("> **TL;DR**");
    expect(output).toContain("> **Warning**");
    expect(output).not.toContain(":::tldr");
    expect(output).not.toContain(":::warning");

    // Snippet inlined (the file= fence is replaced by the file's contents).
    expect(output).toContain('print("hello from snippet")');
    expect(output).not.toContain("file=./snippets/hello.py");

    // Frontmatter captured from the draft; no images → empty manifest.
    expect(frontmatter.title).toBe("Fixture Page");
    expect(frontmatter.summary).toBe("A crisp summary.");
    expect(manifest).toEqual([]);

    // md-twin keeps the title in frontmatter, not as a body H1 (titleAsH1:false).
    expect(output).not.toContain("# Fixture Page");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
