// /llms.txt groups docs by Diátaxis + a Blog section, each entry linking the
// canonical route AND its .md twin. /llms-full.txt concatenates twin bodies under
// route headers. Exercises the pure renderLlmsIndex()/renderLlmsFull().
import { test, expect } from "bun:test";
import { renderLlmsIndex, renderLlmsFull } from "../../../scripts/build-site-llmstxt.mjs";

function docEntry(slug, diataxis) {
  return {
    identity: { area: "docs", project: "delta", bucket: diataxis === "how-to" ? "how-to" : "explanation", slug },
    diataxis,
    href: `/docs/delta/x/${slug}`,
    canonical: `https://x.test/docs/delta/x/${slug}`,
    twin: `https://x.test/docs/delta/x/${slug}.md`,
    title: `Doc ${slug}`,
    description: `About ${slug}.`,
  };
}
function blogEntry(slug) {
  return {
    identity: { area: "blogs", slug },
    href: `/blog/${slug}`,
    canonical: `https://x.test/blog/${slug}`,
    twin: `https://x.test/blog/${slug}.md`,
    title: `Post ${slug}`,
    description: `About ${slug}.`,
  };
}

test("llms.txt has Diátaxis sections + a Blog section", () => {
  const out = renderLlmsIndex([docEntry("read", "how-to"), docEntry("concepts", "explanation"), blogEntry("hello")]);
  expect(out).toContain("# Open Lakehouse documentation");
  expect(out).toContain("## How-to guides");
  expect(out).toContain("## Explanation");
  expect(out).toContain("## Blog");
});

test("each llms.txt entry links both the canonical route and its .md twin", () => {
  const out = renderLlmsIndex([docEntry("read", "how-to")]);
  expect(out).toContain("(https://x.test/docs/delta/x/read)");
  expect(out).toContain("([md](https://x.test/docs/delta/x/read.md))");
});

test("llms.txt lists the full-text corpus + runnable scripts resources", () => {
  const out = renderLlmsIndex([]);
  expect(out).toContain("/llms-full.txt");
  expect(out).toContain("/scripts.json");
});

test("llms-full.txt concatenates twin bodies under route headers, skipping empties", () => {
  const entries = [docEntry("read", "how-to"), docEntry("missing", "how-to")];
  const bodies = { "/docs/delta/x/read": "> **TL;DR**\n> rich twin body" };
  const out = renderLlmsFull(entries, (href) => bodies[href] ?? "");
  expect(out).toContain("# https://x.test/docs/delta/x/read");
  expect(out).toContain("rich twin body");
  // The page with no twin body is skipped, not emitted with an empty section.
  expect(out).not.toContain("/docs/delta/x/missing");
});
