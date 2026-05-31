#!/usr/bin/env node
// Validate every workflows/n8n/<slug>/ folder.
//
// For each folder it asserts:
//   1. README.md exists and parses with front-matter (apiVersion + requires).
//   2. workflow.json exists, parses as JSON, has a `nodes` array.
//   3. Every `n8n-nodes-ramsisa.*` node type in the workflow exists in the
//      current `n8n-nodes-ramsisa` build (Ramsisa, RamsisaTrigger).
//   4. README front-matter `apiVersion` is one of the credentials' apiVersion
//      options (currently ["v1"]).
//   5. README front-matter `requires["n8n-nodes-ramsisa"]` semver range is
//      satisfied by the current `n8n-nodes-ramsisa/package.json` version.
//   6. Required README sections exist (Title H1, Common use cases, Required
//      custom fields, Setup steps).
//   7. The workflow.json has been sanitized (no banned keys).
//
// Exits 0 on success, 1 on any validation failure, 2 on tool error.

import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import matter from "gray-matter";
import semver from "semver";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const N8N_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(N8N_ROOT, "..", "..");
const NODE_PKG_DIR = path.join(REPO_ROOT, "n8n-nodes-ramsisa");

const REQUIRED_SECTIONS = [
  "Common use cases",
  "Required custom fields",
  "Setup steps",
];

const BANNED_TOP_LEVEL_KEYS = ["versionId", "meta", "triggerCount", "id"];

// ---------- helpers ----------

class Failures {
  constructor() {
    this.items = [];
  }
  add(scope, msg) {
    this.items.push({ scope, msg });
  }
  get count() {
    return this.items.length;
  }
  report() {
    for (const { scope, msg } of this.items) {
      console.error(`  ✗ [${scope}] ${msg}`);
    }
  }
}

async function readJson(file) {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Read declared node types from package.json `n8n.nodes` paths.
// e.g. "dist/nodes/Ramsisa/Ramsisa.node.js" → node class name "Ramsisa".
async function loadNodeRegistry() {
  const pkg = await readJson(path.join(NODE_PKG_DIR, "package.json"));
  const nodePaths = pkg?.n8n?.nodes ?? [];

  // n8n addresses nodes as `<package-name>.<node.name>` where node.name is
  // the `name` property in the TS class description, NOT the file name.
  // We pull each by reading the corresponding TS source — robust against stale dist/.
  const nodeNames = new Set();
  for (const p of nodePaths) {
    // dist/nodes/Foo/Foo.node.js → nodes/Foo/Foo.node.ts
    const tsPath = p
      .replace(/^dist\//, "")
      .replace(/\.node\.js$/, ".node.ts");
    const abs = path.join(NODE_PKG_DIR, tsPath);
    const src = await readFile(abs, "utf8");
    // Grab the value of the first `name:` in the description block.
    const m = src.match(/name:\s*["']([a-zA-Z0-9_]+)["']/);
    if (!m) {
      throw new Error(`Cannot infer node name from ${tsPath}`);
    }
    nodeNames.add(`${pkg.name}.${m[1]}`);
  }
  return { packageName: pkg.name, packageVersion: pkg.version, nodeTypes: nodeNames };
}

// Read the apiVersion options array from the credentials TS source.
async function loadApiVersions() {
  const credPath = path.join(
    NODE_PKG_DIR,
    "credentials",
    "RamsisaApi.credentials.ts",
  );
  const src = await readFile(credPath, "utf8");
  // Find the `options: [{ name: "v1", value: "v1" }, ...]` array attached to
  // the apiVersion property. We do this with a light parser: locate "apiVersion"
  // then the next `options:` array.
  const apiIdx = src.indexOf('name: "apiVersion"');
  if (apiIdx === -1) {
    throw new Error("Cannot find apiVersion property in RamsisaApi credentials");
  }
  const tail = src.slice(apiIdx);
  const optionsMatch = tail.match(/options:\s*\[([\s\S]*?)\]/);
  if (!optionsMatch) {
    throw new Error("Cannot find apiVersion options array");
  }
  const versions = [...optionsMatch[1].matchAll(/value:\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  if (versions.length === 0) {
    throw new Error("apiVersion options array is empty");
  }
  return new Set(versions);
}

async function findWorkflowFolders(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;
    out.push(path.join(root, entry.name));
  }
  return out;
}

// ---------- per-folder validation ----------

async function validateFolder(folder, ctx, fails) {
  const slug = path.basename(folder);
  const scope = (sub) => `${slug}${sub ? `:${sub}` : ""}`;

  const readmePath = path.join(folder, "README.md");
  const wfPath = path.join(folder, "workflow.json");

  if (!(await exists(readmePath))) {
    fails.add(scope("README.md"), "missing");
    return;
  }
  if (!(await exists(wfPath))) {
    fails.add(scope("workflow.json"), "missing");
    return;
  }

  // --- README front-matter ---
  const readmeRaw = await readFile(readmePath, "utf8");
  const parsed = matter(readmeRaw);
  const fm = parsed.data ?? {};
  const body = parsed.content ?? "";

  if (!fm.apiVersion) {
    fails.add(scope("front-matter"), "missing `apiVersion`");
  } else if (!ctx.apiVersions.has(String(fm.apiVersion))) {
    fails.add(
      scope("front-matter"),
      `apiVersion "${fm.apiVersion}" is not in the credentials' allowed set [${[...ctx.apiVersions].join(", ")}]`,
    );
  }

  const requires = fm.requires ?? {};
  const nodeRange = requires["n8n-nodes-ramsisa"];
  if (!nodeRange) {
    fails.add(scope("front-matter"), 'missing `requires["n8n-nodes-ramsisa"]`');
  } else if (!semver.validRange(nodeRange)) {
    fails.add(
      scope("front-matter"),
      `requires["n8n-nodes-ramsisa"] is not a valid semver range: ${nodeRange}`,
    );
  } else if (!semver.satisfies(ctx.packageVersion, nodeRange)) {
    fails.add(
      scope("front-matter"),
      `current ${ctx.packageName}@${ctx.packageVersion} does not satisfy required range ${nodeRange}`,
    );
  }

  // --- README sections ---
  // H1 is required — covers the "Title" section in PLAN.md.
  if (!/^#\s+\S/m.test(body)) {
    fails.add(scope("README"), "missing H1 title");
  }
  for (const section of REQUIRED_SECTIONS) {
    const re = new RegExp(
      `^##+\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "im",
    );
    if (!re.test(body)) {
      fails.add(scope("README"), `missing section "${section}"`);
    }
  }

  // --- workflow.json ---
  let workflow;
  try {
    workflow = await readJson(wfPath);
  } catch (e) {
    fails.add(scope("workflow.json"), `not valid JSON — ${e.message}`);
    return;
  }

  for (const key of BANNED_TOP_LEVEL_KEYS) {
    if (key in workflow) {
      fails.add(
        scope("workflow.json"),
        `must not contain top-level "${key}" — run \`npm run sanitize\``,
      );
    }
  }

  if (!Array.isArray(workflow.nodes)) {
    fails.add(scope("workflow.json"), "missing `nodes` array");
    return;
  }

  // Every ramsisa* node type must be registered.
  for (const node of workflow.nodes) {
    const type = node?.type;
    if (typeof type !== "string") {
      fails.add(scope("workflow.json"), `a node is missing its \`type\``);
      continue;
    }
    if (!type.startsWith(`${ctx.packageName}.`)) continue;
    if (!ctx.nodeTypes.has(type)) {
      fails.add(
        scope("workflow.json"),
        `node type "${type}" is not exported by ${ctx.packageName}. Known: [${[...ctx.nodeTypes].join(", ")}]`,
      );
    }
    // Sanitization sanity check at the node level.
    if (node.webhookId) {
      fails.add(
        scope("workflow.json"),
        `node "${node.name ?? type}" still has webhookId — run \`npm run sanitize\``,
      );
    }
    const creds = node.credentials ?? {};
    for (const [credType, ref] of Object.entries(creds)) {
      if (ref && typeof ref === "object" && "id" in ref) {
        fails.add(
          scope("workflow.json"),
          `node "${node.name ?? type}" credential "${credType}" still has an id — run \`npm run sanitize\``,
        );
      }
    }
  }
}

// ---------- main ----------

async function main() {
  const fails = new Failures();

  let ctx;
  try {
    const registry = await loadNodeRegistry();
    const apiVersions = await loadApiVersions();
    ctx = { ...registry, apiVersions };
  } catch (e) {
    console.error(`validate: tool error — ${e.message}`);
    process.exit(2);
  }

  const folders = await findWorkflowFolders(N8N_ROOT);
  if (folders.length === 0) {
    console.log(`validate: no workflow folders under ${N8N_ROOT}`);
    return;
  }

  console.log(
    `validate: ${ctx.packageName}@${ctx.packageVersion} · apiVersions=[${[...ctx.apiVersions].join(", ")}] · ${folders.length} workflow(s)`,
  );

  for (const folder of folders) {
    await validateFolder(folder, ctx, fails);
  }

  if (fails.count > 0) {
    console.error(`\nvalidate: ${fails.count} failure(s)`);
    fails.report();
    process.exit(1);
  }

  console.log(`validate: all ${folders.length} workflow(s) pass`);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
