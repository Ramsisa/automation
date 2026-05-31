#!/usr/bin/env bash
# Import every workflows/n8n/<slug>/workflow.json into the dev n8n container.
#
# The n8n CLI's `import:workflow` requires a top-level `id`, which
# workflows/n8n/_scripts/sanitize.mjs deliberately strips because it is
# environment-specific (different n8n instances assign their own ids).
# This script injects a fresh UUID per import so the workflow.json files
# can stay sanitized on disk.
#
# Idempotency: each run inserts NEW workflow rows (with new ids). If you
# re-run this you'll get duplicates in the n8n UI. Delete the duplicates
# from the UI or wipe the volume:
#   docker compose -f dev/docker-compose.yml down -v
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
WORKFLOWS_DIR="$REPO_ROOT/workflows/n8n"

if ! docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -q '^n8n$'; then
  echo "dev: n8n container is not running. Start it with:" >&2
  echo "  docker compose -f dev/docker-compose.yml up -d" >&2
  exit 1
fi

count=0
for dir in "$WORKFLOWS_DIR"/*/; do
  slug="$(basename "$dir")"
  case "$slug" in _*) continue ;; esac
  wf="$dir/workflow.json"
  [ -f "$wf" ] || continue

  echo "=== $slug ==="
  python3 - "$wf" <<'PY' | docker compose -f "$COMPOSE_FILE" exec -T n8n sh -c 'cat > /tmp/wf.json && n8n import:workflow --input=/tmp/wf.json'
import json, sys, uuid
d = json.load(open(sys.argv[1]))
d["id"] = str(uuid.uuid4())
json.dump(d, sys.stdout)
PY
  count=$((count + 1))
done

echo
echo "dev: imported $count workflow(s). Open http://localhost:5679/workflows"
