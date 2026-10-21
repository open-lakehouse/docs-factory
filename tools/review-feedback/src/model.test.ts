import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentArea } from "./gen/docs_factory/review/v1/messages_pb.js";
import { locateModel, modelRef, modelTarget } from "./model.js";

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "rf-model-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const root = repo({
  "architecture/model/logical/assets.likec4": [
    "model {",
    "  extend lakehouse {",
    '    table = asset "Table" {',
    "    }",
    "  }",
    "}",
  ].join("\n"),
  "architecture/model/logical/other.likec4": [
    "model {",
    '  warehouse = capability "Warehouse" {',
    '    table = asset "Warehouse table"',
    "  }",
    "}",
  ].join("\n"),
  "architecture/model/views/flows.likec4": [
    "views {",
    "  dynamic view ucDeltaApi {",
    "  }",
    "}",
  ].join("\n"),
});

describe("model threads", () => {
  test("a model slug parses to its target", () => {
    expect(modelTarget(modelRef("element/lakehouse.table"))).toEqual({
      kind: "element",
      id: "lakehouse.table",
    });
    expect(modelTarget(modelRef("estate"))).toEqual({ kind: "estate" });
    expect(modelTarget({ ...modelRef("x"), area: ContentArea.DOCS })).toBeUndefined();
  });

  test("an element is located at the declaration under its parent", () => {
    const loc = locateModel(root, { kind: "element", id: "lakehouse.table" });
    expect(loc).toMatchObject({ path: "architecture/model/logical/assets.likec4", startLine: 3 });
  });

  test("a view is located at its view declaration", () => {
    const loc = locateModel(root, { kind: "view", id: "ucDeltaApi" });
    expect(loc).toMatchObject({ path: "architecture/model/views/flows.likec4", startLine: 2 });
  });

  test("an unknown element is not located", () => {
    expect(locateModel(root, { kind: "element", id: "nowhere.missing" })).toBeUndefined();
  });
});
