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
3. **Disable Vercel's git auto-preview builds — production only.** The
   repo↔Vercel git integration would otherwise build a *second* preview on every
   branch push, racing `preview-deploy.yml` and building with the wrong `/api`
   rewrites (it can't know a branch's per-PR Function host). We deploy previews
   ourselves via `vercel deploy --prebuilt`, so let Vercel's git integration build
   **only** the production branch. There is no committed `vercel.json` (it's
   generated per deploy and gitignored), so this is a **dashboard** setting, not a
   repo change: Project → **Settings → Git → Ignored Build Step** →
   ```bash
   # Vercel convention: exit 1 = build, exit 0 = skip.
   if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
   ```
   The Ignored Build Step runs only for git-triggered builds, so it silences auto
   previews without affecting the workflow's `--prebuilt` deploys (those skip the
   build phase entirely).
4. **Set Vercel Production env:**
   - `NEON_FUNCTION_HOST` — host of the prod Function (no scheme), feeds the
     generated `vercel.json`.
   - `NEON_AUTH_BASE` — host of the hosted Neon Auth endpoints.
   - `VITE_AUTH_SIGNIN_URL`, `VITE_AUTH_SIGNOUT_URL` — hosted Neon Auth flow URLs
     (baked into the bundle; gate the "Sign in" affordance).
   - Leave `VITE_API_URL` **unset** so the bundle uses same-origin `/api`.
5. **Set Vercel Preview env defaults** for the same keys. `preview-deploy.yml`
   overrides `NEON_FUNCTION_HOST` per branch at deploy time.
6. **Create a Vercel token** → GitHub secret `VERCEL_TOKEN` (used by the prebuilt
   deploy in `preview-deploy.yml`).

---

## 3. GitHub — environments, secrets, and variables

Settings → Environments, and Settings → Secrets and variables → Actions.

The workflows are scoped to two **GitHub Environments** so preview and production
never share credentials or CORS origins, and prod secrets are only exposed to
`main`:

- `preview-deploy.yml` (both `preview` and `cleanup` jobs) → **`preview`** env.
- `deploy-function.yml` and `register-versions.yml` → **`production`** env.

### 3a. Create the environments

Settings → **Environments** → New environment:

- **`preview`** — **no** branch restriction (the `cleanup` job runs on PR *close*,
  off `main`; a `main`-only restriction would block it from reading `NEON_API_KEY`).
  No required reviewers (previews are automatic).
- **`production`** — **Deployment branches: restricted → `main` only.** This is a
  hard gate: GitHub refuses to expose this environment's secrets to any other ref,
  stronger than the workflows' `if: github.ref == 'refs/heads/main'` check (which
  gates the job, not secret scope). Optionally add **Required reviewers** for a
  manual approval before each prod deploy.

### 3b. Environment-scoped secrets & variables

Set these **inside** the named environment, not at repo level, so preview and prod
values differ:

| Name | Kind | `preview` | `production` |
|---|---|---|---|
| `NEON_API_KEY` | secret | preview-scoped key (least privilege) | prod key |
| `REVIEW_BUILD_SECRET` | secret | shared value (both envs) | shared value |
| `DATABASE_URL` | secret | — | prod branch **direct** URL (prod migrations) |
| `REVIEW_API_URL` | secret | — | live prod Function URL |
| `VERCEL_TOKEN` | secret | non-interactive Vercel CLI auth | — |
| `NEON_PROJECT_ID` | var | Neon project id | Neon project id |
| `NEON_AUTH_BASE` | var | preview Neon Auth host | prod Neon Auth host |
| `NEON_AUTH_COOKIE_NAME` | var | live session cookie name | live session cookie name |
| `REVIEW_ALLOWED_ORIGIN` | var | preview origin (+ wildcard) | prod domain only |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | var | Vercel CLI targeting | — |

### 3c. Repo-level variables (must stay repo-level)

The `*_ENABLED` gates are read in each job's `if:` condition, which is evaluated
**before** the environment is entered — a job `if:` cannot read environment vars.
Keep these three at repo level (Settings → Secrets and variables → Actions →
Variables):

| Name | Used by | What |
|---|---|---|
| `PREVIEW_DEPLOY_ENABLED` | preview-deploy | set `true` to arm per-PR previews |
| `REVIEW_DEPLOY_ENABLED` | deploy-function | set `true` to arm prod deploy on main |
| `REVIEW_REGISTER_ENABLED` | register-versions | set `true` to arm post-merge version registration |

> If a name exists both at repo level and in an environment, the environment value
> wins for jobs that declare that `environment:` — so a repo-level fallback is
> harmless, but prefer putting the differing values only in the environments.

---

## 4. Wire the Neon Functions CLI

The Neon Functions CLI is in **beta** (currently **us-east-2 only**). Both
workflows now run the real `neonctl functions deploy … --output json` and parse
the returned `invocation_url` — but because the CLI is beta, confirm these at
provisioning and adjust if they differ:

- **The Function host is NOT derivable from the git branch name.** Neon forms it
  as `<branch_id>-<slug>.compute.<region>.aws.neon.tech`, where `branch_id` is
  Neon's internal `br-…` id — unknowable before the deploy. So both workflows
  **deploy first and capture** the host from the CLI's `invocation_url`. Do not
  reintroduce a name-derived host; it will never resolve.
- **The CLI package/binary + JSON key.** The workflows install `neonctl` and read
  `invocation_url` (with `.invocationUrl // .url` fallbacks). Verify the beta
  package name, that `neonctl functions deploy` exists with `--src`/`--branch`/
  `--project`/`--output json`, and the exact URL field — inspect the raw JSON on
  the first run and fix the `jq` path if needed. Pin a CLI version once confirmed.
- **`NEON_API_KEY`** authenticates the CLI (already exported as job env in both
  workflows).
- That `neon.ts` at the repo root matches your project (auth on, the `review`
  Function slug/source/runtime). New branches apply it automatically; existing
  branches still need the per-push deploy step.

**First prod deploy is two-pass** (the prod host is stable, so this is one-time):
run `deploy-function.yml` once — it logs a `::notice::` with the deployed host —
then set that host as Vercel **Production** env `NEON_FUNCTION_HOST` (§2.4).
Previews need no such step: `preview-deploy.yml` writes the captured host to
`$GITHUB_ENV` and the Vercel build reads it inline.

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
