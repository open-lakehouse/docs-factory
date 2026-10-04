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
import { findQuote, locate, sourcePathForRef } from "./locate.js";

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
