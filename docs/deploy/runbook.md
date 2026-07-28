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

## Phase 0 — Read this first (the mental model)

The steps below are ordered so you can run them **top to bottom**: nothing is
consumed before the step that produces it. Two facts explain the whole ordering
and the apparent config duplication — internalize them and the rest follows.

**Two builders, by design.** Preview and production SPAs are built by *different*
systems, so each system holds the config for the build it performs:

| | Builds the SPA | Reads build config from |
|---|---|---|
| **Preview** | GitHub Actions (`vercel build` in `preview-deploy.yml`) | GitHub env + `vercel pull --environment=preview` |
| **Production** | Vercel's own git integration (on push to `main`) | Vercel **Production** env |

So a value used at build time legitimately lives in **both** GitHub and Vercel —
it's not accidental duplication, it's "each builder needs its own copy." Concretely:

- **`NEON_AUTH_BASE`** — set in **both**. CI's `gen-vercel-config.mjs` needs it to
  write the preview `vercel.json` `/auth` rewrite; Vercel's prod build needs it for
  the prod `vercel.json`.
- **`VITE_NEON_AUTH_BASE_URL`** — set in **Vercel only** (Preview + Production).
  It's a Vite bundle var: the Better Auth client's `baseURL` (see below). The prod
  build reads it from Vercel Production env; the preview build gets it via `vercel
  pull --environment=preview` (which downloads Vercel *Preview* env into CI), so it
  does **not** need a GitHub copy.
- **`NEON_FUNCTION_HOST`** — *not* duplicated: it's a per-branch captured value in
  CI (`$GITHUB_ENV`) and a single stable value in Vercel Production env.

> **Sign-in is the Better Auth client, not a URL.** Neon Auth is Better Auth,
> which has **no plain GET sign-in/out URL** — the earlier `VITE_AUTH_SIGNIN_URL` /
> `VITE_AUTH_SIGNOUT_URL` were never real values to source. `site/src/lib/auth-actions.ts`
> now creates a Better Auth client (`createAuthClient({ baseURL })`) and calls
> `signIn.social({ provider: "github" })` / `signOut()`. The single input is
> `VITE_NEON_AUTH_BASE_URL` = the Neon Auth **instance** URL
> (`https://ep-….neonauth.<region>.aws.neon.tech`) — the real host, not the site's
> `/auth` proxy, because Better Auth builds the OAuth callback from its own baseURL
> and sets the state cookie on that origin.

**Produce → consume crosses systems.** Some values only *exist* after an earlier
step runs, so the phases below capture them at their source and set them where
they're consumed. The forward references are called out inline (e.g. "⏳ deferred
to Phase 5"). The `*_ENABLED` gates are flipped **last** (Phase 6) — arm the
workflows only once every secret they read exists.

---

## Phase 1 — Create resources (no deploys yet)

Just create accounts/projects and record identifiers. Nothing is deployed here.

1. **Neon project.** Create it; note the **project id** (→ `NEON_PROJECT_ID`) and
   the **default branch** (the production branch).
2. **GitHub OAuth app + Neon Auth.** Enable Neon Auth on the project and connect
   the GitHub provider (create a GitHub OAuth app: org → Developer settings → OAuth
   Apps). **Record** the Neon Auth **instance URL** now — you consume it in Phase 3:
   - `NEON_AUTH_BASE` — the instance host (`ep-….neonauth.<region>.aws.neon.tech`),
     no scheme. Used as both the `/auth` rewrite target *and* (with scheme) the
     Better Auth client `baseURL` → `VITE_NEON_AUTH_BASE_URL`.
   - **GitHub OAuth callback URL** to register in the GitHub app:
     `https://<NEON_AUTH_BASE>/api/auth/callback/github` — Better Auth builds the
     callback from its own base, so this is the Neon host, not the site domain.
   - **Trusted origins.** Add every site origin that starts a login (prod domain +
     the Vercel preview origin/wildcard) to Neon Auth's `trusted_origins`
     (`project_config.trusted_origins`), or Better Auth rejects the post-login
     redirect back to the site.
   Also confirm the live **session-cookie name** and that the `neon_auth`
   table/column shapes match `server/src/auth/neon-auth.ts` (resolver expects
   `neon_auth.session` / `"user"` / `account` with the queried columns; cookie
   defaults to `neon-auth.session-token`). If either differs, note the cookie name
   for `NEON_AUTH_COOKIE_NAME` and/or adjust the resolver.
3. **Neon API key** → you'll store it as the `NEON_API_KEY` secret in Phase 3.
4. **Vercel project.** Create it, connect the repo, set **root directory** to
   `site/`. Record `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from
   `.vercel/project.json` after `vercel link`, or project settings). Create a
   **Vercel token** → the `VERCEL_TOKEN` secret in Phase 3.
5. *(Optional)* Install the **Neon↔Vercel native integration** for auto DB branches
   per preview (injects `DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED`).
   > **Branch-vs-integration ownership.** Decide *one* creator of the per-PR DB
   > branch: either the integration creates it and `preview-deploy.yml` reuses it,
   > or the workflow's `create-branch-action` owns it and you disable the
   > integration's branch creation. Don't let both create `preview/pr-<n>`.

**After Phase 1 you have:** `NEON_PROJECT_ID`, the Neon API key, `NEON_AUTH_BASE`
(also used as `VITE_NEON_AUTH_BASE_URL`), the cookie name, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`, and the Vercel token; the GitHub callback + trusted origins
are registered on the Neon Auth side. **Not yet:** any Function host or the prod
Function URL — those don't exist until Phase 4.

---

## Phase 2 — Schema + allowlist (production branch)

1. **Apply the base schema to the production branch.** Grab the branch's *direct*
   (unpooled) connection string from the Neon console — this is the same value you
   store as the `DATABASE_URL` **`production`** secret in Phase 3:
   ```bash
   DATABASE_URL='<prod-direct-url>' node server/scripts/migrate.mjs
   ```
   Applies `server/db/migrations/*.sql` (idempotent; tracked in `schema_migrations`).
2. **Seed the allowlist** — at least one `maintainer`; this is what admits users
   past the AccessGate:
   ```sql
   insert into reviewer_allowlist (github_login, role) values ('your-gh-login', 'maintainer');
   ```

---

## Phase 3 — Configure GitHub + Vercel (values you have now)

Set everything you already hold from Phases 1–2. **Two values are deferred to
Phase 5** because they don't exist yet: the prod `NEON_FUNCTION_HOST` and
`REVIEW_API_URL` (both produced by the first prod deploy in Phase 4).

### 3a. Disable Vercel's git auto-preview builds — production only

The repo↔Vercel git integration would otherwise build a *second* preview on every
branch push, racing `preview-deploy.yml` and building with the wrong `/api`
rewrites (it can't know a branch's per-PR Function host). We deploy previews
ourselves via `vercel deploy --prebuilt`, so let Vercel's git integration build
**only** the production branch. There is no committed `vercel.json` (generated per
deploy and gitignored), so this is a **dashboard** setting: Project →
**Settings → Git → Ignored Build Step** →
```bash
# Vercel convention: exit 1 = build, exit 0 = skip.
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi
```
The Ignored Build Step runs only for git-triggered builds, so it silences auto
previews without affecting the workflow's `--prebuilt` deploys (those skip the
build phase entirely).

### 3b. Vercel env

Set on the Vercel project (per environment):

- **Production env:**
  - `NEON_AUTH_BASE` — from Phase 1.2 (feeds the prod `vercel.json` `/auth` rewrite).
  - `VITE_NEON_AUTH_BASE_URL` — from Phase 1.2, **with** scheme
    (`https://ep-….neonauth.<region>.aws.neon.tech`). Baked into the bundle as the
    Better Auth client `baseURL`; gates the "Sign in" affordance (hidden when unset).
  - Leave `VITE_API_URL` **unset** so the bundle uses same-origin `/api`.
  - ⏳ `NEON_FUNCTION_HOST` — **deferred to Phase 5** (doesn't exist until Phase 4).
- **Preview env:** the same `VITE_NEON_AUTH_BASE_URL` (so `vercel pull` supplies it
  to CI builds). `NEON_AUTH_BASE` and `NEON_FUNCTION_HOST` are passed per-branch by
  `preview-deploy.yml`, so a Preview-env value for those is optional.

### 3c. GitHub environments

Settings → **Environments** → New environment:

- **`preview`** — **no** branch restriction (the `cleanup` job runs on PR *close*,
  off `main`; a `main`-only restriction would block it from reading `NEON_API_KEY`).
  No required reviewers (previews are automatic).
- **`production`** — **Deployment branches: restricted → `main` only.** A hard
  gate: GitHub refuses to expose this environment's secrets to any other ref,
  stronger than the workflows' `if: github.ref == 'refs/heads/main'` check (which
  gates the job, not secret scope). Optionally add **Required reviewers** for
  manual approval before each prod deploy.

### 3d. GitHub secrets & variables

The **Set at** column is authoritative. Names marked `preview` + `production` are
set **once in each** environment; `repo` names go at Settings → Secrets and
variables → Actions.

| Name | Kind | Set at | Value / notes |
|---|---|---|---|
| `NEON_API_KEY` | secret | `preview` + `production` | preview: least-privilege key; production: prod key |
| `REVIEW_BUILD_SECRET` | secret | `preview` + `production` | same shared value in both envs |
| `DATABASE_URL` | secret | `production` | prod branch **direct** URL (same value used in Phase 2.1) |
| `REVIEW_API_URL` | secret | `production` | ⏳ **deferred to Phase 5** — live prod Function URL |
| `VERCEL_TOKEN` | secret | `preview` | non-interactive Vercel CLI auth |
| `NEON_PROJECT_ID` | var | `preview` + `production` | Neon project id (same value both) |
| `NEON_AUTH_BASE` | var | `preview` + `production` | Neon Auth host — also in Vercel (§3b), see Phase 0 |
| `NEON_AUTH_COOKIE_NAME` | var | `preview` + `production` | live session cookie name (same value both) |
| `REVIEW_ALLOWED_ORIGIN` | var | `preview` + `production` | preview origin (+ wildcard) vs prod domain only |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | var | `preview` | Vercel CLI targeting |
| `PREVIEW_DEPLOY_ENABLED` | var | **`repo`** | ⏳ **Phase 6** — leave unset for now |
| `REVIEW_DEPLOY_ENABLED` | var | **`repo`** | ⏳ **Phase 6** — leave unset for now |
| `REVIEW_REGISTER_ENABLED` | var | **`repo`** | ⏳ **Phase 6** — leave unset for now |

> **Why the `*_ENABLED` gates are `repo`, not environment.** They're read in each
> job's `if:`, which GitHub evaluates **before** the environment is entered — a job
> `if:` cannot see environment vars, so an environment-scoped gate would always
> read empty and the job would never arm.
>
> If a name exists both at repo level and in an environment, the environment value
> wins for jobs that declare that `environment:` — a repo-level fallback is
> harmless, but prefer putting the differing values only in the environments.

---

## Phase 4 — First production deploy (produces the deferred values)

The Neon Functions CLI is in **beta** (currently **us-east-2 only**). The workflows
run `neonctl functions deploy … --output json` and parse `invocation_url`. Before
arming anything, run the prod deploy **once, manually** to produce the two values
Phase 3 deferred:

1. Trigger `deploy-function.yml` via **workflow_dispatch** (it runs even with
   `REVIEW_DEPLOY_ENABLED` unset when dispatched manually). It migrates the prod
   branch and deploys the prod Function, then logs a `::notice::` with the deployed
   host.
2. **Capture** from that run:
   - the **host** → this is the prod `NEON_FUNCTION_HOST` (stable across deploys).
   - the full **URL** → this is `REVIEW_API_URL`.

Confirm at this first run (beta CLI — adjust if they differ):

- **The Function host is NOT derivable from the git branch name.** Neon forms it as
  `<branch_id>-<slug>.compute.<region>.aws.neon.tech`, where `branch_id` is Neon's
  internal `br-…` id — unknowable before the deploy. Both workflows **deploy first
  and capture** the host; do not reintroduce a name-derived host.
- **CLI package/binary + JSON key.** The workflows install `neonctl` and read
  `invocation_url` (with `.invocationUrl // .url` fallbacks). Verify the beta
  package name, that `neonctl functions deploy` exists with
  `--src`/`--branch`/`--project`/`--output json`, and the exact URL field — inspect
  the raw JSON and fix the `jq` path if needed. Pin a CLI version once confirmed.
- That `neon.ts` at the repo root matches your project (auth on; `review` Function
  slug/source/runtime). New branches apply it automatically; existing branches
  still need the per-push deploy step.

> Previews never need this capture step: `preview-deploy.yml` deploys the branch
> Function and writes its host to `$GITHUB_ENV` inline before the Vercel build.

---

## Phase 5 — Set the deferred values

Now that Phase 4 produced them:

1. **Vercel Production env** → `NEON_FUNCTION_HOST` = the host from Phase 4.2.
2. **GitHub `production` secret** → `REVIEW_API_URL` = the URL from Phase 4.2.

---

## Phase 6 — Arm the workflows, then smoke test

Flip the three `*_ENABLED` **repo** variables to `true` (previews, prod deploy,
version registration). Only now — every secret they read exists.

**Preview (open a PR):**
1. The workflow creates `preview/pr-<n>`, migrates it, deploys the branch Function,
   and deploys a Vercel preview whose `/api` points at that Function.
2. On the preview URL: unauthenticated → sign-in wall; allowlisted GitHub user →
   admitted; non-allowlisted → "access pending"; toggle **View as anonymous** →
   only published content shows.
3. Close the PR → the Neon branch is deleted.

**Production (merge to main):**
1. `deploy-function.yml` migrates the prod branch and redeploys the prod Function.
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
