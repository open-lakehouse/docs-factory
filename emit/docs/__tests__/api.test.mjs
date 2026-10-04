// REST API references: routes and spec URLs from a site's `api` block, and
// their llms.txt section.
import { expect, test } from "bun:test";
import { apiEntries, apiIndexRoute } from "../api.mjs";
import { renderLlmsIndex } from "../discovery.mjs";
import uc from "../sites/unitycatalog-docs.mjs";

const site = {
  name: "test",
  hrefFor: (id) => (id.area === "api" ? `/reference/api${id.slug ? `/${id.slug}` : ""}` : null),
  api: {
    repo: "acme/widgets",
    ref: "v1.2.0",
    specs: [{ slug: "core", title: "Core API", summary: "The core.", file: "api/core.yaml" }],
  },
};

test("apiEntries pins spec and source URLs to the configured ref", () => {
  expect(apiEntries(site)).toEqual([
    {
      route: "/reference/api/core",
      slug: "core",
      title: "Core API",
      summary: "The core.",
      ref: "v1.2.0",
      specUrl: "https://raw.githubusercontent.com/acme/widgets/v1.2.0/api/core.yaml",
      sourceUrl: "https://github.com/acme/widgets/blob/v1.2.0/api/core.yaml",
      serverUrl: null,
      default: true,
    },
  ]);
});

test("a spec can pin another repo and ref, and set its server URL", () => {
  const [, upstream] = apiEntries({
    ...site,
    api: {
      ...site.api,
      specs: [
        ...site.api.specs,
        {
          slug: "up",
          title: "Upstream",
          summary: "S.",
          repo: "other/spec",
          ref: "r9",
          file: "spec.yaml",
          serverUrl: "http://localhost:1/x",
        },
      ],
    },
  });
  expect(upstream).toMatchObject({
    ref: "r9",
    specUrl: "https://raw.githubusercontent.com/other/spec/r9/spec.yaml",
    serverUrl: "http://localhost:1/x",
    default: false,
  });
});

test("the default is the declared slug, else the first, and must exist", () => {
  const two = {
    ...site,
    api: {
      ...site.api,
      specs: [...site.api.specs, { slug: "b", title: "B", summary: "B.", file: "b.yaml" }],
    },
  };
  expect(apiEntries(two).map((a) => a.default)).toEqual([true, false]);
  expect(apiEntries({ ...two, api: { ...two.api, default: "b" } }).map((a) => a.default)).toEqual([
    false,
    true,
  ]);
  expect(() => apiEntries({ ...two, api: { ...two.api, default: "nope" } })).toThrow(
    /default API "nope" is not declared/,
  );
  expect(apiIndexRoute(two)).toBe("/reference/api");
  expect(apiIndexRoute({ ...two, api: undefined })).toBeNull();
});

test("apiEntries is empty without an api block and fails on an unroutable spec", () => {
  expect(apiEntries({ ...site, api: undefined })).toEqual([]);
  expect(() => apiEntries({ ...site, hrefFor: () => null })).toThrow(/no route for API "core"/);
});

test("the UC site routes every declared spec", () => {
  const routes = apiEntries(uc).map((a) => a.route);
  expect(routes).toEqual([
    "/reference/api/catalog",
    "/reference/api/control",
    "/reference/api/delta",
    "/reference/api/iceberg",
  ]);
  expect(apiEntries(uc).find((a) => a.default)?.slug).toBe("catalog");
});

const apis = apiEntries(site);

test("llms.txt links each API's route and OpenAPI spec", () => {
  const out = renderLlmsIndex([], { title: "T", summary: "S", origin: "https://x.test", apis });
  expect(out).toContain("## API reference");
  expect(out).toContain(
    "- [Core API](https://x.test/reference/api/core) ([OpenAPI](https://raw.githubusercontent.com/acme/widgets/v1.2.0/api/core.yaml)): The core.",
  );
  expect(renderLlmsIndex([], { title: "T", summary: "S" })).not.toContain("## API reference");
});
