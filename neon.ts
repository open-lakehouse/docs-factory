// Neon project policy (neon.ts). Declares the review backend as a branch-scoped
// Function and enables Neon Auth. When a NEW branch is created via `neon checkout`
// (or the Neon<>Vercel integration creating a preview DB branch), Neon applies
// this policy and deploys the declared Function onto that fresh branch — so a
// preview branch has a working /api even if the CI job didn't deploy it.
//
// IMPORTANT: this COMPLEMENTS, it does not replace, the explicit deploy step in
// .github/workflows/preview-deploy.yml. Checking out an EXISTING branch does not
// re-deploy the Function, so pushing new server/ code to an open PR still needs
// the workflow's `neon functions deploy` (or `neon deploy`) to update it. Treat
// neon.ts as the declarative baseline and the workflow as the per-push refresh.
//
// The Function entrypoint is server/src/handler.ts (`export default { fetch }`),
// the same Hono+Connect app the local dev server runs. DATABASE_URL is injected
// by Neon per branch; the other env is set here (and mirrored by the workflow).
//
// Provisioning wires the real project + secrets — see docs/deploy/runbook.md.
import { defineConfig } from "@neondatabase/config/v1";

export default defineConfig({
  // Neon Auth (GitHub OAuth) backs the prod auth provider + reviewer allowlist.
  auth: true,

  preview: {
    functions: {
      // Slug is the Function's permanent identity (appears in its URL + the CLI).
      review: {
        name: "Docs review API",
        source: "server/src/handler.ts",
        runtime: "nodejs24",
        env: {
          AUTH_MODE: "neon",
          NODE_ENV: "production",
          // ALLOWED_ORIGIN, BUILD_SECRET, NEON_AUTH_BASE are supplied at deploy
          // time (workflow / CLI) so secrets never live in this file.
        },
      },
    },
  },

  // Per-branch tuning. Feature branches expire so preview environments don't
  // accumulate; the default (production) branch is protected.
  branch: (branch) => {
    if (branch.isDefault) {
      return { protected: true };
    }
    return { parent: "main", ttl: "7d" };
  },
});
