import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { create } from "@bufbuild/protobuf";
import { hashLineSync } from "../../../site/src/content-core/hash.mjs";
import {
  CodeSelectorSchema,
  CommentSchema,
  ContentArea,
  ContentRefSchema,
  TextSelectorSchema,
} from "./gen/docs_factory/review/v1/messages_pb.js";
import { findQuote, locate, matchSuggestion, sourcePathForRef } from "./locate.js";

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

let repo: string;
let sha1: string;
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
