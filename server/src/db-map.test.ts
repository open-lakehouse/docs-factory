// Unit tests for db-map pure helpers. Run with `bun test`.
import { expect, test, describe } from "bun:test";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  dateOnlyToUtcTimestamp,
  merkleNodeToJson,
  merkleNodeToProto,
  type MerkleNodeJson,
} from "./db-map.js";

describe("merkle node proto <-> jsonb round-trip", () => {
  const json: MerkleNodeJson = {
    key: "",
    kind: "doc",
    nodeHash: "doc",
    subtreeHash: "root",
    level: 0,
    label: "(doc)",
    children: [
      {
        key: "intro",
        kind: "heading",
        nodeHash: "h1",
        subtreeHash: "s1",
        level: 1,
        label: "Intro",
        anchorSlug: "intro",
        children: [
          {
            key: "intro#snippet:src/x.py:A..B",
            kind: "snippet",
            nodeHash: "sn1",
            subtreeHash: "sn1",
            level: 0,
            label: "src/x.py (A..B)",
            children: [],
            snippetPath: "src/x.py",
            snippetRegion: "A..B",
          },
        ],
      },
    ],
  };

  test("json → proto → json is identity on the meaningful fields", () => {
    const back = merkleNodeToJson(merkleNodeToProto(json));
    expect(back.subtreeHash).toBe("root");
    expect(back.children[0].anchorSlug).toBe("intro");
    const snippet = back.children[0].children[0];
    expect(snippet.kind).toBe("snippet");
    expect(snippet.snippetPath).toBe("src/x.py");
    expect(snippet.snippetRegion).toBe("A..B");
  });
});

describe("dateOnlyToUtcTimestamp", () => {
  test("pins a 'YYYY-MM-DD' string to UTC midnight of that day", () => {
    const ts = dateOnlyToUtcTimestamp("2026-07-01");
    expect(timestampDate(ts).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("takes only the calendar date, ignoring any time part", () => {
    const ts = dateOnlyToUtcTimestamp("2026-07-01T13:45:00Z");
    expect(timestampDate(ts).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  test("round-trips the calendar date that setTargetReleaseDate wrote", () => {
    // setTargetReleaseDate stores toISOString().slice(0,10) — the UTC calendar
    // date. Reading it back must land on the SAME day (no TZ-offset drift), for
    // any date value, so the displayed target date is stable across server TZs.
    for (const ymd of ["2026-01-01", "2026-07-01", "2026-12-31"]) {
      const ts = dateOnlyToUtcTimestamp(ymd);
      expect(timestampDate(ts).toISOString().slice(0, 10)).toBe(ymd);
    }
  });
});
