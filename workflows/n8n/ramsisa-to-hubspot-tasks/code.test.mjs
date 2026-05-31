import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadCodeNode,
  runCodeNode,
  defaultHelpers,
} from "../_scripts/test-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wf = join(here, "workflow.json");

const code = loadCodeNode(wf, "Parse CSV per visit");

// Runs in runOnceForAllItems mode; reads the CSV via
// `this.helpers.getBinaryDataBuffer(0, 'data')`. Tests stub the binary buffer
// through defaultHelpers; the input item itself is irrelevant to the logic.

function runWithCsv(csv) {
  return runCodeNode(code, {
    inputItems: [{ json: {} }],
    helpers: defaultHelpers({ binary: { data: Buffer.from(csv, "utf8") } }),
  });
}

const sampleCsv =
  "date,order,location_id,location_name,territory,tier\r\n" +
  "2026-06-01,1,100,Acme,north,A\r\n" +
  "2026-06-01,2,101,Beta,north,B\r\n" +
  "2026-06-02,1,102,Gamma,south,A\r\n";

describe("Parse CSV per visit", () => {
  it("emits one item per CSV row with the expected shape", async () => {
    const out = await runWithCsv(sampleCsv);
    assert.equal(out.length, 3);
    const first = out[0].json;
    assert.equal(first.company_id, "100");
    assert.equal(first.date, "2026-06-01");
    assert.equal(first.order, "1");
    assert.equal(first.territory, "north");
    assert.equal(first.tier, "A");
    assert.equal(first.subject, "Ramsisa visit #1: Acme");
    assert.ok(typeof first.epoch_ms === "number" && first.epoch_ms > 0);
  });

  it("includes the order number in the subject when present", async () => {
    const out = await runWithCsv(sampleCsv);
    assert.equal(out[1].json.subject, "Ramsisa visit #2: Beta");
  });

  it("omits the order from the subject when the order column is blank", async () => {
    const csv =
      "date,order,location_id,location_name,territory,tier\r\n" +
      "2026-06-01,,100,Acme,north,A\r\n";
    const out = await runWithCsv(csv);
    assert.equal(out[0].json.subject, "Ramsisa visit: Acme");
    assert.equal(out[0].json.order, "");
  });

  it("falls back to location_id when location_name is blank", async () => {
    const csv =
      "date,order,location_id,location_name,territory,tier\r\n" +
      "2026-06-01,1,100,,north,A\r\n";
    const out = await runWithCsv(csv);
    assert.equal(out[0].json.subject, "Ramsisa visit #1: 100");
  });

  it("preserves the raw row keyed by header", async () => {
    const out = await runWithCsv(sampleCsv);
    assert.deepEqual(out[0].json.raw, {
      date: "2026-06-01",
      order: "1",
      location_id: "100",
      location_name: "Acme",
      territory: "north",
      tier: "A",
    });
  });

  it("skips rows missing either location_id or date", async () => {
    const csv =
      "date,order,location_id,location_name,territory,tier\r\n" +
      "2026-06-01,1,100,Acme,north,A\r\n" +
      ",2,101,Beta,north,B\r\n" +
      "2026-06-02,3,,Gamma,south,A\r\n";
    const out = await runWithCsv(csv);
    assert.equal(out.length, 1);
    assert.equal(out[0].json.company_id, "100");
  });

  it("returns [] when the CSV has only a header line", async () => {
    const out = await runWithCsv(
      "date,order,location_id,location_name,territory,tier\r\n",
    );
    assert.deepEqual(out, []);
  });

  it("throws when all rows are invalid (header present but no usable rows)", async () => {
    // All rows missing company_id → header is fine but no items emitted.
    const csv =
      "date,order,location_id,location_name,territory,tier\r\n" +
      "2026-06-01,1,,Acme,north,A\r\n";
    await assert.rejects(runWithCsv(csv), /had a header but no rows/);
  });

  it("throws when the CSV is missing a location_id column", async () => {
    await assert.rejects(
      runWithCsv(
        "date,order,location_name,territory,tier\r\n2026-06-01,1,Acme,north,A\r\n",
      ),
      /missing a `location_id` column/,
    );
  });

  it("throws when the CSV is missing a date column", async () => {
    await assert.rejects(
      runWithCsv(
        "order,location_id,location_name,territory,tier\r\n1,100,Acme,north,A\r\n",
      ),
      /missing a `date` column/,
    );
  });

  it("handles quoted CSV fields containing commas and escaped quotes", async () => {
    const csv =
      'date,order,location_id,location_name,territory,tier\r\n' +
      '2026-06-01,1,100,"Acme, Inc. \\"HQ\\"",north,A\r\n';
    const out = await runWithCsv(csv);
    // Note: the CSV literal above uses \\" inside a JS string, which the
    // parser sees as \"; the CSV-level escape (doubled quote "") is what
    // parseLine() handles. Validate via a payload that uses real "" escaping.
    const csvReal =
      'date,order,location_id,location_name,territory,tier\r\n' +
      '2026-06-01,1,100,"Acme, ""HQ""",north,A\r\n';
    const outReal = await runWithCsv(csvReal);
    assert.equal(outReal[0].json.raw.location_name, 'Acme, "HQ"');
    assert.equal(outReal[0].json.subject, 'Ramsisa visit #1: Acme, "HQ"');
  });
});
