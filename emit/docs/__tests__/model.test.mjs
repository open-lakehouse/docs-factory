import { expect, test } from "bun:test";
import { loadModel, modelLinkResolver, readModel, viewAltText } from "../model.mjs";

const model = readModel({
  elements: {
    deltaSpec: {
      title: "Delta Lake",
      description: { txt: "Open table format.\nACID over object storage." },
      links: [{ url: "https://delta.io" }],
    },
    "lakehouse.catalog": { title: "Catalog", summary: { txt: "The metadata authority." } },
    "lakehouse.table": { title: "Table" },
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
