// Push the content version manifest to the review API. Run after a deploy so the
// backend knows the current versions + section anchors of every draft/doc, which
// is what re-anchors open comment threads.
//
// Reads site/src/generated/content-versions.json (produced by
// `just version-manifest`) and calls RegisterVersion once per entry.
//
// Env:
//   API_URL       base URL of the review API (default http://localhost:8787)
//   BUILD_SECRET  shared secret the server checks (required)
//
// Run via `just register-versions` (local) or the CI post-deploy step.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { ReviewService } from "../src/gen/docs_factory/review/v1/review_service_pb.js";
import { ContentArea } from "../src/gen/docs_factory/review/v1/messages_pb.js";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../../site/src/generated/content-versions.json");

const apiUrl = process.env.API_URL ?? "http://localhost:8787";
const buildSecret = process.env.BUILD_SECRET;
if (!buildSecret) {
  console.error("BUILD_SECRET is required.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const client = createClient(ReviewService, createConnectTransport({ baseUrl: apiUrl, httpVersion: "1.1" }));

const areaEnum = (area) => (area === "docs" ? ContentArea.DOCS : ContentArea.BLOGS);

let ok = 0;
let orphanTotal = 0;
for (const e of manifest) {
  const res = await client.registerVersion({
    buildSecret,
    ref: { area: areaEnum(e.area), slug: e.slug, project: e.project, bucket: e.bucket },
    contentHash: e.contentHash,
    gitSha: e.gitSha,
    title: e.title,
    frontmatterStatus: e.frontmatterStatus,
    sections: e.headings.map((h) => ({
      anchorSlug: h.id,
      fingerprint: h.fingerprint,
      headingText: h.text,
      level: h.level,
      ordinal: h.order,
      text: h.bodyText ?? "",
      charLen: h.charLen ?? 0,
    })),
    snippets: (e.snippets ?? []).map((s) => ({
      path: s.path,
      region: s.region,
      startLine: s.startLine,
      endLine: s.endLine,
      fileHash: s.fileHash,
    })),
    sourceFiles: (e.sources ?? []).map((f) => ({
      path: f.path,
      text: f.text,
      fileHash: f.fileHash,
    })),
  });
  ok++;
  orphanTotal += res.orphanedThreadCount;
  console.log(`registered ${e.area}/${e.slug} (v${res.version?.id}, ${e.headings.length} sections, ${res.orphanedThreadCount} orphaned)`);
}
console.log(`Done: ${ok}/${manifest.length} registered; ${orphanTotal} thread(s) orphaned.`);
