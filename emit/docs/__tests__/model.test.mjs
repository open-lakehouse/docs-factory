import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadModel, modelLinkResolver, readModel, trestleRefs, viewAltText } from "../model.mjs";

const model = readModel({
  elements: {
    deltaSpec: {
      title: "Delta Lake",
      description: { txt: "Open table format.\nACID over object storage." },
      links: [{ url: "https://delta.io" }],
      tags: ["public"],
    },
    "lakehouse.catalog": {
      title: "Catalog",
      summary: { txt: "The metadata authority." },
      tags: ["public"],
    },
    "lakehouse.table": { title: "Table", tags: ["public"] },
    hydrofoil: { title: "Hydrofoil", links: [{ url: "https://example.com/hydrofoil" }] },
  },
  views: {
    flow: { title: "A flow", description: { txt: "How it\nworks." } },
    bare: { title: "Bare" },
  },
});

test("summary falls back to the description's first sentence", () => {
  expect(model.elements.get("deltaSpec").summary).toBe("Open table format.");
  expect(model.elements.get("lakehouse.catalog").summary).toBe("The metadata authority.");
  expect(model.elements.get("lakehouse.table").summary).toBeNull();
});

test("model links prefer the explaining page, then the element's own link", () => {
  const resolve = modelLinkResolver(
    model,
    new Map([
      ["lakehouse.catalog", "/explanation/catalog"],
      ["deltaSpec", "/explanation/delta"],
    ]),
  );
  expect(resolve("lakehouse.catalog")).toEqual({
    url: "/explanation/catalog",
    title: "The metadata authority.",
  });
  expect(resolve("deltaSpec", { route: "/how-to/x" }).url).toBe("/explanation/delta");
  // The explaining page itself doesn't link to itself, even when an external link exists.
  expect(resolve("deltaSpec", { route: "/explanation/delta" })).toBeNull();
  expect(resolveExternal("deltaSpec")).toEqual({
    url: "https://delta.io",
    title: "Open table format.",
  });
  expect(resolve("lakehouse.table")).toBeNull();
  expect(resolve("unknown")).toBeNull();
});

test("an element without #public unwraps, even with an explainer or a link", () => {
  const resolve = modelLinkResolver(model, new Map([["hydrofoil", "/explanation/hydrofoil"]]));
  expect(resolve("hydrofoil")).toBeNull();
});

const resolveExternal = modelLinkResolver(model, new Map());

test("view alt text comes from the view's title and description", () => {
  expect(viewAltText(model, "flow")).toBe("A flow: How it works.");
  expect(viewAltText(model, "bare")).toBe("Bare");
  expect(viewAltText(model, "missing")).toBeNull();
});

test("the committed model resolves the ids content links to", () => {
  const live = loadModel();
  expect(live.elements.get("deltaSpec")?.link).toBe("https://delta.io");
  expect(live.views.has("ucCredentialVending_tableRead")).toBe(true);
});

test("trestle refs link a node's concepts like model: links, public-only", () => {
  const context = join(mkdtempSync(join(tmpdir(), "trestle-refs-")), "trestle-context.json");
  writeFileSync(
    context,
    JSON.stringify({
      roles: {
        data_catalog: { target: "lakehouse.catalog", scope: "full" },
        policy: { target: "hydrofoil", scope: "partial" },
        gateway: { unmapped: "infrastructure" },
      },
      concepts: {
        "lakehouse.catalog": {},
        "lakehouse.table": {},
        deltaSpec: { assets: ["lakehouse.table"] },
        hydrofoil: {},
      },
    }),
  );
  const resolve = modelLinkResolver(
    model,
    new Map([["lakehouse.catalog", "/explanation/catalog"]]),
  );
  const refs = trestleRefs(model, resolve, context);
  expect(refs.roles).toEqual({ data_catalog: { concept: "lakehouse.catalog", scope: "full" } });
  expect(refs.concepts["lakehouse.catalog"].href).toBe("/explanation/catalog");
  expect(refs.concepts.deltaSpec.href).toBe("https://delta.io");
  expect(refs.concepts.hydrofoil).toBeUndefined();
  expect(refs.concepts.deltaSpec.assets).toEqual(["lakehouse.table"]);
});

test("the committed trestle context maps the catalog role", () => {
  const refs = trestleRefs(loadModel(), () => null);
  expect(refs.roles.data_catalog).toEqual({ concept: "lakehouse.catalog", scope: "full" });
  expect(refs.concepts.unityCatalogOSS.kindLabel).toBe("Implementation");
  expect(refs.concepts.unityCatalogOSS.assets).toContain("lakehouse.table");
});
