# docs-factory task runner. Run `just` (or `just --list`) to see recipes.
# Recipes mirror the "Common commands" in AGENTS.md.

# Default: show the recipe list.
default:
    @just --list

# --- Preview site (Vite + React + MDX, local only) -------------------------

# Start the unified local preview at http://localhost:4321 (installs deps first run).
# Renders both content/ (Diátaxis docs) and blogs/ (narrative drafts).
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
# Defaults AUTH_MODE=anon (Phase 1); Phase 2 adds mock impersonation. Reads
# server/.env if present. See server/README.md.
server-dev: _server-deps
    cd server && set -a && [ -f .env ] && . ./.env; set +a; AUTH_MODE="${AUTH_MODE:-anon}" bun run dev

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

# Validate frontmatter and snippets (CI gate).
check:
    uv run docsnip check

# Regenerate per-project llms.txt into site/public/ (also runs at site prebuild).
llmstxt: _site-deps
    cd site && node scripts/build-llmstxt.mjs

# Lint + type-check the Python workspace.
lint:
    uv run ruff check .
    uv run ty check

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
