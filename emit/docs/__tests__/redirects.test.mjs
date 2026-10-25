import { expect, test } from "bun:test";
import { redirectErrors } from "../redirects.mjs";

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
