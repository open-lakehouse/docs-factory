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
import { buildRedirectRoutes } from "./build-redirects.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, "..");
const outPath = resolve(siteRoot, ".vercel/output/config.json");

// Strip any accidental scheme/trailing slash so the `https://` prefix below is
// the single source of the scheme.
const stripHost = (v) => v.replace(/^https?:\/\//, "").replace(/\/+$/, "");

/**
 * Build the Build Output API v3 `routes` array (pure, for testing). Order matters:
 *   1. `/api/(.*)` proxies RPCs to the Function, stripping the `/api` prefix (the
 *      Hono app mounts Connect at root). MUST precede filesystem so POSTs aren't
 *      swallowed by the SPA fallback.
 *   2. 308 redirects for renamed pages (Phase 1g) — before filesystem so they beat
 *      the SPA catch-all.
 *   3. `.md` / `.py` header rules (Phase 1c / 3.4): noindex + Content-Type, with
 *      `continue: true` so the filesystem handler still serves the actual file.
 *   4. `Accept: text/markdown` negotiation (Phase 1b): rewrite a doc/blog HTML
 *      route to its `.md` twin. `Vary: Accept` on those routes so caches don't
 *      serve markdown to an HTML client.
 *   5. `handle: filesystem` serves the built static assets (incl. the .md twins,
 *      .py scripts, sitemap, llms.txt, …).
 *   6. A companion-file miss guard: any `.md`/`.py`/`scripts.json` request the
 *      filesystem DIDN'T resolve returns a real 404 — it must NOT reach the SPA
 *      catch-all below. Without this, a miss falls through to `/index.html`, and
 *      because the step-3 header rule already stamped `Content-Type: text/markdown`
 *      with `continue: true`, the edge caches that HTML app-shell body UNDER the
 *      `.md` cache key, labeled as markdown. The review workspace's twin fetch then
 *      gets a 200/304 whose body is `<!doctype html>…<div id="root">` and shows the
 *      "no twin" empty state even after the real twin ships (the poisoned entry is
 *      sticky and revalidates to 304). 404ing the miss keeps a companion URL either
 *      a real file or a real 404 — never a mislabeled SPA shell. Must precede the
 *      catch-all.
 *   7. Catch-all → index.html (client-side routing).
 */
export function buildRoutes({ fnHost, redirectRoutes = [] }) {
  return [
    { src: "/api/(.*)", dest: `https://${fnHost}/$1` },

    ...redirectRoutes, // { src, dest, status: 308 }

    // .md twins: noindex + text/markdown; continue → filesystem serves the file.
    {
      src: "/(.*)\\.md",
      headers: {
        "X-Robots-Tag": "noindex",
        "Content-Type": "text/markdown; charset=utf-8",
        Vary: "Accept",
      },
      continue: true,
    },
    // Raw runnable .py scripts: noindex + text/x-python (Phase 3).
    {
      src: "/(.*)\\.py",
      headers: {
        "X-Robots-Tag": "noindex",
        "Content-Type": "text/x-python; charset=utf-8",
      },
      continue: true,
    },
    // Transparent content negotiation: an agent sending `Accept: text/markdown`
    // for a BARE doc/blog HTML route gets the .md twin. (Least-proven Build Output
    // API feature; the explicit .md URLs advertised in rel=alternate + llms.txt are
    // the fallback if this proves flaky — drop just this rule then.)
    //
    // The `(?!.*\\.md$)` negative lookahead is load-bearing: this rule must NOT
    // match a path that ALREADY ends in `.md`. The review workspace's twin fetch
    // requests the `.md` URL directly AND sends `Accept: text/markdown`; without the
    // guard this rule rewrites `/blog/slug.md` → `/blog/slug.md.md`, which doesn't
    // exist → the miss guard below 404s it (pre-#102 it fell through to the SPA
    // shell, i.e. the original "No markdown twin" symptom). Only bare routes like
    // `/blog/slug` should be negotiated up to their twin.
    {
      src: "/((?!.*\\.md$)(?:docs/.*|blog/.*))",
      has: [{ type: "header", key: "accept", value: "(.*text/markdown.*)" }],
      dest: "/$1.md",
    },
    { src: "/(docs/.*|blog/.*)", headers: { Vary: "Accept" }, continue: true },

    { handle: "filesystem" },
    // Companion-file miss guard (see header §6). A `.md`/`.py`/`scripts.json` that
    // the filesystem didn't serve is a genuine 404 — never the SPA shell. This
    // stops the app-shell HTML from being cached under a companion URL's key (and
    // mislabeled text/markdown by the step-3 header rule with continue:true), which
    // otherwise makes the review workspace's twin fetch see a 200/304 HTML body and
    // render the "no twin" empty state permanently.
    { src: "/(.*)\\.(md|py)", status: 404 },
    { src: "/scripts\\.json", status: 404 },
    { src: "/.*", dest: "/index.html" },
  ];
}

function main() {
  const functionHost = process.env.NEON_FUNCTION_HOST;
  if (!functionHost || functionHost.trim() === "") {
    console.error(
      "gen-vercel-config: missing required env: NEON_FUNCTION_HOST.\n" +
        "Set it (per Vercel environment) before building — see docs/deploy/runbook.md.",
    );
    process.exit(1);
  }
  const fnHost = stripHost(functionHost);
  const config = {
    version: 3,
    routes: buildRoutes({ fnHost, redirectRoutes: buildRedirectRoutes() }),
  };

  // Serialize + self-validate (JSON.stringify can't produce invalid JSON, but keep
  // the round-trip so a future non-serializable value fails here, not in Vercel).
  const rendered = JSON.stringify(config, null, 2);
  JSON.parse(rendered);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rendered);
  console.log(`gen-vercel-config: wrote .vercel/output/config.json (api→${fnHost}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
