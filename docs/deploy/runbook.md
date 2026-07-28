# Go-live provisioning runbook

The code for the initial release is in place — the login gate, the view-mode
selector, and the CI/CD workflows. Everything below is the **manual provisioning**
a human performs once (creating accounts/projects, registering an OAuth app,
setting secrets). Until these steps are done, the deploy workflows are inert by
design: each is guarded by a repo variable (`PREVIEW_DEPLOY_ENABLED`,
`REVIEW_DEPLOY_ENABLED`, `REVIEW_REGISTER_ENABLED`) that starts unset.

Deployment shape for v1:

- **Frontend** — the Vite SPA in `site/`, deployed to **Vercel**. Same-origin
  `/api` and `/auth` rewrites proxy to the backend so the session cookie stays
  first-party (no CORS). The rewrite destinations are environment-specific and
  generated from `site/vercel.template.json` by `site/scripts/gen-vercel-config.mjs`.
- **Backend** — the Hono + Connect app in `server/`, deployed as a **Neon
  Function** (entrypoint `server/src/handler.ts`). It branches with the database:
  **one Neon branch per PR** for previews, plus the default branch for production.
- **Auth** — **Neon Auth** (GitHub OAuth). The server resolves the session cookie
  to a GitHub identity, then looks the login up in the `reviewer_allowlist` table.
  The allowlist is the effective access list — the site is private and only
  allowlisted users are admitted (see `site/src/components/AccessGate.tsx`).

---

## 1. Neon

1. **Create the Neon project.** Note the **project id** and the **default branch**
   (the production branch). Record the project id for `NEON_PROJECT_ID`.
2. **Apply the base schema to the production branch.** Grab the branch's *direct*
   (unpooled) connection string from the Neon console, then:
   ```bash
   DATABASE_URL='<prod-direct-url>' node server/scripts/migrate.mjs
   ```
   This applies `server/db/migrations/*.sql` (idempotent; tracked in
   `schema_migrations`).
3. **Enable Neon Auth with a GitHub OAuth app.**
   - Create a GitHub OAuth app (org settings → Developer settings → OAuth Apps).
     Set the callback/redirect URL per the Neon Auth docs for your project.
   - Enable Neon Auth on the project and connect the GitHub provider.
   - Confirm the live **session-cookie name** and the `neon_auth` table/column
     shapes match `server/src/auth/neon-auth.ts` (the resolver expects
     `neon_auth.session` / `"user"` / `account` with the columns queried there,
     and the cookie name defaults to `neon-auth.session-token`). If either
     differs, set `NEON_AUTH_COOKIE_NAME` and/or adjust the resolver.
4. **Seed the allowlist.** Insert the initial reviewers/maintainers into
   `reviewer_allowlist` (at least one `maintainer`). Example:
   ```sql
   insert into reviewer_allowlist (login, role) values ('your-gh-login', 'maintainer');
   ```
   This is what admits users past the AccessGate.
5. **Create a Neon API key** (for the CLI/actions) → GitHub secret `NEON_API_KEY`.

> **Branch-vs-integration ownership.** If you install the native Neon↔Vercel
> integration (step 2 below), decide *one* creator of the per-PR DB branch. Either
> let the integration create it and have `preview-deploy.yml` reuse it, or let the
> workflow's `create-branch-action` own it and disable the integration's branch
> creation. Don't let both create `preview/pr-<n>` or they'll collide.

---

## 2. Vercel

1. **Create the Vercel project**, connect the repo, set the **root directory** to
   `site/`. Record `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from `.vercel/project.json`
   after `vercel link`, or the project settings).
2. *(Optional)* Install the **Neon↔Vercel native integration** for auto DB branches
   per preview (injects `DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED`). See the
   ownership note above.
3. **Set Vercel Production env:**
   - `NEON_FUNCTION_HOST` — host of the prod Function (no scheme), feeds the
     generated `vercel.json`.
   - `NEON_AUTH_BASE` — host of the hosted Neon Auth endpoints.
   - `VITE_AUTH_SIGNIN_URL`, `VITE_AUTH_SIGNOUT_URL` — hosted Neon Auth flow URLs
     (baked into the bundle; gate the "Sign in" affordance).
   - Leave `VITE_API_URL` **unset** so the bundle uses same-origin `/api`.
4. **Set Vercel Preview env defaults** for the same keys. `preview-deploy.yml`
   overrides `NEON_FUNCTION_HOST` per branch at deploy time.
5. **Create a Vercel token** → GitHub secret `VERCEL_TOKEN` (used by the prebuilt
   deploy in `preview-deploy.yml`).

---

## 3. GitHub — secrets and variables

Settings → Secrets and variables → Actions.

**Secrets**

| Name | Used by | What |
|---|---|---|
| `NEON_API_KEY` | preview-deploy, deploy-function | Neon CLI / branch actions auth |
| `DATABASE_URL` | deploy-function | prod branch **direct** URL, for prod migrations |
| `REVIEW_BUILD_SECRET` | preview-deploy, deploy-function, register-versions | shared secret `RegisterVersion` checks; passed to the Function as `BUILD_SECRET` |
| `REVIEW_API_URL` | register-versions | the live prod Function URL |
| `VERCEL_TOKEN` | preview-deploy | non-interactive Vercel CLI auth |

**Variables**

| Name | Used by | What |
|---|---|---|
| `NEON_PROJECT_ID` | preview-deploy, deploy-function | Neon project id |
| `NEON_AUTH_BASE` | preview-deploy | Neon Auth host (also set in Vercel) |
| `NEON_AUTH_COOKIE_NAME` | preview-deploy, deploy-function | live session cookie name (Function `--env`) |
| `REVIEW_ALLOWED_ORIGIN` | preview-deploy, deploy-function | comma-separated CORS allowlist (Vercel origin; include the preview wildcard if needed) |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | preview-deploy | Vercel CLI targeting |
| `PREVIEW_DEPLOY_ENABLED` | preview-deploy | set `true` to arm per-PR previews |
| `REVIEW_DEPLOY_ENABLED` | deploy-function | set `true` to arm prod deploy on main |
| `REVIEW_REGISTER_ENABLED` | register-versions | set `true` to arm post-merge version registration |

---

## 4. Wire the Neon Functions CLI

The Neon Functions CLI is in beta, so the deploy steps in `preview-deploy.yml`
and `deploy-function.yml` are **scaffolds** (they echo the intended command). At
provisioning, replace the echo blocks with the real invocation and confirm:

- The exact `neon functions deploy` (or `neon deploy` / `neon config apply`)
  command and flags for a single Function sourced from `server/` at
  `server/src/handler.ts`, targeting a specific `--branch`/`--project`.
- Whether preview Function **hosts are deterministically derivable from the branch
  name**. If yes, `preview-deploy.yml` can compute `NEON_FUNCTION_HOST` up front;
  if no, capture the deployed host from the CLI output and write it to
  `$GITHUB_ENV` before the Vercel build step (the placeholder there shows where).
- That `neon.ts` at the repo root matches your project (auth on, the `review`
  Function slug/source/runtime). New branches apply it automatically; existing
  branches still need the per-push deploy step.

Then flip the three `*_ENABLED` variables to `true`.

---

## 5. Smoke test

**Preview (open a PR):**
1. The workflow creates `preview/pr-<n>`, migrates it, deploys the branch Function,
   and deploys a Vercel preview whose `/api` points at that Function.
2. On the preview URL: unauthenticated → sign-in wall; sign in with an
   **allowlisted** GitHub user → admitted; a **non-allowlisted** user → "access
   pending"; toggle **View as anonymous** in the account menu → only published
   content shows.
3. Close the PR → the Neon branch is deleted.

**Production (merge to main):**
1. `deploy-function.yml` migrates the prod branch and deploys the prod Function.
2. `register-versions.yml` stamps each content version with the merged main sha.
3. Repeat the gate + view-mode checks on the production domain.

---

## Reference — the moving parts in code

| Concern | File |
|---|---|
| Login gate (3 screens) | `site/src/components/AccessGate.tsx` |
| Sign-in/out seam | `site/src/lib/auth-actions.ts` |
| View-mode state | `site/src/lib/auth-context.tsx`, `site/src/lib/view-mode.ts` |
| Anonymous-preview filtering | `site/src/lib/content-visibility.ts` |
| View-mode selector UI | `site/src/components/layout/StatusMenu.tsx` |
| Prod auth provider | `server/src/auth/neon-auth.ts`, `server/src/allowlist.ts` |
| Migrations | `server/scripts/migrate.mjs`, `server/db/migrations/` |
| Vercel rewrite generator | `site/scripts/gen-vercel-config.mjs`, `site/vercel.template.json` |
| Branch policy | `neon.ts` |
| Workflows | `.github/workflows/preview-deploy.yml`, `deploy-function.yml`, `register-versions.yml` |
