import { expect, test } from "bun:test";
import { redirectErrors, resolveRedirects } from "../redirects.mjs";
import { projectRoutes } from "../sites/routes.mjs";

const anchors = new Map([
  ["/", new Set()],
  ["/how-to/run-local-server", new Set(["run-the-uc-cli"])],
]);
const files = new Map([["public/env/unitycatalog.tar.gz", ""]]);
const check = (...redirects) =>
  redirectErrors(
    { redirects: redirects.map(([source, destination]) => ({ source, destination })) },
    { anchors, files },
  );

test("a redirect to a served page, heading, or file passes", () => {
  expect(
    check(
      ["/docker_compose", "/how-to/run-local-server"],
      ["/usage/cli", "/how-to/run-local-server#run-the-uc-cli"],
      ["/env/uc-docs-env.tar.gz", "/env/unitycatalog.tar.gz"],
      ["/slack", "https://go.unitycatalog.io/slack"],
    ),
  ).toEqual([]);
});

test("a redirect to an unserved route or a missing heading fails", () => {
  expect(
    check(["/quickstart", "/tutorials/gone"], ["/usage/cli", "/how-to/run-local-server#cli"]),
  ).toEqual([
    "/quickstart → /tutorials/gone: not a route this emit serves",
    "/usage/cli → /how-to/run-local-server#cli: /how-to/run-local-server has no heading #cli",
  ]);
});

test("a config without redirects has nothing to check", () => {
  expect(redirectErrors({}, { anchors, files })).toEqual([]);
});

const mounted = {
  base: "/docs",
  project: "unitycatalog",
  hrefFor: projectRoutes("unitycatalog", { base: "/docs", apiPath: "/api", trailingSlash: true }),
};
const served = {
  anchors: new Map([
    ["/docs/how-to/run-local-server/", new Set(["run-the-uc-cli"])],
    ["/docs/api/catalog/", new Set()],
  ]),
  files: new Map([["public/docs/env/unitycatalog.tar.gz", ""]]),
};

test("resolveRedirects prefixes the base and routes each target", () => {
  const { redirects, patterns, errors } = resolveRedirects(
    {
      redirects: {
        "/Docker_Compose": { page: "how-to/run-local-server" },
        "/usage/cli": { page: "how-to/run-local-server", anchor: "run-the-uc-cli" },
        "/reference/api": { api: "catalog" },
        "/env/uc-docs-env.tar.gz": { file: "/env/unitycatalog.tar.gz" },
      },
      patterns: [{ source: "^/ai/integrations/[^/]+/?$", to: { page: "how-to/run-local-server" } }],
    },
    mounted,
    served,
  );
  expect(errors).toEqual([]);
  expect(redirects).toEqual({
    "/docs/docker_compose": "/docs/how-to/run-local-server/",
    "/docs/usage/cli": "/docs/how-to/run-local-server/#run-the-uc-cli",
    "/docs/reference/api": "/docs/api/catalog/",
    "/docs/env/uc-docs-env.tar.gz": "/docs/env/unitycatalog.tar.gz",
  });
  expect(patterns).toEqual([
    { source: "^/docs/ai/integrations/[^/]+/?$", destination: "/docs/how-to/run-local-server/" },
  ]);
});

test("resolveRedirects reports a target this emit doesn't serve", () => {
  const { errors } = resolveRedirects(
    {
      redirects: {
        "/gone": { page: "how-to/missing" },
        "/bad-anchor": { page: "how-to/run-local-server", anchor: "nope" },
      },
    },
    mounted,
    served,
  );
  expect(errors).toHaveLength(2);
  expect(errors[0]).toContain("/docs/gone");
  expect(errors[1]).toContain("#nope");
});
