// Over the committed envs/unitycatalog render.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assetFiles } from "../repo-assets.mjs";

const ENV = resolve(import.meta.dir, "../../../envs/unitycatalog");
const PNG = join(ENV, "diagram.png");

test("a Trestle diagram brings its snapshot and the snapshot's files", () => {
  const snapshot = join(ENV, "diagram.trestle-graph.json");
  const { files } = JSON.parse(readFileSync(snapshot, "utf8"));
  expect(files.length).toBeGreaterThan(0);
  expect(assetFiles(PNG, { trestle: true })).toEqual([
    PNG,
    snapshot,
    ...files.map((f) => join(ENV, f)),
  ]);
});

test("any other image is only itself", () => {
  expect(assetFiles(PNG)).toEqual([PNG]);
  expect(assetFiles(join(ENV, "a.svg"), { trestle: true })).toEqual([join(ENV, "a.svg")]);
});
