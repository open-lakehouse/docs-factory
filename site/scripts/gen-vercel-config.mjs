// Emit the Build Output API routing config (.vercel/output/config.json) with the
// environment-specific `/api` proxy target baked in.
//
// Why the Build Output API instead of a top-level vercel.json:
//   - The `/api` rewrite DESTINATION differs per environment (the prod Function
//     vs. a per-PR preview Function whose host is only known after that branch's
//     Function is deployed), so it can't be a committed static value.
//   - Vercel reads a project-level `vercel.json` BEFORE the build runs, so a
//     `vercel.json` generated during the build is ignored for that same
//     deployment. The Build Output API is the supported way to emit
//     build-time-generated routing: Vercel consumes `.vercel/output/config.json`
//     AFTER the build. This lets a single builder (Vercel's git integration on
//     `main`, or `vercel deploy --prebuilt` for previews) both build and route
//     in one pass — no second builder racing the production alias, no host
//     committed to the repo. See docs/deploy/runbook.md.
//
// Keeping /api same-origin (rather than pointing the bundle at an absolute
// Function URL) is deliberate: no cross-origin request, no CORS surface. The
// static JS bundle stays URL-free (review-client resolves to "/api"); only this
// routing layer knows the real host.
//
// There is no `/auth` route: sign-in goes directly to the Neon Auth origin via
// the SDK (VITE_NEON_AUTH_URL, injected by the Neon↔Vercel integration), and the
// API is authenticated with a bearer token — not a same-origin cookie — so the
// site never needs to proxy the auth endpoints.
//
// Env in:
//   NEON_FUNCTION_HOST  host (no scheme) of the review Function for this env,
//                       e.g. review-abc123.functions.neon.tech
// Required; the script fails loudly rather than emit a placeholder.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const outPath = resolve(siteRoot, ".vercel/output/config.json");

const functionHost = process.env.NEON_FUNCTION_HOST;

if (!functionHost || functionHost.trim() === "") {
  console.error(
    "gen-vercel-config: missing required env: NEON_FUNCTION_HOST.\n" +
      "Set it (per Vercel environment) before building — see docs/deploy/runbook.md.",
  );
  process.exit(1);
}

// Strip any accidental scheme/trailing slash so the `https://` prefix below is
// the single source of the scheme.
const host = (v) => v.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const fnHost = host(functionHost);

// Build Output API v3 routing. Order matters:
//   1. `/api/(.*)` proxies RPCs to the Function, stripping the `/api` prefix
//      (the Hono app mounts Connect at root: /<package>.<Service>/<Method>).
//      This MUST precede the filesystem handler so POSTs aren't swallowed by the
//      SPA fallback below.
//   2. `handle: filesystem` serves the built static assets (…/static/*).
//   3. Catch-all rewrites everything else to index.html (client-side routing).
const config = {
  version: 3,
  routes: [
    { src: "/api/(.*)", dest: `https://${fnHost}/$1` },
    { handle: "filesystem" },
    { src: "/.*", dest: "/index.html" },
  ],
};

// Serialize + self-validate (JSON.stringify can't produce invalid JSON, but keep
// the round-trip so a future non-serializable value fails here, not in Vercel).
const rendered = JSON.stringify(config, null, 2);
JSON.parse(rendered);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, rendered);
console.log(`gen-vercel-config: wrote .vercel/output/config.json (api→${fnHost}).`);
