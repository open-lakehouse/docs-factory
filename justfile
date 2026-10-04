# docs-factory task runner. Run `just` (or `just --list`) to see recipes.
# Recipes mirror the "Common commands" in AGENTS.md.

default:
    @just --list

# --- Preview site (Vite + React + MDX, local only) -------------------------

# Full local stack in one command: Postgres (migrated + seeded), the review API
# (AUTH_MODE=mock) with content versions registered, and the preview at :4321.
# Ctrl-C stops the API too. Without Docker it falls back to `just preview`
# (offline mode: content only, no review features).
dev: _site-deps _server-deps
    #!/usr/bin/env bash
    set -euo pipefail
    [ -f server/.env ] || { cp server/.env.example server/.env; echo "Created server/.env from .env.example"; }
    if ! docker info >/dev/null 2>&1; then
        echo "Docker is not running — starting the site only (offline mode, no review API)."
        exec just preview
    fi
    just db-up db-migrate db-seed
    # Job control puts the API in its own process group, so the EXIT trap can
    # stop bun and its --watch child together. mock is forced: an older
    # server/.env may still say anon, under which the gated site admits nobody.
    set -m
    (cd server && set -a && . ./.env && set +a && AUTH_MODE=mock exec bun run dev) &
    api=$!
    trap 'kill -- -"$api" 2>/dev/null || true' EXIT
    for _ in $(seq 60); do
        curl -sf http://localhost:8787/healthz >/dev/null && break
        kill -0 "$api" 2>/dev/null || { echo "review API exited during startup" >&2; exit 1; }
        sleep 0.5
    done
    curl -sf http://localhost:8787/healthz >/dev/null || { echo "review API not healthy after 30s" >&2; exit 1; }
    API_URL=http://localhost:8787 just register-versions
    cd site && bun run dev

# Start the unified local preview at http://localhost:4321 (installs deps first run).
# Renders both content/ (Diátaxis docs) and blogs/ (narrative drafts). Without a
# running review API (`just dev`) the site opens in offline mode as a local author.
preview: _site-deps
    cd site && bun run dev

# Build the preview into site/dist/.
preview-build: _site-deps
    cd site && bun run build

# Install site deps on first run.
_site-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d site/node_modules ]; then
        echo "Installing site dependencies…"
        (cd site && bun install)
    fi

# --- Emit a blog draft to a downstream target ------------------------------

# Emit blogs/<slug>/index.md to a downstream target. `target` is required:
# `unitycatalog` (unitycatalog.io) or `delta` (delta.io). Produces
# blogs/<slug>/dist/<target>/. See emit/README.md.
emit slug target: _emit-deps
    cd emit && bun emit.mjs --slug {{slug}} --target {{target}}

# --- Emit a project's docs into a static target site ------------------------

# emit/docs/sites/<site>.mjs names the project and URL scheme. Flags: --drafts
# (include draft pages, for a local preview), --dry-run, --report <file.md|.json>,
# --out <dir>. Writes only changed files and prints a page-level change report.
# Render content/<project>/ into the static site shell sites/<site>/.
emit-docs site *flags: _emit-deps _site-deps
    cd emit && bun docs/emit-docs.mjs --site {{site}} {{flags}}

# Emit the UC docs (drafts included), build the static site, preview on :4322.
uc-docs: (emit-docs "unitycatalog-docs" "--drafts")
    cd sites/unitycatalog-docs && bun install && bun run build && bun run preview

_emit-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d emit/node_modules ]; then
        echo "Installing emitter dependencies…"
        (cd emit && bun install)
    fi

# --- Review API (proto → Connect RPC; backend on Neon Functions) -----------

# Regenerate TypeScript from proto/ into site/src/gen (client + connect-query
# hooks) and server/src/gen (message/service types). Uses buf remote plugins.
buf-gen:
    cd proto && buf generate

# Lint + breaking-change check the review protos (CI gate).
buf-check:
    cd proto && buf lint

# Strip internal npm-proxy URLs from every committed bun.lock (host-agnostic;
# empty resolution = default registry). Run before opening a PR; the pre-commit
# hook does this automatically on staged lockfiles, and CI --checks it.
strip-lock-proxy:
    bun scripts/strip-bun-lock-proxy.ts

# Regenerate site/src/generated/content-versions.json (body hashes + section
# anchors) from blogs/ and content/. Heading ids match the rendered DOM exactly.
version-manifest: _site-deps
    cd site && node scripts/build-version-manifest.mjs

# Push the manifest to the review API (RegisterVersion per entry). Run after a
# deploy; needs API_URL + BUILD_SECRET. Locally, run `just server-dev` first.
# Uses bun to run the script since it imports the generated TypeScript client.
register-versions: version-manifest _server-deps
    cd server && set -a && [ -f .env ] && . ./.env; set +a; bun run scripts/register-versions.mjs

# Start the local Postgres (docker-compose in server/) and wait until healthy.
# Credentials come from server/.env (copy server/.env.example first).
db-up:
    cd server && docker compose up -d --wait

# Stop the local Postgres (keeps the data volume).
db-down:
    cd server && docker compose down

# Purge the local Postgres: drop the container AND its data volume, then bring a
# fresh one up and re-apply migrations from scratch. Use after a schema rewrite.
db-reset: _server-deps
    cd server && docker compose down -v && docker compose up -d --wait
    just db-migrate
    just db-seed

# Apply db/migrations/*.sql. Reads DATABASE_URL or the PG* parts from server/.env.
db-migrate: _server-deps
    cd server && set -a && [ -f .env ] && . ./.env; set +a; node scripts/migrate.mjs

# Apply db/seed/*.sql (LOCAL DEV ONLY): synthetic registered users + allowlist
# grants matching the mock provider's personas, so the pickers have content.
# Idempotent (on conflict do nothing). Runs as part of db-reset.
db-seed: _server-deps
    cd server && set -a && [ -f .env ] && . ./.env; set +a; node scripts/seed.mjs

# Run the review backend locally (same Hono+Connect app the Neon Function runs).
# Defaults AUTH_MODE=mock (x-dev-persona impersonation; under anon the login-gated
# site admits nobody). Reads server/.env if present. See server/README.md.
server-dev: _server-deps
    cd server && set -a && [ -f .env ] && . ./.env; set +a; AUTH_MODE="${AUTH_MODE:-mock}" bun run dev

_server-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d server/node_modules ]; then
        echo "Installing server dependencies…"
        (cd server && bun install)
    fi

# --- Content & tooling ------------------------------------------------------

# Install every uv workspace package.
sync:
    uv sync --all-packages

# Run the default test lane: docsnip tests + service-free tutorial scripts.
# Service-backed tutorial tests are excluded by the pytest addopts marker
# filter, so this stays green with no Docker.
test:
    uv run pytest

# Run the service-backed tutorial tests (opt-in). Needs Docker; each tutorial
# script's [tool.docs-factory] metadata names the compose the harness starts.
# Fails hard (never skips) if Docker/the server is unavailable.
test-services:
    uv run --group test-services pytest -m "needs_docker or needs_uc_server"

# --- aws-sim (pretend-AWS S3/STS for UC; see envs/aws-sim/README.md) --------

# Start the example stack: UC + RustFS + Envoy answering *.amazonaws.com.
# UC listens on $UC_PORT (default 8080) on the host.
aws-sim-up:
    cd envs/aws-sim/example && docker compose up -d --wait

# Vend S3 credentials through UC and read/write with them from the host.
aws-sim-smoke: aws-sim-up
    cd envs/aws-sim/example && \
      UC_BASE_URL=http://localhost:${UC_PORT:-8080}/api/2.1/unity-catalog \
      AWS_ENDPOINT_URL=http://localhost:9000 AWS_ALLOW_HTTP=true \
      uv run --no-project smoke.py

# Follow Envoy's access log: every S3/STS request with the host it was sent to.
aws-sim-logs:
    cd envs/aws-sim/example && docker compose logs -f --no-log-prefix envoy

aws-sim-down:
    cd envs/aws-sim/example && docker compose down -v

# Validate frontmatter, snippets, and nav.yml manifests (CI gate).
check: _site-deps
    uv run docsnip check
    cd site && node scripts/check-nav.mjs

# Lint + type-check the Python workspace.
lint:
    uv run ruff check .
    uv run ty check

# --- JS/TS tooling (Biome lint+format, tsc typecheck) -----------------------

# Lint + format-check every JS/TS project with Biome (each project's biome.json
# extends the root // config). Read-only; mirrors what CI's `biome ci` gates.
lint-js: _site-deps _server-deps _emit-deps
    cd site && bunx biome check
    cd server && bunx biome check
    cd emit && bunx biome check

# Apply Biome's safe fixes (formatting + safe lint autofixes) across all JS/TS.
format-js: _site-deps _server-deps _emit-deps
    cd site && bunx biome check --write
    cd server && bunx biome check --write
    cd emit && bunx biome check --write

# CI-form gate: lint + format-check, non-zero exit on any error (never writes).
format-check: _site-deps _server-deps _emit-deps
    cd site && bunx biome ci
    cd server && bunx biome ci
    cd emit && bunx biome ci

# Typecheck the two TypeScript projects (site + server) with tsc --noEmit.
typecheck-js: _site-deps _server-deps
    cd site && bun run typecheck
    cd server && bun run typecheck

# Everything CI gates for JS/TS: Biome (lint+format) + tsc typecheck.
check-js: format-check typecheck-js

# Compile the Rust seed helper.
rust:
    cargo build

# --- Architecture model (LikeC4, canonical source of architectural fact) ----

# Interactive dev server for the architecture model (http://localhost:5173).
arch-dev: _arch-deps
    cd architecture && bun run dev

# Validate the LikeC4 model (syntax + semantics). CI-gateable.
arch-check: _arch-deps
    cd architecture && bun run check

# Build the self-contained interactive static site into architecture/dist/static.
arch-build: _arch-deps
    cd architecture && bun run build

# Export the model to architecture/dist/model.json (agent / interactive-site input).
arch-model: _arch-deps
    cd architecture && bun run model

# Validate + export JSON + build static site in one step. Run after any model edit.
arch-refresh: arch-check arch-model arch-build

# Install the LikeC4 tooling on first run.
_arch-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d architecture/node_modules ]; then
        echo "Installing architecture (LikeC4) dependencies…"
        (cd architecture && bun install)
    fi
