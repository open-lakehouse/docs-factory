// Over the committed envs/unitycatalog render.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assetFiles } from "../repo-assets.mjs";

const ENV = resolve(import.meta.dir, "../../../envs/unitycatalog");
const SNAPSHOT = join(ENV, "diagram.trestle-graph.json");

test("a Trestle diagram brings its snapshot and the snapshot's files", () => {
  const { files } = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  expect(files.length).toBeGreaterThan(0);
  expect(assetFiles(SNAPSHOT, { trestle: true })).toEqual([
    SNAPSHOT,
    ...files.map((f) => join(ENV, f)),
  ]);
});

test("any other asset is only itself", () => {
  expect(assetFiles(SNAPSHOT)).toEqual([SNAPSHOT]);
  expect(assetFiles(join(ENV, "a.svg"), { trestle: true })).toEqual([join(ENV, "a.svg")]);
});
