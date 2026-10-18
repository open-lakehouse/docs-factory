#!/usr/bin/env bash
# Render generated environments with the pinned Trestle (.tools/trestle):
# each envs/<name> given, or every folder with an env.toml. `just env-render`
# and the Trestle workflow both call this, so CI renders what you commit.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -gt 0 ]; then
  dirs=("$@")
else
  dirs=(envs/*/env.toml)
  dirs=("${dirs[@]%/env.toml}")
fi
for dir in "${dirs[@]}"; do
  # A hosted environment renders against the stand-ins its placeholders.sh
  # commits; readers re-render with their own.
  if [ -f "$dir/placeholders.sh" ]; then
    (set -a && . "$dir/placeholders.sh" && set +a && .tools/trestle/bin/trestle env render "$dir" >/dev/null)
  else
    .tools/trestle/bin/trestle env render "$dir" >/dev/null
  fi
done
