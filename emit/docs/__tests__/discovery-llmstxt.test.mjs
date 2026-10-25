// /llms.txt groups docs by Diátaxis + a Blog section, each entry linking the
// canonical route AND its .md twin. /llms-full.txt concatenates twin bodies under
// route headers. Exercises the pure renderLlmsIndex()/renderLlmsFull().
import { expect, test } from "bun:test";
import { renderHomeTwin, renderLlmsFull, renderLlmsIndex } from "../discovery.mjs";

const SITE = { title: "Test docs", summary: "Test summary." };

function docEntry(slug, diataxis) {
  return {
    identity: {
      area: "docs",
      project: "delta",
      bucket: diataxis === "how-to" ? "how-to" : "explanation",
      slug,
    },
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
  const out = renderLlmsIndex(
    [docEntry("read", "how-to"), docEntry("concepts", "explanation"), blogEntry("hello")],
    SITE,
  );
  expect(out).toContain("# Test docs");
  expect(out).toContain("## How-to guides");
  expect(out).toContain("## Explanation");
  expect(out).toContain("## Blog");
});

test("each llms.txt entry links both the canonical route and its .md twin", () => {
  const out = renderLlmsIndex([docEntry("read", "how-to")], SITE);
  expect(out).toContain("(https://x.test/docs/delta/x/read)");
  expect(out).toContain("([md](https://x.test/docs/delta/x/read.md))");
});

test("llms.txt lists the full-text corpus + runnable scripts resources", () => {
  const out = renderLlmsIndex([], SITE);
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

test("llms.txt resources resolve against the origin a site passes", () => {
  const out = renderLlmsIndex([], { ...SITE, origin: "https://x.test" });
  expect(out).toContain("(https://x.test/llms-full.txt)");
  expect(out).toContain("(https://x.test/scripts.json)");
});

test("llms.txt points agents at the env index when the site has one", () => {
  const out = renderLlmsIndex([docEntry("read", "how-to")], {
    ...SITE,
    origin: "https://x.test",
    environments: {
      index: "https://x.test/env/environments.json",
      guide: "https://x.test/how-to/run-local-server.md",
    },
  });
  expect(out).toContain("- [Local environment](https://x.test/env/environments.json)");
  expect(out).toContain("each with its own archive");
  expect(out).toContain("Setup guide: https://x.test/how-to/run-local-server.md.");
  expect(renderLlmsIndex([], SITE)).not.toContain("Local environment");
});

test("llms.txt links concepts.json when the site emits one", () => {
  const opts = { ...SITE, origin: "https://x.test" };
  expect(renderLlmsIndex([], opts)).not.toContain("concepts.json");
  expect(renderLlmsIndex([], { ...opts, concepts: true })).toContain(
    "- [Concepts](https://x.test/concepts.json): ",
  );
});

test("llms.txt lists the home page's twin only when asked", () => {
  const line = "- [Home](https://x.test/index.md): a map of every page, with summaries.";
  expect(renderLlmsIndex([], { ...SITE, origin: "https://x.test", home: true })).toContain(line);
  expect(renderLlmsIndex([], { ...SITE, origin: "https://x.test" })).not.toContain(line);
});

test("the home twin maps the nav with summaries, the start commands, and the APIs", () => {
  const md = renderHomeTwin({
    title: "Docs",
    tagline: "The tagline.",
    origin: "https://x.test",
    nav: [
      {
        kind: "section",
        label: "Start here",
        items: [
          { kind: "page", route: "/tutorials/start", label: "Start" },
          {
            kind: "section",
            label: "More",
            items: [{ kind: "page", route: "/how-to/more", label: "More" }],
          },
        ],
      },
    ],
    pages: [
      {
        route: "/tutorials/start",
        title: "Start",
        summary: "Begin here.",
        environment: { commands: ["docker compose up -d"] },
      },
      { route: "/how-to/more", title: "More", summary: null },
    ],
    apis: [{ title: "Core API", route: "/reference/api/core", summary: "The core." }],
    start: {
      route: "/tutorials/start",
      title: "Start",
      environment: { commands: ["docker compose up -d"] },
    },
  });
  expect(md).toStartWith(
    '---\ntitle: "Docs"\ndescription: "The tagline."\ncanonical: https://x.test/\n---\n',
  );
  expect(md).toContain("```bash\ndocker compose up -d\n```");
  expect(md).toContain(
    "## Start here\n\n- [Start](https://x.test/tutorials/start.md): Begin here.\n\n### More\n\n- [More](https://x.test/how-to/more.md)\n",
  );
  expect(md).toContain(
    "## API reference\n\n- [Core API](https://x.test/reference/api/core.md): The core.\n",
  );
  expect(md).not.toContain("\n\n\n");
});
