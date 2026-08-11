// Fence-resolution drift tests. The render plugin (remark-code-snippets) and the
// version manifest both go through resolveFence(), so these guard the one place
// the dedent + line-range contract lives — the bug that let the DB store
// un-dedented source while the reviewer saw dedented text.
import { expect, test } from "bun:test";
import { parseFenceMeta, resolveFence } from "../fences.mjs";

const INDENTED = [
  "def read(path):",
  "    # --8<-- [start:region]",
  "    from deltalake import DeltaTable",
  "    dt = DeltaTable(path)",
  "    return dt",
  "    # --8<-- [end:region]",
].join("\n");

test("region text is dedented to what the reader sees", () => {
  const r = resolveFence(INDENTED, { start: "start:region", end: "end:region" });
  expect(r.text).toBe("from deltalake import DeltaTable\ndt = DeltaTable(path)\nreturn dt");
});

test("region line range points at the true (pre-dedent) source lines", () => {
  const r = resolveFence(INDENTED, { start: "start:region", end: "end:region" });
  // start marker is line 2 (1-based), so the region begins at line 3;
  // end marker is line 6, so the region's last line is 5.
  expect(r.startLine).toBe(3);
  expect(r.endLine).toBe(5);
  expect(r.region).toBe("start:region..end:region");
});

test("whole-file fence returns the file minus its trailing newline", () => {
  const r = resolveFence("a\nb\nc\n", {});
  expect(r.text).toBe("a\nb\nc");
  expect(r.startLine).toBe(1);
  expect(r.endLine).toBe(3);
  expect(r.region).toBe("");
});

test("a duplicated marker is rejected (must be unique)", () => {
  const dup = "x = 1  # mark\ny = 2  # mark\nz = 3";
  expect(() => resolveFence(dup, { start: "mark", end: "mark" })).toThrow();
});

test("a missing marker is rejected", () => {
  expect(() => resolveFence("a\nb\n", { start: "nope", end: "gone" })).toThrow();
});

test("parseFenceMeta extracts file/start/end and ignores fences without file=", () => {
  expect(parseFenceMeta("python file=./x.py start=start:a end=end:a")).toEqual({
    file: "./x.py",
    start: "start:a",
    end: "end:a",
  });
  expect(parseFenceMeta('python title="x.py"')).toBeNull();
});
