#!/usr/bin/env node
// Sanitize every workflow.json under workflows/n8n/<slug>/ in place.
// Removes environment-specific noise so an exported workflow can be imported
// cleanly on any n8n instance.
//
// Usage:
//   node sanitize.mjs            # rewrite in place
//   node sanitize.mjs --check    # exit 1 if any file would change (CI / pre-commit)

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const N8N_ROOT = path.resolve(SCRIPT_DIR, "..");

const CHECK_MODE = process.argv.includes("--check");

const STRIP_TOP_LEVEL = new Set([
  "versionId",
  "meta",
  "triggerCount",
  "id",
  "active",
  "tags",
  "pinData",
]);

// Inside each node we drop env-specific stuff but keep the rest.
const STRIP_NODE_LEVEL = new Set(["webhookId"]);

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i;

// Heuristic: a hard-coded n8n webhook URL injected as a Generate-Schedule
// webhookUrl is environment-specific. Workflows should leave webhookUrl blank
// and rely on the downstream RamsisaTrigger node (n8n re-binds on import).
function scrubGenerateWebhookUrl(node) {
  if (node?.type !== "n8n-nodes-ramsisa.ramsisa") return;
  if (node?.parameters?.operation !== "generate") return;
  const url = node?.parameters?.webhookUrl;
  if (typeof url !== "string") return;
  if (url.trim() === "") return;
  // Allow n8n expressions (={{ ... }}). Strip only literal URLs.
  if (url.startsWith("=")) return;
  node.parameters.webhookUrl = "";
}

function scrubLocalhostInHttp(node) {
  if (node?.type !== "n8n-nodes-base.httpRequest") return;
  const url = node?.parameters?.url;
  if (typeof url !== "string") return;
  if (LOCALHOST_RE.test(url)) {
    node.parameters.url = "";
  }
}

function stripCredentialIds(node) {
  const creds = node?.credentials;
  if (!creds || typeof creds !== "object") return;
  for (const credType of Object.keys(creds)) {
    const ref = creds[credType];
    if (ref && typeof ref === "object") {
      // n8n stores { id, name } — drop id, keep name. n8n re-binds by name on import.
      delete ref.id;
    }
  }
}

function sanitize(workflow) {
  const out = { ...workflow };

  for (const key of STRIP_TOP_LEVEL) {
    delete out[key];
  }

  if (Array.isArray(out.nodes)) {
    out.nodes = out.nodes.map((n) => {
      const copy = { ...n };
      for (const key of STRIP_NODE_LEVEL) delete copy[key];
      stripCredentialIds(copy);
      scrubGenerateWebhookUrl(copy);
      scrubLocalhostInHttp(copy);
      return copy;
    });
  }

  return out;
}

async function findWorkflowFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // _scripts, _shared, etc.
    const wfPath = path.join(root, entry.name, "workflow.json");
    try {
      await stat(wfPath);
      files.push(wfPath);
    } catch {
      // No workflow.json in this folder — skip silently.
    }
  }
  return files;
}

function stableStringify(obj) {
  // n8n exports are pretty-printed with 2-space indent and a trailing newline.
  return JSON.stringify(obj, null, 2) + "\n";
}

async function main() {
  const files = await findWorkflowFiles(N8N_ROOT);
  if (files.length === 0) {
    console.log(`sanitize: no workflow.json files under ${N8N_ROOT}`);
    return;
  }

  let drift = 0;
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    let workflow;
    try {
      workflow = JSON.parse(raw);
    } catch (e) {
      console.error(`sanitize: ${file} is not valid JSON — ${e.message}`);
      process.exit(2);
    }
    const cleaned = stableStringify(sanitize(workflow));
    if (cleaned !== raw) {
      drift += 1;
      const rel = path.relative(process.cwd(), file);
      if (CHECK_MODE) {
        console.error(`sanitize: ${rel} is not sanitized`);
      } else {
        await writeFile(file, cleaned, "utf8");
        console.log(`sanitize: rewrote ${rel}`);
      }
    }
  }

  if (CHECK_MODE && drift > 0) {
    console.error(
      `\nsanitize: ${drift} file(s) need sanitization. Run \`npm run sanitize\` and commit.`,
    );
    process.exit(1);
  }

  if (drift === 0) {
    console.log(`sanitize: ${files.length} workflow(s) clean`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
