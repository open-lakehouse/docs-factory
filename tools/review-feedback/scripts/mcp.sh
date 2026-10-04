#!/usr/bin/env bash
# Launch the review-feedback stdio MCP server (see .mcp.json). Agent harnesses
# start it from the repo root, often from a GUI app that doesn't inherit the
# shell's PATH, so look for bun in its usual install locations too. stdout is
# the MCP channel: first-run installs must log to stderr.
set -euo pipefail
export PATH="$PATH:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
# locate.ts imports content-core from site/, which resolves its deps there.
[ -d "$root/site/node_modules" ] || (cd "$root/site" && bun install --frozen-lockfile) >&2
[ -d "$here/node_modules" ] || (cd "$here" && bun install --frozen-lockfile) >&2
exec bun run "$here/src/mcp.ts"
