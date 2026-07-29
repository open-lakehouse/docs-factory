#!/usr/bin/env bash
# Deploy a Neon Function and block until it reaches a terminal status, printing
# its invocation host (no scheme) on success. Shared by the prod deploy
# (.github/workflows/deploy-function.yml) and BOTH passes of the per-PR preview
# deploy (.github/workflows/preview-deploy.yml) so the deploy+poll dance lives in
# ONE place.
#
# Why the detached run + poll (not just `neonctl … --wait`): the beta neonctl
# (2.38.x) BLOCKS after triggering a deploy — it polls "waiting for the
# deployment to start" and hangs the full timeout even when the deployment has
# already COMPLETED within seconds, then exits 1 with a false "Timed out"
# (--wait governs only the build wait). So we run the deploy detached and drive
# off `functions get`, which returns the completed deployment immediately. When
# neonctl stabilizes, this workaround (setsid + poll) is what to revisit.
#
# Usage:
#   scripts/deploy-neon-function.sh <slug> <project-id> [--branch <branch>] [--env K=V ...]
#
# Env passed with --env is forwarded verbatim to `neonctl functions deploy
# --env`. DATABASE_URL is injected by Neon at runtime and must NOT be passed.
# On success the invocation host (invocation_url with the scheme stripped) is
# echoed to stdout as the last line, for the caller to capture (e.g. to bake the
# /api rewrite). Fails (exit 1) on a `failed` deployment or a poll timeout.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "::error::deploy-neon-function.sh: usage: <slug> <project-id> [--branch <b>] [--env K=V ...]" >&2
  exit 2
fi

SLUG="$1"
PROJECT_ID="$2"
shift 2

BRANCH=""
ENV_ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --env)
      ENV_ARGS+=(--env "${2:-}")
      shift 2
      ;;
    *)
      echo "::error::deploy-neon-function.sh: unknown arg '$1'" >&2
      exit 2
      ;;
  esac
done

BRANCH_ARGS=()
if [ -n "$BRANCH" ]; then
  BRANCH_ARGS=(--branch "$BRANCH")
fi

LOG="$(mktemp)"

# Trigger the deploy detached (see header): its own exit is unreliable, so we
# never wait on it — we poll `functions get` for a terminal status instead.
setsid bunx neonctl functions deploy "$SLUG" \
  --project-id "$PROJECT_ID" "${BRANCH_ARGS[@]}" \
  --src server/src/handler.ts --wait=false \
  "${ENV_ARGS[@]}" \
  >"$LOG" 2>&1 &

INVOCATION_URL=""
STATUS=""
for _ in $(seq 1 60); do
  GET_JSON=$(bunx neonctl functions get "$SLUG" \
    --project-id "$PROJECT_ID" "${BRANCH_ARGS[@]}" --output json 2>/dev/null || echo '{}')
  STATUS=$(jq -r '.current_deployment.status // empty' <<<"$GET_JSON")
  if [ "$STATUS" = "completed" ]; then
    INVOCATION_URL=$(jq -r '.invocation_url // empty' <<<"$GET_JSON")
    break
  fi
  if [ "$STATUS" = "failed" ]; then
    echo "::error::the $SLUG Function deployment reported status=failed — see the Neon console (docs/deploy/runbook.md §4)." >&2
    cat "$LOG" >&2 || true
    exit 1
  fi
  sleep 5
done

if [ -z "$INVOCATION_URL" ]; then
  echo "::error::$SLUG Function did not reach status=completed after polling (last status: '${STATUS:-none}'); check the Neon console (docs/deploy/runbook.md §4)." >&2
  cat "$LOG" >&2 || true
  exit 1
fi

# Emit the host (no scheme) as the last stdout line for the caller to capture.
echo "${INVOCATION_URL#https://}"
