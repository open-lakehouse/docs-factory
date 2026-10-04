import { expect, test } from "bun:test";
import type { NavNode } from "../../../doc-nav";
import { navBranches } from "./nav-tree";

const page = (bucket: string, slug: string, label = slug, primary = true): NavNode => ({
  kind: "page",
  bucket,
  slug,
  label,
  primary,
});

test("sections become branches keyed by their label trail", () => {
  const tree = navBranches(
    "uc",
    [
      {
        kind: "section",
        label: "Use",
        children: [{ kind: "section", label: "Tutorials", children: [page("tutorials", "t")] }],
      },
    ],
    () => undefined,
  );
  const outer = tree[0];
  if (outer.kind !== "branch") throw new Error("expected branch");
  expect(outer.id).toBe("nav:uc/Use");
  expect(outer.role).toBe("section");
  const inner = outer.children[0];
  if (inner.kind !== "branch") throw new Error("expected branch");
  expect(inner.id).toBe("nav:uc/Use/Tutorials");
});

test("pages carry the manifest label, a doc ref, and frontmatter status", () => {
  const [leaf] = navBranches("uc", [page("explanation", "what-is", "What is UC?")], (b, s) =>
    b === "explanation" && s === "what-is" ? "ready" : undefined,
  );
  if (leaf.kind !== "leaf") throw new Error("expected leaf");
  expect(leaf.label).toBe("What is UC?");
  expect(leaf.ref.project).toBe("uc");
  expect(leaf.ref.bucket).toBe("explanation");
  expect(leaf.ref.slug).toBe("what-is");
  expect(leaf.frontmatterStatus).toBe("ready");
});

test("planned slots map through and secondary placements are kept", () => {
  const tree = navBranches(
    "uc",
    [
      page("reference", "r"),
      { kind: "planned", id: "T02", title: "Register a table" },
      page("reference", "r", "r", false),
    ],
    () => undefined,
  );
  expect(tree.map((n) => n.kind)).toEqual(["leaf", "planned", "leaf"]);
  expect(tree[1]).toEqual({ kind: "planned", id: "T02", title: "Register a table" });
});
