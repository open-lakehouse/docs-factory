import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.each(["engine-coverage-view.tsx", "engine-coverage.css"])(
  "the docs-shell copy of %s is identical",
  (file) => {
    const read = (p: string) => readFileSync(resolve(import.meta.dir, p), "utf8");
    expect(read(`../../../sites/docs-shell/src/components/${file}`)).toBe(read(`./${file}`));
  },
);
