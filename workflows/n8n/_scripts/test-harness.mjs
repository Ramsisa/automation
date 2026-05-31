// Minimal test harness for n8n Code-node JS embedded in workflow.json.
//
// Why this exists: the JS inside Code nodes is where most of the workflow's
// real logic lives (mapping rows, grouping, parsing CSV). Hitting the full n8n
// runtime to test it requires real credentials and external services. This
// harness loads a Code node's `jsCode` string, wraps it in an AsyncFunction,
// and runs it with a fake n8n execution context — letting us assert on the
// returned items without n8n in the loop.
//
// Supported context:
//   $input.all() / $input.first() / $input.last() / $input.item   (runOnceForAllItems mode)
//   $json                                                          (runOnceForEachItem mode)
//   $('Other Node').all() / .first() / .last() / .item
//   this.helpers.getBinaryDataBuffer(itemIndex, propertyName)
//   this.helpers.prepareBinaryData(buffer, fileName, mimeType)
//
// What it does NOT support (yet):
//   $now / $today / $jmespath / $vars / etc. — add when a Code node needs them.

import { readFileSync } from "node:fs";

const AsyncFunction = (async function () {}).constructor;

export function loadCodeNode(workflowPath, nodeName) {
  const wf = JSON.parse(readFileSync(workflowPath, "utf8"));
  const node = wf.nodes.find(
    (n) => n.type === "n8n-nodes-base.code" && n.name === nodeName,
  );
  if (!node) {
    const available = wf.nodes
      .filter((n) => n.type === "n8n-nodes-base.code")
      .map((n) => `"${n.name}"`)
      .join(", ");
    throw new Error(
      `Code node "${nodeName}" not found in ${workflowPath}. Available code nodes: ${available || "(none)"}`,
    );
  }
  return node.parameters.jsCode;
}

export async function runCodeNode(
  jsCode,
  { inputItems = [], $json, nodeRefs = {}, helpers = {} } = {},
) {
  const fn = new AsyncFunction("$input", "$", "$json", jsCode);
  const $input = makeRef(inputItems);
  const $ = (name) => {
    if (!(name in nodeRefs)) {
      throw new Error(
        `$('${name}') referenced but not stubbed. Pass nodeRefs: { '${name}': [...items] } to runCodeNode.`,
      );
    }
    return makeRef(nodeRefs[name]);
  };
  // In runOnceForEachItem mode the code uses $json directly. If a caller didn't
  // pass it explicitly, fall back to the first input item's json — matches what
  // n8n does in runOnceForAllItems mode when $json is referenced.
  const resolved$json = $json !== undefined ? $json : $input.first()?.json;
  return await fn.call({ helpers }, $input, $, resolved$json);
}

function makeRef(list) {
  const items = list.map((it) =>
    it && typeof it === "object" && "json" in it ? it : { json: it },
  );
  return {
    all: () => items,
    first: () => items[0],
    last: () => items[items.length - 1],
    get item() {
      // n8n's `.item` is the paired item — approximated as the first item here.
      return items[0];
    },
  };
}

// Convenience builder for the `helpers` argument. Pass `binary: { propName: Buffer|string }`
// to stub `getBinaryDataBuffer` returns; override individual methods by spreading.
export function defaultHelpers({ binary = {} } = {}) {
  return {
    async getBinaryDataBuffer(_itemIndex, prop) {
      const stub = binary[prop];
      if (stub === undefined) {
        throw new Error(
          `getBinaryDataBuffer called for binary property "${prop}" but no stub was provided. Pass helpers: defaultHelpers({ binary: { ${prop}: Buffer.from(...) } }).`,
        );
      }
      return Buffer.isBuffer(stub) ? stub : Buffer.from(stub);
    },
    async prepareBinaryData(buffer, fileName, mimeType) {
      return {
        data: buffer.toString("base64"),
        fileName,
        mimeType,
        fileSize: buffer.length,
      };
    },
  };
}
