# Go-live provisioning runbook

The code for the initial release is in place — the login gate, the view-mode
selector, and the CI/CD workflows. Everything below is the **manual provisioning**
a human performs once (creating accounts/projects, registering an OAuth app,
setting secrets). The deploy workflows run on their triggers (previews on every
PR, prod on push to `main`); the gate on prod is the `production` GitHub
environment's main-only branch restriction, not a feature flag. Until the
secrets/vars below exist a run fails loudly rather than deploying against nothing.

Deployment shape for v1:

- **Frontend** — the Vite SPA in `site/`, deployed to **Vercel**. A same-origin
  `/api` rewrite proxies to the backend so API calls stay same-origin (no CORS).
  The destination is environment-specific and emitted into the Build Output API
  routing config (`.vercel/output/config.json`) by
  `site/scripts/gen-vercel-config.mjs` during `bun run build:vercel`.
  > **Auth is a bearer JWT, not a cookie.** Neon Auth scopes its session cookie to
  > the **auth origin** (`VITE_NEON_AUTH_URL`'s host), a *different* origin from the
  > Function the `/api` rewrite points at — so the cookie never reaches the API. The
  > SPA sends Neon Auth's session JWT (`getSession`'s `set-auth-jwt`) as
  > `Authorization: Bearer` on every RPC (`site/src/lib/review-client.ts`), and the
  > Function **verifies that JWT against Neon Auth's JWKS** (`NEON_AUTH_URL`,
  > issuer/audience/EdDSA), trusting its `sub` + `email` claims — no session-token DB
  > match, rotation-proof. There is therefore **no `/auth` rewrite** and no need for
  > the API to see the cookie.
- **Backend** — the Hono + Connect app in `server/`, deployed as a **Neon
  Function** (entrypoint `server/src/handler.ts`). It branches with the database:
  **one Neon branch per PR** for previews, plus the default branch for production.
- **Auth** — **Neon Auth** (GitHub OAuth). The server verifies the request's JWT
  to a trusted user id, then reads the persisted `user_identity` row for it (the
  GitHub login is resolved from `neon_auth.account` + a one-time GitHub `/user`
  call at first login and stored there), and looks the **user id** up in the
  `reviewer_allowlist` table. Everything keys on the stable user id, not the
  mutable login. The allowlist is the effective access list — the site is private
  and only allowlisted users are admitted (see `site/src/components/AccessGate.tsx`).
  A **site admin** (Neon Auth's admin role, set in the Neon Console — see Phase 2)
  is admitted with maintainer access even without an allowlist row, and is the
  only role that can open the admin panel and manage the allowlist.

---

## Phase 0 — Read this first (the mental model)

The steps below are ordered so you can run them **top to bottom**: nothing is
consumed before the step that produces it. Two facts explain the whole ordering
and the apparent config duplication — internalize them and the rest follows.

**One builder — GitHub Actions — for both environments.** Preview and production
SPAs are both built in **GitHub Actions** by the same `bun run build:vercel`
(`site/package.json`), which emits the **Build Output API** tree
(`site/.vercel/output/`): the static SPA under `static/` and the `/api` → Function
rewrite in `config.json` (written by `site/scripts/gen-vercel-config.mjs` from
`NEON_FUNCTION_HOST`). Vercel reads `config.json` **after** the build, so the
per-deploy Function host is applied to that same deployment — a plain top-level
`vercel.json` can't do this because Vercel reads it *before* the build. The build
runs in CI (not on Vercel) because `build:vercel` now runs the agentic-docs
artifact pass, which needs **uv** (for `docsnip scripts --json`) and **headless
Chromium** (for the LikeC4 PNG export) — neither is present in Vercel's build
image. Each workflow supplies `NEON_FUNCTION_HOST` for the build it performs and
ships the result with `vercel deploy --prebuilt`; **Vercel builds nothing** (its
git build is turned off via the Ignored Build Step, §3a):

| | Builds the SPA | Supplies `NEON_FUNCTION_HOST` from |
|---|---|---|
| **Preview** | GitHub Actions (`build:vercel` → `vercel deploy --prebuilt` in `preview-deploy.yml`) | `$GITHUB_ENV` (captured per-branch after the Function deploy) |
| **Production** | GitHub Actions (`build:vercel` → `vercel deploy --prebuilt --prod` in `deploy-function.yml`, `deploy-site` job) | the `deploy` job output (the stable prod Function host) |

`NEON_FUNCTION_HOST` therefore lives only in CI — it's captured at deploy time and
passed straight into the build, in both environments. Other build-time values may
still legitimately live in **both** GitHub and Vercel — "each consumer needs its
own copy." Concretely:

- **`VITE_NEON_AUTH_URL`** — set in **Vercel only** (Preview + Production), and
  **injected automatically by the Neon↔Vercel integration** (see Phase 1.5) rather
  than by hand. It's a Vite bundle var: the Neon Auth URL the SDK client points at
  (see below). Both builds pull it from the Vercel env into CI via `vercel pull`
  (`--environment=production` for prod, `--environment=preview` for previews), so it
  does **not** need a GitHub copy in either environment.
- **`NEON_FUNCTION_HOST`** — lives **only in CI**, never in Vercel: a per-branch
  captured value in the preview workflow (`$GITHUB_ENV`) and the `deploy` job output
  (the stable prod host) in the production workflow. It is passed straight into
  `build:vercel`; the Vercel env no longer carries it.

> **No more `NEON_AUTH_BASE`.** There used to be an `/auth` same-origin rewrite that
> needed the Neon Auth host wired into both GitHub and Vercel. The SPA now talks to
> the auth origin directly (via `VITE_NEON_AUTH_URL`) and authenticates the API with
> a bearer token, so that rewrite — and every copy of `NEON_AUTH_BASE` — is gone.

> **Sign-in uses the Neon SDK, not a hosted URL.** `site/src/lib/auth-actions.ts`
> uses Neon's official SDK (`@neondatabase/neon-js`): `createAuthClient(url)` →
> `signIn.social({ provider: "github" })` / `signOut()`, and `getSession()` to read
> the session token the API bearer is built from. The single input is
> `VITE_NEON_AUTH_URL` = the project's **Neon Auth URL exactly as shown in the Neon
> console**, including its path — e.g.
> `https://ep-….neonauth.<region>.aws.neon.tech/<db>/auth`. With the Neon↔Vercel
> integration installed (Phase 1.5) this is injected into Vercel automatically; you
> no longer copy it by hand. (This is a beta SDK — `@neondatabase/neon-js@0.6.2-beta`;
> pin/verify at provisioning.)

**Produce → consume crosses systems.** Some values only *exist* after an earlier
step runs, so the phases below capture them at their source and set them where
they're consumed. The forward references are called out inline (e.g. "⏳ deferred
to Phase 5"). Set the secrets/vars before the first push to `main` so the prod
deploy has what it reads.

---

## Phase 1 — Create resources (no deploys yet)

Just create accounts/projects and record identifiers. Nothing is deployed here.

1. **Neon project.** Create it; note the **project id** (→ `NEON_PROJECT_ID`) and
   the **default branch** (the production branch).
2. **GitHub OAuth app + Neon Auth.** Enable Neon Auth on the project and connect
   the GitHub provider (create a GitHub OAuth app: org → Developer settings → OAuth
   Apps). **Record** the Neon Auth value now — you consume it in Phase 3 (though the
   Neon↔Vercel integration also injects it, keep it handy for reference/local dev):
   - `VITE_NEON_AUTH_URL` — the **full** Neon Auth URL from the console, incl. path
     and scheme: `https://ep-….neonauth.<region>.aws.neon.tech/<db>/auth`. The SDK
     client points at this (for sign-in and to read the session token).
   - **GitHub OAuth callback URL** to register in the GitHub app: per the Neon Auth
     docs for your project (the callback is on the Neon Auth origin, not the site
     domain). Confirm the exact path in the console when connecting GitHub.
   - **Trusted origins.** Add every site origin that starts a login (prod domain +
     the Vercel preview origin/wildcard) to Neon Auth's `trusted_origins`
     (`project_config.trusted_origins`), or Better Auth rejects the post-login
     redirect back to the site.
   Confirm the `neon_auth` table/column shapes match `server/src/auth/neon-auth.ts`,
   which resolves the viewer by querying `neon_auth.session` / `"user"` / `account`
   directly ([a supported pattern](https://neon.com/docs/auth/authentication-flow) —
   Neon lets you query the `neon_auth` schema with SQL). The session cookie is
   Neon's HttpOnly `__Secure-neonauth.session_token` ([docs](https://neon.com/docs/auth/authentication-flow#session-cookie-is-set));
   the resolver hardcodes that name (tolerating the `__Secure-`/`__Host-` prefix),
   so there is nothing to configure. No cookie/base env is needed by the Function —
   `DATABASE_URL` (injected by Neon) is all the server needs.
3. **Neon API key** → you'll store it as the `NEON_API_KEY` secret in Phase 3.
4. **Vercel project.** Create it, connect the repo, set **root directory** to
   `site/`. Record `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from
   `.vercel/project.json` after `vercel link`, or project settings). Create a
   **Vercel token** → the `VERCEL_TOKEN` secret in Phase 3.
5. **Install the Neon↔Vercel native integration** (Vercel Marketplace → Neon, or
   Neon console → Integrations → Vercel), and **leave branch creation ON**
   (Advanced Options → "Create a database branch for deployment" — the default).
   Enable **Neon Auth for previews**. The integration then, per preview:
   - creates the Neon branch `preview/<git-branch>`,
   - injects the auth env `VITE_NEON_AUTH_URL` (+ `NEON_AUTH_BASE_URL`),
   - injects the DB connection vars `DATABASE_URL` (pooled) + `DATABASE_URL_UNPOOLED`
     into the Vercel **preview** env, scoped to that git branch.
   > **Branch ownership — the integration owns the per-PR branch.**
   > `preview-deploy.yml` no longer creates its own branch. It pulls the
   > integration-injected env for the PR's git branch
   > (`vercel env pull --git-branch=<head_ref>`), migrates the branch via the
   > `DATABASE_URL_UNPOOLED` it finds there, and deploys the review Function to
   > `preview/<head_ref>`. Teardown is the integration's too (it removes the branch
   > when the preview is removed), so there is **no** close/cleanup job. The
   > Function itself is always deployed by the workflow — the integration creates
   > the DB branch and injects env, but it does **not** deploy Neon Functions.

**After Phase 1 you have:** `NEON_PROJECT_ID`, the Neon API key, the full
`VITE_NEON_AUTH_URL`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and the Vercel token;
the Neon↔Vercel integration is installed (branch creation + env injection on);
the GitHub callback + trusted origins are registered on the Neon Auth side.
**Not yet:** any Function host or the prod
Function URL — those don't exist until Phase 4.

---

## Phase 2 — Schema + bootstrap the first admin (production branch)

1. **Apply the base schema to the production branch.** Grab the branch's *direct*
   (unpooled) connection string from the Neon console — this is the same value you
   store as the `DATABASE_URL` **`production`** secret in Phase 3:
   ```bash
   DATABASE_URL='<prod-direct-url>' node server/scripts/migrate.mjs
   ```
   Applies `server/db/migrations/*.sql` (idempotent; tracked in `schema_migrations`).
2. **Bootstrap the first admin — no SQL.** In the **Neon Console → Auth → Users**,
   open the ⋯ menu next to your user and choose **Make admin** (this needs the Better
   Auth **admin plugin** enabled on the project — the default for Neon Auth). That
   sets `neon_auth."user".role = 'admin'`, which the app reads as **site admin**: you
   are admitted past the AccessGate with **maintainer** access (release/review/erase)
   **and** you can open `/admin` to manage the reviewer allowlist — no seed row needed.

   > **Why this replaces the old `insert into reviewer_allowlist` bootstrap:**
   > `neon_auth` is a **Neon-managed** schema, *not* part of `server/db/migrations/*.sql`.
   > So the admin designation **survives dropping/recreating the app database** — after
   > a reset you re-run step 1 only, and you're still admitted with no re-seeding. The
   > old maintainer seed lived in our own `reviewer_allowlist` table and was lost on
   > every reset. (It was also awkward: because the allowlist is now keyed by the
   > stable user id and FKs `user_identity`, a pre-login SQL grant isn't even possible —
   > the person had to sign in once first. "Make admin" sidesteps that entirely.)

3. **(Optional) Seed additional reviewers/maintainers.** Once you're a site admin,
   add everyone else through the `/admin` panel — no SQL. As a fallback, you can still
   grant by SQL, but the allowlist keys on the stable user id (which FKs
   `user_identity`), so the person must have **signed in once** first; then grant by
   the id resolved from their login:
   ```sql
   insert into reviewer_allowlist (user_id, role, added_by)
   select user_id, 'reviewer', 'bootstrap' from user_identity
   where lower(github_login) = lower('some-login')
   on conflict (user_id) do nothing;
   ```

---

## Phase 3 — Configure GitHub + Vercel (values you have now)

Set everything you already hold from Phases 1–2. **One value is deferred to
Phase 5** because it doesn't exist yet: `REVIEW_API_URL` (the live prod Function
URL, produced by the first prod deploy in Phase 4). `NEON_FUNCTION_HOST` is no
longer a Vercel value at all — the workflows capture it and pass it into the build.

### 3a. Turn OFF Vercel's git builds — CI ships every deploy prebuilt

**Vercel builds nothing.** Both environments' SPAs are built in GitHub Actions
(`build:vercel`, which needs uv + Chromium — absent from Vercel's build image) and
shipped with `vercel deploy --prebuilt`. If Vercel's own git integration built the
site it would silently produce an **incomplete corpus** (no `scripts.json`, missing
PNG twins), so the git build is disabled outright. Two **dashboard** settings on the
Vercel project (Root Directory is `site`):

1. **Ignored Build Step → skip ALL git builds** (Project → Settings → Git). Every
   deploy — preview and production alike — arrives via `vercel deploy --prebuilt`
   from a workflow, which skips the build phase entirely; the git integration must
   never build. (Previously this built `main`; production is now built in CI too.)
   ```bash
   # Vercel convention: exit 1 = build, exit 0 = skip. Skip unconditionally —
   # CI (preview-deploy.yml / deploy-function.yml) deploys prebuilt.
   exit 0
   ```
   The Ignored Build Step runs only for git-triggered builds, so it silences all
   auto builds without affecting the workflows' `--prebuilt` deploys.

2. **Build Command → `echo "built in CI (prebuilt)"`** (Project → Settings → Build
   & Deployment). With the Ignored Build Step skipping every git build this won't
   normally run; the harmless `echo` guards against a manual dashboard **Redeploy**
   (which ignores the Ignored Build Step) silently shipping an incomplete corpus via
   `build:vercel` on the bare Vercel image. Leave Output Directory on the Build
   Output API default. To ship a fresh production build, re-run `deploy-function.yml`
   (or push to `main`) — never "Redeploy" from the Vercel dashboard.

### 3b. Vercel env

Set on the Vercel project (per environment):

- **`VITE_NEON_AUTH_URL` (Production + Preview)** — **injected by the Neon↔Vercel
  integration** (Phase 1.5), not set by hand. Baked into the bundle as the SDK
  client's URL; gates the "Sign in" affordance (hidden when unset) and is the
  origin the session token is read from. Confirm it's present in both environments
  (Vercel → Settings → Environment Variables); both builds pick it up via
  `vercel pull` (prod: `--environment=production`, preview: `--environment=preview`).
- **Production env (set by hand):**
  - Leave `VITE_API_URL` **unset** so the bundle uses same-origin `/api`.
- **`NEON_FUNCTION_HOST` is NOT a Vercel value** in either environment — both
  workflows capture the host at deploy time and pass it into `build:vercel` in CI
  (prod: the `deploy` job output; preview: per-branch via `$GITHUB_ENV`).

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
| `VERCEL_TOKEN` | secret | `preview` + `production` | non-interactive Vercel CLI auth (both workflows deploy prebuilt to Vercel) |
| `NEON_PROJECT_ID` | var | `preview` + `production` | Neon project id (same value both) |
| `REVIEW_ALLOWED_ORIGIN` | var | `production` only | prod CORS allowlist (the docs domains). **Not** set for preview: the preview workflow captures the Vercel deploy URL from `vercel deploy` stdout and redeploys the Function with `ALLOWED_ORIGIN` locked to it (two-pass deploy — see §4), so each preview's CORS matches its own origin with no static var |
| `REVIEW_NEON_AUTH_URL` | var | `production` only | the **full** Neon Auth URL (same value as `VITE_NEON_AUTH_URL`, incl. `/<db>/auth`). Passed to the Function as `NEON_AUTH_URL` — the JWT issuer/audience + JWKS base it verifies bearers against. **Not** set for preview: that workflow reads the injected `VITE_NEON_AUTH_URL` from the pulled preview env |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | var | `preview` + `production` | Vercel CLI targeting (same values both) |

> **No feature-flag gates.** The workflows run on their triggers; there are no
> `*_ENABLED` repo variables. What keeps prod safe is the `production` GitHub
> environment's **main-only branch restriction** (Phase 3c) — GitHub refuses to
> expose its secrets to any other ref, so a branch build can't deploy prod even
> if it tries. Previews run on every PR against the `preview` environment.

---

## Phase 4 — First production deploy (produces the deferred value)

The Neon Functions CLI is in **beta** (`neonctl` 2.38.x, currently **us-east-2
only**) and its `functions deploy` **blocks and then falsely times out even when
the deploy already succeeded** (see the detailed note below). The workflows work
around it: they run the deploy **detached** and drive off
`neonctl functions get … --output json`, waiting for `current_deployment.status
== "completed"` and reading `invocation_url`. Run the prod deploy **once,
manually** to produce the one value Phase 3 deferred:

1. Trigger `deploy-function.yml` via **workflow_dispatch**. It migrates the prod
   branch, deploys the prod Function (logging a `::notice::` with the host), then
   the `deploy-site` job builds the SPA in CI and deploys it prebuilt to Vercel
   production — the host flows straight from `deploy` into the SPA build, so there
   is nothing to copy into Vercel.
2. **Capture** from that run:
   - the full **URL** (host + scheme) → this is `REVIEW_API_URL` (Phase 5).
   - the **host** does not need capturing — it's already consumed as a job output.

Confirm at this first run (beta CLI — adjust if they differ):

- **The Function host is NOT derivable from the git branch name.** Neon forms it as
  `<branch_id>-<slug>.compute.<region>.aws.neon.tech`, where `branch_id` is Neon's
  internal `br-…` id — unknowable before the deploy. Both workflows **deploy first
  and capture** the host; do not reintroduce a name-derived host.
- **CLI invocation — the deploy blocks even on success.** The workflows run the
  CLI via **`bunx neonctl`** (a global `bun install -g neonctl` hung in CI). The
  bigger trap: `neonctl functions deploy` (2.38.x) triggers the deploy, then polls
  "waiting for the deployment to **start**" and hangs the full 10-min timeout even
  when the deployment has **already completed within seconds** — then exits 1 with
  a false `ERROR: Timed out`. This was verified: a `functions get` on the branch
  showed `current_deployment.status == "completed"` at the exact trigger second,
  while the deploy command was still hung. `--wait` only governs the *build* wait,
  not this start-poll, so no flag fixes it. The workaround: run the deploy
  **detached** (`setsid … &`) and don't depend on its exit; poll `neonctl
  functions get <slug> --branch <name> --output json` until `current_deployment.
  status` is `completed` (or `failed`), then read `invocation_url`. Verify the
  field names against the beta CLI; pin a version once confirmed.
- That `neon.ts` at the repo root matches your project (auth on; `review` Function
  slug/source/runtime). **`neon.ts` does not auto-deploy** — it is applied only by
  an explicit `neon deploy` (which the workflows run every push); branch creation,
  `neon checkout`, and the Vercel integration do NOT deploy the Function.

> Previews never need this capture step: `preview-deploy.yml` deploys the branch
> Function and writes its host to `$GITHUB_ENV` inline before the Vercel build.

---

## Phase 5 — Set the deferred value

Now that Phase 4 produced it:

1. **GitHub `production` secret** → `REVIEW_API_URL` = the URL from Phase 4.2.

(`NEON_FUNCTION_HOST` is no longer set anywhere by hand — the `deploy` job passes
it to the SPA build directly.)

---

## Phase 6 — Smoke test

With the secrets/vars in place, the workflows are already live (previews on every
PR, prod on push to `main`). Verify end to end:

**Preview (open a PR):**
1. The integration provisions the `preview/<head_ref>` Neon branch; the workflow
   pulls its env, migrates it, deploys the branch Function, and deploys a Vercel
   preview whose `/api` points at that Function.
2. On the preview URL: unauthenticated → sign-in wall; allowlisted GitHub user →
   admitted; non-allowlisted → "access pending"; toggle **View as anonymous** →
   only published content shows.
3. Close the PR → the integration removes the preview's Neon branch (the workflow
   no longer runs a cleanup job).

**Production (merge to main):**
1. `deploy-function.yml` (`deploy` job) migrates the prod branch and redeploys the
   prod Function, exporting its host as a job output.
2. The same workflow's `deploy-site` job builds the SPA in CI with
   `bun run build:vercel` (installing uv + Chromium first), emitting the Build
   Output API tree whose `config.json` routes `/api/*` to the prod Function (host
   from the `deploy` job output), then `vercel deploy --prebuilt --prod`. This is
   the step that gives production its `/api` rewrite and the full agentic-docs
   corpus — without it, sign-in RPCs 404. Confirm the Vercel **Deployments** tab
   shows a CLI/prebuilt deploy, and the merge commit's git build **skipped**
   (Ignored Build Step, §3a).
3. `register-versions.yml` stamps each content version with the merged main sha.
4. Repeat the gate + view-mode checks on the production domain. Confirm in
   DevTools → Network that `POST /api/docs_factory.review.v1.ReviewService/GetViewer`
   returns 200 (not 404).

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
| Vercel rewrite generator | `site/scripts/gen-vercel-config.mjs`, `site/scripts/assemble-vercel-output.mjs` |
| Branch policy | `neon.ts` |
| Workflows | `.github/workflows/preview-deploy.yml`, `deploy-function.yml`, `register-versions.yml` |
