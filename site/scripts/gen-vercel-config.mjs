// Generate site/vercel.json from the template with the environment-specific
// `/api` proxy target baked in.
//
// Why a generator instead of a static vercel.json: the `/api` rewrite
// DESTINATION differs per environment (prod Function vs a per-PR preview
// Function whose host is only known after that branch's Function is deployed),
// and Vercel does NOT interpolate env vars into a rewrite `destination` — the
// value is resolved at deploy time and baked into the deployment's routing. It
// also reads vercel.json BEFORE the build, so generating it during the build is
// too late. The supported pattern is therefore: CI writes the concrete
// vercel.json from this template, THEN runs `vercel build` + `vercel deploy
// --prebuilt`. See docs/deploy/runbook.md.
//
// Keeping /api same-origin (rather than pointing the bundle at an absolute
// Function URL) is deliberate: no cross-origin request, no CORS surface. The
// static JS bundle stays URL-free (review-client resolves to "/api"); only this
// routing layer knows the real host.
//
// NOTE: there is no longer an `/auth` rewrite. Sign-in goes directly to the Neon
// Auth origin via the SDK (VITE_NEON_AUTH_URL, injected by the Neon↔Vercel
// integration), and the API is authenticated with a bearer token — not a
// same-origin cookie — so the site never needs to proxy the auth endpoints.
//
// Env in:
//   NEON_FUNCTION_HOST  host (no scheme) of the review Function for this env,
//                       e.g. review-abc123.functions.neon.tech
// Required; the script fails loudly rather than emit a placeholder.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const templatePath = resolve(siteRoot, "vercel.template.json");
const outPath = resolve(siteRoot, "vercel.json");

const functionHost = process.env.NEON_FUNCTION_HOST;

if (!functionHost || functionHost.trim() === "") {
  console.error(
    "gen-vercel-config: missing required env: NEON_FUNCTION_HOST.\n" +
      "Set it (per Vercel environment) before generating vercel.json — see docs/deploy/runbook.md.",
  );
  process.exit(1);
}

// Strip any accidental scheme/trailing slash so the template's https:// prefix
// is the single source of the scheme.
const host = (v) => v.replace(/^https?:\/\//, "").replace(/\/+$/, "");

const template = readFileSync(templatePath, "utf8");
const rendered = template.replaceAll("__NEON_FUNCTION_HOST__", host(functionHost));

// Validate it parses so a bad substitution fails here, not in Vercel.
JSON.parse(rendered);

writeFileSync(outPath, rendered);
console.log(`gen-vercel-config: wrote vercel.json (api→${host(functionHost)}).`);
