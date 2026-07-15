#!/usr/bin/env bash
#
# Render D2 diagram sources to SVG.
#
# NOTE: LikeC4 (https://likec4.dev) is the PREFERRED diagram tool for new
# diagrams — see blogs/CONVENTIONS.md. LikeC4 has its own render path (npm +
# headless Chromium), not this script:
#   npx likec4 export png --sequence -o . blogs/<slug>/assets
# This script remains the renderer for D2 (`.d2`), which is still fine for an
# existing diagram or a quick one-off.
#
# Diagrams authored in the D2 language (https://d2lang.com) are compiled to SVG
# with the D2 CLI. The `.d2` source is the source of truth and is committed; the
# generated `.svg` sits next to it and is committed too so the drafts render
# without a build step. Re-run this whenever a `.d2` source changes.
#
# Usage:
#   blogs/render-diagrams.sh                 # render every *.d2 under blogs/
#   blogs/render-diagrams.sh path/to/dir     # render every *.d2 under a dir
#   blogs/render-diagrams.sh a.d2 b.d2       # render specific files
#
# Requires the D2 CLI: https://d2lang.com/tldr/install  (e.g. `brew install d2`).

set -euo pipefail

if ! command -v d2 >/dev/null 2>&1; then
  echo "error: d2 not found. Install it: https://d2lang.com/tldr/install" >&2
  exit 1
fi

# Resolve the blogs/ root (this script lives in it) so a bare invocation works
# from anywhere.
blogs_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Collect target .d2 files.
files=()
if [ "$#" -eq 0 ]; then
  while IFS= read -r -d '' f; do files+=("$f"); done \
    < <(find "$blogs_root" -name '*.d2' -print0)
else
  for arg in "$@"; do
    if [ -d "$arg" ]; then
      while IFS= read -r -d '' f; do files+=("$f"); done \
        < <(find "$arg" -name '*.d2' -print0)
    else
      files+=("$arg")
    fi
  done
fi

if [ "${#files[@]}" -eq 0 ]; then
  echo "no .d2 files found"
  exit 0
fi

for src in "${files[@]}"; do
  out="${src%.d2}.svg"
  echo "d2: ${src} -> ${out}"
  d2 "$src" "$out"
done

echo "rendered ${#files[@]} diagram(s)."
