// A page links one of its site's own files root-relative; a site mounted under
// a base serves it there.
import { expect, test } from "bun:test";
import remarkBaseLinks from "../../plugins/remark-base-links.mjs";

const tree = (...urls) => ({
  type: "root",
  children: [
    { type: "paragraph", children: urls.map((url) => ({ type: "link", url, children: [] })) },
  ],
});
const urls = (t) => t.children[0].children.map((n) => n.url);

test("an authored root-relative link gains the base; routed and external links don't", () => {
  const t = tree(
    "/env/uc-hybrid.tar.gz",
    "/docs/how-to/duckdb/",
    "/docs",
    "https://example.com/env/x",
    "//cdn.example.com/x",
    "#anchor",
  );
  remarkBaseLinks({ base: "/docs" })(t);
  expect(urls(t)).toEqual([
    "/docs/env/uc-hybrid.tar.gz",
    "/docs/how-to/duckdb/",
    "/docs",
    "https://example.com/env/x",
    "//cdn.example.com/x",
    "#anchor",
  ]);
});

test("a site at its host's root leaves links alone", () => {
  const t = tree("/env/unitycatalog.tar.gz");
  remarkBaseLinks({ base: "" })(t);
  expect(urls(t)).toEqual(["/env/unitycatalog.tar.gz"]);
});
