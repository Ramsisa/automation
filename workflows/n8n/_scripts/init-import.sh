#!/bin/sh
# Two-phase first-run setup for the dev n8n stack. Runs as a one-shot init
# service before n8n itself starts (see dev/docker-compose.yml).
#
# Phase 1: pack the local n8n-nodes-ramsisa source and npm-install it into
# ~/.n8n/nodes/. n8n loads packages from there under their real name
# (n8n-nodes-ramsisa.*), which is what the workflow JSON `type` fields
# reference. The alternative (N8N_CUSTOM_EXTENSIONS) namespaces nodes as
# CUSTOM.* and breaks the imported workflows.
#
# Phase 2: sync every workflows/n8n/<slug>/workflow.json into the SQLite DB.
# Each slug maps to a deterministic 16-char id (sha1(slug)[:16]), so every run
# is an upsert: existing workflows are overwritten in place, new ones are
# created. Files are the source of truth — UI edits to a file-backed workflow
# WILL be clobbered on the next restart. UI-only workflows (no matching file)
# are left untouched.

set -eu

NODE_PKG_SRC="${NODE_PKG_SRC:-/data/custom-extensions/n8n-nodes-ramsisa}"
N8N_NODES_DIR="${N8N_NODES_DIR:-/home/node/.n8n/nodes}"
WORKFLOWS_DIR="${WORKFLOWS_DIR:-/data/workflows}"

# ---- Phase 1: install n8n-nodes-ramsisa under its real package name -------

if [ -d "$NODE_PKG_SRC" ]; then
  echo "phase 1: install n8n-nodes-ramsisa from $NODE_PKG_SRC"
  mkdir -p "$N8N_NODES_DIR"
  if [ ! -f "$N8N_NODES_DIR/package.json" ]; then
    echo '{"name":"installed-nodes","private":true}' > "$N8N_NODES_DIR/package.json"
  fi

  # Pack the source (read-only mount) into a writable temp dir, then install
  # the tarball. This matches what `npm publish` would produce and avoids
  # exposing the source's own node_modules / dev deps to n8n.
  pack_dir=$(mktemp -d)
  ( cd "$NODE_PKG_SRC" && npm pack --silent --pack-destination "$pack_dir" >/dev/null )
  tgz=$(ls "$pack_dir"/*.tgz | head -1)
  echo "  packed: $(basename "$tgz")"
  ( cd "$N8N_NODES_DIR" && npm install --silent --no-save --no-audit --no-fund "$tgz" )
  rm -rf "$pack_dir"
  echo "  installed into $N8N_NODES_DIR/node_modules/"
else
  echo "phase 1: skipped (no source at $NODE_PKG_SRC)"
fi

# ---- Phase 2: sync workflow JSONs into the n8n DB -------------------------

echo "phase 2: sync workflows"

cd "$WORKFLOWS_DIR"

count=0

for slug in */; do
  slug="${slug%/}"
  case "$slug" in
    _*) continue ;;  # skip _scripts and other tooling dirs
  esac

  src="$slug/workflow.json"
  [ -f "$src" ] || continue

  id=$(printf '%s' "$slug" | sha1sum | cut -c1-16)

  echo "sync:   $slug as $id"
  # busybox mktemp doesn't accept trailing suffixes in the template
  tmp=$(mktemp /tmp/wf-XXXXXXXX)
  node -e "
    const fs = require('fs');
    const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    d.id = process.argv[2];
    fs.writeFileSync(process.argv[3], JSON.stringify(d));
  " "$src" "$id" "$tmp"

  n8n import:workflow --input="$tmp"
  rm -f "$tmp"
  count=$((count + 1))
done

echo "done: synced=$count"
