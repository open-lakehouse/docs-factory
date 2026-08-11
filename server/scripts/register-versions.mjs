// Push the content version manifest to the review API. Run after a deploy so the
// backend knows the current versions + section anchors of every draft/doc, which
// is what re-anchors open comment threads.
//
// Reads site/src/generated/content-versions.json (produced by
// `just version-manifest`) and calls RegisterVersion once per entry.
//
// Auth: RegisterVersion is guarded by a GitHub Actions OIDC token (not a tracked
// secret). On a runner with `permissions: id-token: write`, GitHub exposes
// ACTIONS_ID_TOKEN_REQUEST_URL + ACTIONS_ID_TOKEN_REQUEST_TOKEN; we mint a token
// for our fixed audience and send it as `Authorization: Bearer`. The server
// verifies it against GitHub's JWKS and pins the repo + environment claims (see
// server/src/auth/github-oidc.ts). Locally those env vars are absent and the
// server runs dev-open, so no token is fetched.
//
// Env:
//   API_URL  base URL of the review API (default http://localhost:8787)
//   ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN
//            injected by GitHub Actions when id-token: write is granted; absent locally
//
// Run via `just register-versions` (local) or the post-merge GitHub Action
// (.github/workflows/register-versions.yml, currently DISABLED — manual only).
//
// Provenance split: PR-time CI (ci.yml, job `review-api`) only VERIFIES the
// content-derived fields of the manifest (hashes + section anchors); it does
// NOT commit the manifest and does NOT register. The authoritative git_sha
// comes from THIS script running post-merge, where `git rev-parse HEAD` is the
// real merged main sha (PR branches squash-merge, so their sha never lands).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { ContentArea } from "../src/gen/docs_factory/review/v1/messages_pb.js";
import { ReviewService } from "../src/gen/docs_factory/review/v1/review_service_pb.js";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../../site/src/generated/content-versions.json");

const apiUrl = process.env.API_URL ?? "http://localhost:8787";

// Fixed audience — must match REGISTER_AUDIENCE in server/src/auth/github-oidc.ts.
const REGISTER_AUDIENCE = "docs-factory-register";

// Mint a GitHub Actions OIDC token for our audience, or null when not running on
// a runner with id-token: write (e.g. local dev, where the server is dev-open).
async function fetchOidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !reqToken) return null;
  const res = await fetch(`${url}&audience=${encodeURIComponent(REGISTER_AUDIENCE)}`, {
    headers: { Authorization: `Bearer ${reqToken}` },
  });
  if (!res.ok) {
    throw new Error(`OIDC token request failed: ${res.status} ${res.statusText}`);
  }
  const { value } = await res.json();
  if (!value) throw new Error("OIDC token response had no `value`.");
  return value;
}

// Decode a JWT payload for logging (NOT verification) — the header/payload are
// unsigned base64url and carry no secret, so this is safe to print in CI.
function decodeJwtPayload(jwt) {
  try {
    const [, payload] = jwt.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const oidcToken = await fetchOidcToken();
if (oidcToken) {
  const p = decodeJwtPayload(oidcToken) ?? {};
  // Diagnostic: what the server will verify + pin against. No token printed.
  console.log(
    `OIDC token acquired: iss=${p.iss} aud=${JSON.stringify(p.aud)} repository=${p.repository} environment=${p.environment} ref=${p.ref}`,
  );
}

// Interceptor that attaches the OIDC bearer to every RPC (when we have one).
const authInterceptor = (next) => async (req) => {
  if (oidcToken) req.header.set("Authorization", `Bearer ${oidcToken}`);
  return next(req);
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const client = createClient(
  ReviewService,
  createConnectTransport({ baseUrl: apiUrl, httpVersion: "1.1", interceptors: [authInterceptor] }),
);

const areaEnum = (area) => (area === "docs" ? ContentArea.DOCS : ContentArea.BLOGS);

let ok = 0;
let orphanTotal = 0;
for (const e of manifest) {
  const res = await client.registerVersion({
    ref: { area: areaEnum(e.area), slug: e.slug, project: e.project, bucket: e.bucket },
    contentHash: e.contentHash,
    gitSha: e.gitSha,
    title: e.title,
    frontmatterStatus: e.frontmatterStatus,
    rootHash: e.rootHash ?? "",
    topics: e.topics ?? [],
    tree: e.tree,
    // Sections now carry their Merkle hashes (node/subtree/parent/depth) computed
    // by content-core alongside the heading anchor fields.
    sections: (e.sections ?? []).map((s) => ({
      anchorSlug: s.anchorSlug,
      fingerprint: s.fingerprint,
      headingText: s.headingText,
      level: s.headingLevel,
      ordinal: s.ordinal,
      text: s.plainText ?? "",
      charLen: s.charLen ?? 0,
      nodeHash: s.nodeHash ?? "",
      subtreeHash: s.subtreeHash ?? "",
      parentAnchorSlug: s.parentAnchorSlug ?? "",
      depthPath: s.depthPath ?? "",
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
  console.log(
    `registered ${e.area}/${e.slug} (v${res.version?.id}, ${(e.sections ?? []).length} sections, ${res.orphanedThreadCount} orphaned)`,
  );
}
console.log(`Done: ${ok}/${manifest.length} registered; ${orphanTotal} thread(s) orphaned.`);
