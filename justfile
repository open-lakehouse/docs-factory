# docs-factory task runner. Run `just` (or `just --list`) to see recipes.
# Recipes mirror the "Common commands" in AGENTS.md.

# Default: show the recipe list.
default:
    @just --list

# --- Preview site (Astro + Starlight, local only) --------------------------

# Start the local preview at http://localhost:4321 (installs deps first run).
# Pass a brand theme to skin it: `just preview` (delta) or `just preview unitycatalog`.
# Stops any stale detached dev server first — `astro dev` daemonizes, so an old
# instance (e.g. one started before your latest content changes) can otherwise
# keep serving outdated pages.
preview theme="delta": _site-deps stop
    cd site && DOCS_THEME={{theme}} npm run dev

# Stop any running (detached) preview dev server.
stop:
    -cd site && npx astro dev stop
    -pkill -f "astro.mjs dev"

# Build the preview site into site/dist/.
preview-build: _site-deps
    cd site && npm run build

# Install site deps and link them at the repo root so content/*.mdx can resolve
# Starlight component imports (the .mdx files live outside site/).
_site-deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d site/node_modules ]; then
        echo "Installing site dependencies…"
        (cd site && npm install)
    fi
    if [ ! -e node_modules ]; then
        echo "Linking ./node_modules -> site/node_modules…"
        ln -s site/node_modules node_modules
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
