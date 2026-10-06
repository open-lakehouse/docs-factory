// nav.yml resolution contract: pages resolve by docIdentity bucket/slug, the
// first occurrence is primary, and every error class the prebuild gate relies on
// is reported.
import { expect, test } from "bun:test";
import { primaryPlacements, resolveNav } from "../nav.mjs";

const docs = [
  { bucket: "explanation", slug: "what-is-uc", title: "What is UC?" },
  { bucket: "tutorials", slug: "getting-started", title: "Getting started" },
];

const ok = {
  nav: [
    {
      section: "Start here",
      items: [
        { page: "explanation/what-is-uc", id: "E01" },
        { planned: "R01", title: "Scope and limitations" },
        { page: "tutorials/getting-started", label: "First catalog" },
      ],
    },
    { section: "Concepts", items: [{ page: "explanation/what-is-uc" }] },
  ],
};

test("resolves pages, planned entries, and label overrides", () => {
  const { tree, errors } = resolveNav(ok, docs);
  expect(errors).toEqual([]);
  const [start] = tree;
  expect(start.kind).toBe("section");
  expect(start.children.map((n) => n.kind)).toEqual(["page", "planned", "page"]);
  expect(start.children[0]).toMatchObject({ label: "What is UC?", id: "E01", primary: true });
  expect(start.children[2].label).toBe("First catalog");
});

test("first occurrence is primary; later ones are cross-links", () => {
  const { tree } = resolveNav(ok, docs);
  expect(tree[1].children[0].primary).toBe(false);
  const placements = primaryPlacements(tree);
  expect(placements.map((p) => p.node.slug)).toEqual(["what-is-uc", "getting-started"]);
  expect(placements[0].trail).toEqual(["Start here"]);
});

test("unknown page and orphan are errors", () => {
  const { errors } = resolveNav(
    { nav: [{ section: "S", items: [{ page: "how-to/missing" }] }] },
    docs,
  );
  expect(errors.some((e) => e.includes('unknown page "how-to/missing"'))).toBe(true);
  expect(errors.filter((e) => e.includes("orphan"))).toHaveLength(2);
});

test("duplicate ids across page and planned entries are errors", () => {
  const { errors } = resolveNav(
    {
      nav: [
        {
          section: "S",
          items: [
            { page: "explanation/what-is-uc", id: "E01" },
            { page: "tutorials/getting-started" },
            { planned: "E01", title: "dup" },
          ],
        },
      ],
    },
    docs,
  );
  expect(errors).toEqual(['nav[0].items[2]: duplicate id "E01"']);
});

test("empty sections, over-deep nesting, and malformed entries are errors", () => {
  const deep = {
    section: "a",
    items: [
      {
        section: "b",
        items: [
          { section: "c", items: [{ section: "d", items: [{ page: "explanation/what-is-uc" }] }] },
        ],
      },
    ],
  };
  const { errors } = resolveNav(
    {
      nav: [
        deep,
        { section: "empty", items: [] },
        { page: "tutorials/getting-started", planned: "X" },
        { planned: "R02" },
      ],
    },
    docs,
  );
  expect(errors.some((e) => e.includes("nest deeper than 3"))).toBe(true);
  expect(errors.some((e) => e.includes("section has no items"))).toBe(true);
  expect(errors.some((e) => e.includes("exactly one of"))).toBe(true);
  expect(errors.some((e) => e.includes('planned "R02" needs a title'))).toBe(true);
});

test("a manifest without a nav list is rejected", () => {
  expect(resolveNav({}, docs).errors).toEqual(["nav.yml: expected a top-level `nav:` list"]);
});

test("a planned slot keeps the content request it was promoted from", () => {
  const request = "0199b6c4-2f1e-7a3b-9c4d-5e6f7a8b9c0d";
  const { tree, errors } = resolveNav(
    {
      nav: [
        {
          section: "Start here",
          items: [
            { page: "explanation/what-is-uc" },
            { page: "tutorials/getting-started" },
            { planned: "T09", title: "Requested", request },
            { planned: "T10", title: "Bad ref", request: "not-a-uuid" },
          ],
        },
      ],
    },
    docs,
  );
  expect(tree[0].children[2]).toEqual({ kind: "planned", id: "T09", title: "Requested", request });
  expect(errors).toEqual([
    'nav[0].items[3]: planned "T10" request must be a content request id (uuid)',
  ]);
});
