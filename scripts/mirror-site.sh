#!/usr/bin/env bash
# Mirror an emitted site shell (sites/<site>/) into a checkout of its upstream
# repo, whose root IS the site. Run after `just emit-docs <site>`; used by
# .github/workflows/uc-docs-sync.yml and runnable locally against a scratch repo.
#
#   scripts/mirror-site.sh <site-dir> <upstream-checkout>
#
# Exit status: 0 = the upstream tree changed, 3 = nothing but the manifest
# changed (the caller should leave the upstream PR alone), anything else = error.
#
# docs-factory owns every mirrored path, so `--delete` removes whatever this
# emit didn't produce. Upstream keeps only its git metadata, CI, and license.
# `<site-dir>/upstream/` is an overlay copied onto the upstream root last; it
# carries the upstream README and .gitignore, which differ from the in-repo ones.
set -euo pipefail

site_dir=${1:?usage: mirror-site.sh <site-dir> <upstream-checkout>}
dest=${2:?usage: mirror-site.sh <site-dir> <upstream-checkout>}
site_dir=${site_dir%/}
dest=${dest%/}

[ -f "$site_dir/package.json" ] || { echo "mirror-site: $site_dir has no package.json" >&2; exit 1; }
[ -f "$site_dir/.docs-emit.json" ] || { echo "mirror-site: $site_dir has no .docs-emit.json; run just emit-docs first" >&2; exit 1; }
git -C "$dest" rev-parse --git-dir >/dev/null

# A leading `/` anchors a pattern at the transfer root, so `src/content/README.md`
# style paths deeper in the tree are still mirrored.
rsync -a --delete \
  --exclude=/.git/ \
  --exclude=/.github/ \
  --exclude=/LICENSE \
  --exclude=/NOTICE \
  --exclude=/upstream/ \
  --exclude=node_modules/ \
  --exclude=/dist/ \
  --exclude=/.ssr/ \
  --exclude=/.vercel/ \
  "$site_dir/" "$dest/"
if [ -d "$site_dir/upstream" ]; then
  cp -R "$site_dir/upstream/." "$dest/"
fi

git -C "$dest" add -A
# The manifest embeds the source commit, so it differs on every run even when
# no reader-visible byte did.
if git -C "$dest" diff --cached --quiet -- . ':(exclude).docs-emit.json'; then
  git -C "$dest" reset -q --hard
  exit 3
fi
git -C "$dest" diff --cached --stat | tail -1
