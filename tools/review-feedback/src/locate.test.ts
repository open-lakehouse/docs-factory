import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { hashLineSync } from "../../../site/src/content-core/hash.mjs";
import {
  CodeSelectorSchema,
  CommentSchema,
  CommentScope,
  ContentArea,
  ContentRefSchema,
  TextSelectorSchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import {
  findQuote,
  locate,
  mapLines,
  matchSuggestion,
  parseHunks,
  sourcePathForRef,
} from "./locate.js";

const PAGE = "content/unitycatalog/how-to/002-create-tables/index.md";
const SNIPPET = "content/unitycatalog/how-to/002-create-tables/snippets/create.py";

const PAGE_V1 = `---
title: Create tables
diataxis: how-to
project: unitycatalog
---

Intro paragraph.

## Prerequisites

You need a **running** Unity Catalog server and the
[Python client](https://example.com) installed.

## Create a managed table

Run the following to create a table.
`;

const SNIPPET_V1 = `import asyncio

async def main():
    client = connect()
    await client.create_table("t")
`;

const INTRO_PAGE = "content/unitycatalog/explanation/001-what-is/index.md";
const INTRO_V1 = `---
title: What is it?
summary: A catalog server that tracks tables,
  volumes, and who may use them.
diataxis: explanation
project: unitycatalog
---

It keeps track of which tables exist,
and where their data lives.

## Details

More.
`;

const HIST_PAGE = "content/unitycatalog/how-to/003-share-folders/index.md";
const HIST_V1 = `---
title: Share folders
diataxis: how-to
project: unitycatalog
---

## Download the environment

Fetch the archive and unpack it.

## Share a folder with the server

Mount a host folder so the server
can read files you place there,
then restart the container.

## Check the server

The same sentence twice.
Other words first. The same sentence twice.
`;

let repo: string;
let sha1: string;
const readHist = () => readFileSync(join(repo, HIST_PAGE), "utf8");
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
function write(path: string, text: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "review-feedback-"));
  git("init", "-q");
  write(PAGE, PAGE_V1);
  write(SNIPPET, SNIPPET_V1);
  write(INTRO_PAGE, INTRO_V1);
  write(HIST_PAGE, HIST_V1);
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-gpg-sign", "-m", "v1");
  sha1 = git("rev-parse", "HEAD");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

const ref = create(ContentRefSchema, {
  area: ContentArea.DOCS,
  project: "unitycatalog",
  bucket: "how-to",
  slug: "create-tables",
});

function prose(anchorSlug: string, quote?: string, fingerprint = "") {
  return create(CommentSchema, {
    id: "c1",
    ref,
    anchorSlug,
    anchorFingerprint: fingerprint,
    authoredGitSha: sha1,
    selector: quote ? create(TextSelectorSchema, { quote }) : undefined,
  });
}

describe("sourcePathForRef", () => {
  test("resolves a folder-mode page through its NNN- order prefix", () => {
    expect(sourcePathForRef(repo, ref)).toBe(PAGE);
  });
  test("undefined for a page not in this checkout", () => {
    expect(sourcePathForRef(repo, { ...ref, slug: "nope" })).toBeUndefined();
  });
});

describe("locate prose", () => {
  test("a quote across a soft line break, through markdown emphasis and links", () => {
    const loc = locate(
      repo,
      prose("prerequisites", "a running unity catalog server and the python client"),
    );
    expect(loc?.precision).toBe("quote");
    expect([loc?.startLine, loc?.endLine]).toEqual([11, 12]);
    expect(loc?.drifted).toBe(false);
  });

  test("a heading-level comment covers the section", () => {
    const loc = locate(repo, prose("create-a-managed-table"));
    expect(loc?.precision).toBe("section");
    expect(loc?.startLine).toBe(14);
    expect(loc?.excerpt?.split("\n")[0]).toBe("## Create a managed table");
  });

  test("unknown heading id falls back to the fingerprint", () => {
    const loc = locate(repo, prose("old-id", undefined, "prerequisites"));
    expect(loc?.precision).toBe("section");
    expect(loc?.startLine).toBe(9);
  });

  test("an edited quote degrades to the section with a note", () => {
    const loc = locate(repo, prose("prerequisites", "text that is no longer there"));
    expect(loc?.precision).toBe("section");
    expect(loc?.note).toContain("not found");
  });

  test("a removed heading resolves to the file only", () => {
    const loc = locate(repo, prose("gone", undefined, "gone"));
    expect(loc?.precision).toBe("file");
    expect(loc?.path).toBe(PAGE);
  });
  test("a DOCUMENT-scoped thread maps to the whole file", () => {
    const loc = locate(repo, { ...prose(""), scope: CommentScope.DOCUMENT });
    expect(loc).toEqual({ path: PAGE, precision: "file", drifted: false });
  });
});

describe("locate prose before the first heading", () => {
  const introRef = create(ContentRefSchema, {
    area: ContentArea.DOCS,
    project: "unitycatalog",
    bucket: "explanation",
    slug: "what-is",
  });
  const intro = (anchorSlug: string, quote?: string) =>
    create(CommentSchema, {
      id: "c3",
      ref: introRef,
      anchorSlug,
      authoredGitSha: sha1,
      selector: quote ? create(TextSelectorSchema, { quote }) : undefined,
    });

  test.each(["", "__preamble__"])("anchor %p finds a quote in the intro", (slug) => {
    const loc = locate(repo, intro(slug, "track of which tables exist, and where"));
    expect(loc?.precision).toBe("quote");
    expect([loc?.startLine, loc?.endLine]).toEqual([9, 10]);
    expect(loc?.note).toBeUndefined();
  });

  test("a quote in a rendered frontmatter field maps to its line", () => {
    const loc = locate(repo, intro("", "What is it?"));
    expect(loc?.precision).toBe("quote");
    expect([loc?.startLine, loc?.endLine]).toEqual([2, 2]);
    expect(loc?.note).toContain("frontmatter");
  });

  test("a quote from the summary into the body, joined without a space", () => {
    const loc = locate(
      repo,
      intro(
        "",
        "A catalog server that tracks tables, volumes, and who may use them.It keeps track of which tables exist, and where their data lives.",
      ),
    );
    expect(loc?.precision).toBe("quote");
    expect([loc?.startLine, loc?.endLine]).toEqual([3, 10]);
  });

  test("a page-level comment covers the intro", () => {
    const loc = locate(repo, intro(""));
    expect(loc?.precision).toBe("section");
    expect([loc?.startLine, loc?.endLine]).toEqual([9, 11]);
  });

  test("an edited intro quote degrades to the intro with a note", () => {
    const loc = locate(repo, intro("__preamble__", "text that is no longer there"));
    expect(loc?.precision).toBe("section");
    expect(loc?.note).toContain("before the first heading");
  });
});

describe("locate code", () => {
  const code = (line: number, endLine: number, text: string) =>
    create(CommentSchema, {
      id: "c2",
      ref,
      anchorSlug: "create-a-managed-table",
      authoredGitSha: sha1,
      codeSelector: create(CodeSelectorSchema, {
        path: SNIPPET,
        line,
        endLine,
        lineHash: hashLineSync(text),
      }),
    });

  test("the commented line, by number when its hash still matches", () => {
    const loc = locate(repo, code(4, 5, "    client = connect()"));
    expect(loc?.precision).toBe("code-line");
    expect([loc?.startLine, loc?.endLine]).toEqual([4, 5]);
  });

  test("follows a moved line by hash and flags drift", () => {
    write(SNIPPET, `# header\n\n${SNIPPET_V1}`);
    const loc = locate(repo, code(4, 5, "    client = connect()"));
    expect([loc?.startLine, loc?.endLine]).toEqual([6, 7]);
    expect(loc?.drifted).toBe(true);
    write(SNIPPET, SNIPPET_V1);
  });
});

test("findQuote returns undefined for a too-short needle", () => {
  expect(findQuote(["abc"], 1, 1, "ab")).toBeUndefined();
});

describe("matchSuggestion", () => {
  const raw = [
    "Intro.",
    "Run the following to create",
    "a table in the catalog.",
    "You need a **running** server.",
    "    client = connect()",
    '    await client.create_table("t")',
  ].join("\n");

  test("plain prose matches across a soft line break", () => {
    expect(matchSuggestion(raw, { startLine: 2, endLine: 3 }, "create a table", false)).toEqual({
      startLine: 2,
      endLine: 3,
      source: "create\na table",
    });
  });

  test("prose through inline markup has no literal match", () => {
    expect(
      matchSuggestion(raw, { startLine: 4, endLine: 4 }, "You need a running server.", false),
    ).toBeUndefined();
  });

  test("code matches dedented lines and returns them as in the source", () => {
    const original = 'client = connect()\nawait client.create_table("t")';
    expect(matchSuggestion(raw, { startLine: 5, endLine: 6 }, original, true)).toEqual({
      startLine: 5,
      endLine: 6,
      source: '    client = connect()\n    await client.create_table("t")',
    });
  });

  test("no location, no match", () => {
    expect(matchSuggestion(raw, {}, "Intro.", false)).toBeUndefined();
  });
});

describe("follow comments through edits", () => {
  const histRef = create(ContentRefSchema, {
    area: ContentArea.DOCS,
    project: "unitycatalog",
    bucket: "how-to",
    slug: "share-folders",
  });
  const comment = (
    anchorSlug: string,
    selector?: { quote: string; prefix?: string; suffix?: string },
    authoredGitSha = sha1,
  ) =>
    create(CommentSchema, {
      id: "c4",
      ref: histRef,
      anchorSlug,
      authoredGitSha,
      selector: selector ? create(TextSelectorSchema, selector) : undefined,
    });
  const QUOTE = "mount a host folder so the server can read files you place there";
  const edit = (from: string, to: string) => write(HIST_PAGE, HIST_V1.replace(from, to));

  afterAll(() => write(HIST_PAGE, HIST_V1));

  test("a quote under a removed heading is found elsewhere on the page", () => {
    edit("## Share a folder with the server\n\n", "");
    const loc = locate(repo, comment("share-a-folder-with-the-server", { quote: QUOTE }));
    expect(loc?.precision).toBe("moved");
    expect([loc?.startLine, loc?.endLine]).toEqual([11, 12]);
    expect(loc?.note).toContain("#download-the-environment");
  });

  test("a quote moved out of a surviving section", () => {
    edit(
      "Mount a host folder so the server\ncan read files you place there,\nthen restart the container.",
      "Then restart the container.",
    );
    write(
      HIST_PAGE,
      `${readHist()}\nMount a host folder so the server\ncan read files you place there.\n`,
    );
    const loc = locate(repo, comment("share-a-folder-with-the-server", { quote: QUOTE }));
    expect(loc?.precision).toBe("moved");
    expect(loc?.note).toContain("#check-the-server");
  });

  test("a repeated quote picks the occurrence its prefix frames", () => {
    write(HIST_PAGE, HIST_V1);
    const quote = "the same sentence twice";
    expect(locate(repo, comment("check-the-server", { quote }))?.startLine).toBe(19);
    const framed = locate(
      repo,
      comment("check-the-server", { quote, prefix: "other words first." }),
    );
    expect(framed?.startLine).toBe(20);
  });

  test("an edited passage is followed through the diff from the authored commit", () => {
    edit("can read files you place there,", "can read the files you put there,");
    const loc = locate(repo, comment("share-a-folder-with-the-server", { quote: QUOTE }));
    expect(loc?.precision).toBe("moved");
    expect([loc?.startLine, loc?.endLine]).toEqual([13, 14]);
    expect(loc?.note).toContain("through the diff");
    expect(loc?.note).toContain("edited since");
  });

  test("a passage moved and edited is followed by its unchanged lines", () => {
    write(
      HIST_PAGE,
      HIST_V1.replace(
        "## Share a folder with the server\n\nMount a host folder so the server\ncan read files you place there,\nthen restart the container.\n\n",
        "",
      ).replace(
        "The same sentence twice.\n",
        "The same sentence twice.\nMount the host folder so the server\ncan read files you place there,\nthen restart it.\n",
      ),
    );
    const loc = locate(repo, comment("share-a-folder-with-the-server", { quote: QUOTE }));
    expect(loc?.precision).toBe("moved");
    expect([loc?.startLine, loc?.endLine]).toEqual([15, 15]);
    expect(loc?.note).toContain("lines 13-14 at");
    expect(loc?.note).toContain("1 of their 2 lines");
  });

  test("an unknown authored commit skips the history", () => {
    edit("## Share a folder with the server\n\nMount a host folder so the server\n", "Mount it\n");
    const loc = locate(
      repo,
      comment("share-a-folder-with-the-server", { quote: QUOTE }, "0".repeat(40)),
    );
    expect(loc?.precision).toBe("file");
    expect(loc?.drifted).toBe(false);
  });

  test("a quote whose start alone still matches says so", () => {
    write(HIST_PAGE, HIST_V1);
    const quote = `${QUOTE}, then restart the container and wait for it to come back up again`;
    const loc = locate(repo, comment("share-a-folder-with-the-server", { quote }));
    expect(loc?.precision).toBe("quote");
    expect(loc?.note).toContain("only the start");
  });

  test("lists the commits that touched the page since the comment", () => {
    edit("Fetch the archive", "Download the archive");
    git(
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-qam",
      "reword download",
      "--no-gpg-sign",
    );
    const loc = locate(repo, comment("share-a-folder-with-the-server", { quote: QUOTE }));
    expect(loc?.precision).toBe("quote");
    expect(loc?.drifted).toBe(true);
    expect(loc?.history?.total).toBe(1);
    expect(loc?.history?.commits[0].subject).toBe("reword download");
    git("reset", "-q", "--hard", sha1);
  });
});

describe("mapLines", () => {
  const hunks = parseHunks(
    [
      "@@ -2 +1,0 @@",
      "-gone",
      "@@ -5,2 +4,3 @@",
      "-a",
      "-b",
      "+x",
      "+y",
      "+z",
      "@@ -9,0 +9,2 @@",
    ].join("\n"),
  );

  test("parses counts, defaulting to one", () => {
    expect(hunks[0]).toEqual({ oldStart: 2, oldCount: 1, newStart: 1, newCount: 0 });
  });
  test("an untouched range shifts by the hunks before it", () => {
    expect(mapLines(hunks, 7, 8)).toEqual({ start: 7, end: 8, edited: false });
    expect(mapLines(hunks, 10, 10)).toEqual({ start: 12, end: 12, edited: false });
  });
  test("a range inside a hunk maps to its replacement", () => {
    expect(mapLines(hunks, 5, 6)).toEqual({ start: 4, end: 6, edited: true });
  });
  test("a range deleted outright maps to nothing", () => {
    expect(mapLines(hunks, 2, 2)).toBeUndefined();
  });
});
