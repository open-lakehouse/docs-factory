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

# Emit blogs/<slug>/draft.md to a target's flattened Markdown (default gdocs).
# Produces blogs/<slug>/dist/<slug>.md + assets.json. See emit/README.md.
emit slug target="gdocs": _emit-deps
    cd emit && bun emit.mjs --slug {{slug}} --target {{target}}

_emit-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d emit/node_modules ]; then
        echo "Installing emitter dependencies…"
        (cd emit && bun install)
    fi

# --- Content & examples ----------------------------------------------------

# Install every uv workspace package.
sync:
    uv sync --all-packages

# Run + verify the Python examples.
test:
    uv run pytest examples/tests

# Validate frontmatter, snippets, and site-artifact freshness (CI gate).
check:
    uv run docsnip check

# Regenerate site-artifacts/ (run after changing content or examples).
generate:
    uv run docsnip generate

# Lint + type-check the Python workspace.
lint:
    uv run ruff check .
    uv run ty check

# Compile the Rust example/seed stubs.
rust:
    cargo build --examples

# --- Architecture model (LikeC4, canonical source of architectural fact) ----

# Interactive dev server for the architecture model (http://localhost:5173).
arch-dev: _arch-deps
    cd architecture && bun rundev

# Validate the LikeC4 model (syntax + semantics). CI-gateable.
arch-check: _arch-deps
    cd architecture && bun runcheck

# Build the self-contained interactive static site into architecture/dist/static.
arch-build: _arch-deps
    cd architecture && bun runbuild

# Export the model to architecture/dist/model.json (agent / interactive-site input).
arch-model: _arch-deps
    cd architecture && bun runmodel

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
