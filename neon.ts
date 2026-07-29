// Neon project policy (neon.ts). Declares the review backend as a branch-scoped
// Function and enables Neon Auth.
//
// IMPORTANT: this config is applied only by an EXPLICIT `neon deploy` / `neon
// config apply` — it is NOT auto-applied on branch creation, on `neon checkout`,
// or when the Neon<>Vercel integration creates a preview DB branch, and code
// changes never redeploy on their own. So the Function is deployed by the
// explicit step in .github/workflows/preview-deploy.yml (per PR) and
// deploy-function.yml (prod) on every push; neon.ts is the declaration those
// deploys realize, not a standalone auto-deploy path. (The integration only
// creates the DB branch + injects env — it does not deploy Functions.)
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
      // The deploy workflows pass this same slug via `vars.REVIEW_FUNCTION_SLUG`
      // (default 'review') — keep the key below in sync with that variable.
      review: {
        name: "Docs review API",
        source: "server/src/handler.ts",
        runtime: "nodejs24",
        env: {
          AUTH_MODE: "neon",
          NODE_ENV: "production",
          // ALLOWED_ORIGIN, BUILD_SECRET, and NEON_AUTH_URL are supplied at
          // deploy time (workflow / CLI). NEON_AUTH_URL is the Neon Auth base
          // (same value as the client's VITE_NEON_AUTH_URL) — the JWT
          // issuer/audience + JWKS base the Function verifies bearers against.
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
