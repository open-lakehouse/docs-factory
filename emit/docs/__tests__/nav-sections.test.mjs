// Nav projection onto an emit's page selection, and rendered-section hashing.
import { expect, test } from "bun:test";
import { PREAMBLE_KEY } from "../../../site/src/content-core/tree.mjs";
import { projectNav } from "../nav.mjs";
import { renderedSections } from "../sections.mjs";

const tree = [
  {
    kind: "section",
    label: "Start here",
    children: [
      { kind: "page", bucket: "tutorials", slug: "a", label: "A", primary: true },
      { kind: "planned", id: "T02", title: "Later" },
    ],
  },
  {
    kind: "section",
    label: "Drafts only",
    children: [{ kind: "page", bucket: "how-to", slug: "wip", label: "WIP", primary: true }],
  },
  {
    kind: "section",
    label: "Again",
    children: [{ kind: "page", bucket: "tutorials", slug: "a", label: "A", primary: false }],
  },
];

test("projectNav drops planned slots, unselected pages, and emptied sections", () => {
  const { nav, order } = projectNav(tree, {
    isSelected: (bucket) => bucket === "tutorials",
    routeFor: (bucket, slug) => `/${bucket}/${slug}`,
  });
  expect(nav).toEqual([
    {
      kind: "section",
      label: "Start here",
      items: [{ kind: "page", route: "/tutorials/a", label: "A" }],
    },
    {
      kind: "section",
      label: "Again",
      items: [{ kind: "page", route: "/tutorials/a", label: "A" }],
    },
  ]);
  // Only the primary placement orders prev/next.
  expect(order).toEqual([{ route: "/tutorials/a", section: ["Start here"] }]);
});

test("renderedSections hashes each heading's own content", () => {
  const body = "Intro.\n\n## One\n\nfirst\n\n### Sub\n\nnested\n\n## Two\n\nsecond\n";
  const before = renderedSections(body);
  expect(Object.keys(before)).toEqual([PREAMBLE_KEY, "one", "sub", "two"]);
  const after = renderedSections(body.replace("nested", "changed"));
  // Editing the subsection leaves its parent's own content unchanged.
  expect(after.one).toBe(before.one);
  expect(after.sub).not.toBe(before.sub);
  expect(after.two).toBe(before.two);
});
