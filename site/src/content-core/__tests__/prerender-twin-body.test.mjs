// prerender-shells renders the <noscript> body from the RICH .md twin, never the
// raw source. This covers twinBody(): it reads the twin at the canonical route path
// and strips the twin's leading frontmatter block, and returns null when no twin
// exists yet (build-md-twins must run first). The end-to-end "flattened, not raw"
// behavior is verified in the build; here we pin the read + strip contract.
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { twinPathForHref } from "../../../scripts/build-md-twins.mjs";
import { twinBody } from "../../../scripts/prerender-shells.mjs";

test("twinBody returns null when the twin isn't built yet", () => {
  expect(twinBody("/docs/nope/how-to/missing-twin-xyz")).toBeNull();
});

test("twinBody reads the twin at the canonical route and strips its frontmatter", () => {
  const href = "/docs/testproj/how-to/twin-body-fixture";
  const path = twinPathForHref(href);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      "---",
      "title: Fixture",
      "canonical: https://x.test/docs/testproj/how-to/twin-body-fixture",
      "---",
      "",
      "> **Warning**",
      ">",
      "> flattened body content",
      "",
    ].join("\n"),
  );
  try {
    const body = twinBody(href);
    // Frontmatter stripped; rich flattened body preserved.
    expect(body).not.toContain("canonical:");
    expect(body).not.toContain("title: Fixture");
    expect(body).toContain("> **Warning**");
    expect(body).toContain("flattened body content");
  } finally {
    rmSync(path, { force: true });
  }
});
