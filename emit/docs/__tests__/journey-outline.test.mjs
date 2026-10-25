// A journey with no `##` above it publishes its steps as h2 on both the site
// page and the twin; one inside a `##` section keeps its authored `###`.
import { expect, test } from "bun:test";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import remarkJourney from "../../../site/src/plugins/remark-journey.mjs";
import remarkJourneyMd from "../../plugins/remark-journey-md.mjs";
import remarkPromoteJourneySteps from "../../plugins/remark-promote-journey-steps.mjs";

const parse = (md) => unified().use(remarkParse).use(remarkDirective).parse(md);
const promote = (md) => {
  const tree = parse(md);
  remarkPromoteJourneySteps()(tree);
  return tree;
};
const headings = (node, out = []) => {
  if (node.type === "heading") out.push(node.depth);
  for (const child of node.children ?? []) headings(child, out);
  return out;
};

const TUTORIAL =
  "Intro.\n\n::::journey\n\n### One\n\n#### Detail\n\n### Two\n\n::::\n\n## Next steps\n";
const HOW_TO = "## Steps\n\n::::journey\n\n### One\n\n### Two\n\n::::\n";

test("a journey with no enclosing section is promoted, nested headings included", () => {
  expect(headings(promote(TUTORIAL))).toEqual([2, 3, 2, 2]);
});

test("a journey inside a ## section keeps its depth", () => {
  expect(headings(promote(HOW_TO))).toEqual([2, 3, 3]);
  expect(headings(promote(`# Title\n\n${HOW_TO}`))).toEqual([1, 2, 3, 3]);
});

test("the timeline and the twin both split promoted steps", () => {
  const timeline = promote(TUTORIAL);
  remarkJourney()(timeline);
  const journey = timeline.children.find((n) => n.name === "Journey");
  expect(journey.children.map((s) => s.name)).toEqual(["JourneyStep", "JourneyStep"]);

  const twin = promote(TUTORIAL);
  remarkJourneyMd()(twin);
  const md = unified().use(remarkStringify).stringify(twin);
  expect(md).toContain("## Step 1 — One");
  expect(md).toContain("## Step 2 — Two");
  expect(md).toContain("### Detail");
});
