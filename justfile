# docs-factory task runner. Run `just` (or `just --list`) to see recipes.
# Recipes mirror the "Common commands" in AGENTS.md.

# Default: show the recipe list.
default:
    @just --list

# --- Preview site (Astro + Starlight, local only) --------------------------

# Start the local preview site at http://localhost:4321 (installs deps first run).
preview: _site-deps
    cd site && npm run dev

# Build the preview site into site/dist/.
preview-build: _site-deps
    cd site && npm run build

# Install the site's npm dependencies if they're missing.
_site-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d site/node_modules ]; then
        echo "Installing site dependencies…"
        cd site && npm install
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
