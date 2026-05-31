import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCodeNode, runCodeNode } from "../_scripts/test-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wf = join(here, "workflow.json");

const code = loadCodeNode(wf, "Group companies by owner");

// HubSpot v3 company shape: { id, properties: { ... } }. The mapper's
// `prop()` helper falls back to flat access too, but the realistic case
// from the n8n HubSpot node is the v3 shape.
function company({ id = "100", properties = {} } = {}) {
  return {
    id,
    properties: {
      name: "Acme",
      ramsisa_include: "true",
      ramsisa_tier: "A",
      ramsisa_territory: "north",
      ramsisa_latitude: 30.1,
      ramsisa_longitude: 31.2,
      hubspot_owner_id: "8001",
      ...properties,
    },
  };
}

describe("Group companies by owner", () => {
  it("groups two companies owned by the same rep into one item", async () => {
    const out = await runCodeNode(code, {
      inputItems: [company({ id: "100" }), company({ id: "101" })],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].json.owner_id, "8001");
    assert.equal(out[0].json.location_count, 2);
    assert.deepEqual(
      out[0].json.locations.map((l) => l.id),
      ["100", "101"],
    );
  });

  it("emits one item per distinct owner", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        company({ id: "100", properties: { hubspot_owner_id: "8001" } }),
        company({ id: "101", properties: { hubspot_owner_id: "8002" } }),
        company({ id: "102", properties: { hubspot_owner_id: "8001" } }),
      ],
    });
    assert.equal(out.length, 2);
    const a = out.find((o) => o.json.owner_id === "8001");
    const b = out.find((o) => o.json.owner_id === "8002");
    assert.equal(a.json.location_count, 2);
    assert.equal(b.json.location_count, 1);
  });

  it("silently drops companies with ramsisa_include falsy (not 'skipped')", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        company({ id: "100" }),
        company({ id: "101", properties: { ramsisa_include: "false" } }),
        company({ id: "102", properties: { ramsisa_include: "" } }),
      ],
    });
    assert.equal(out[0].json.location_count, 1);
    assert.equal(out[0].json.locations[0].id, "100");
    // skipped_count is for rows that opted in but failed validation —
    // ramsisa_include=false is a deliberate opt-out and is not counted.
    assert.equal(out[0].json.skipped_count, 0);
  });

  it("skips companies that have no HubSpot owner and counts them in skipped_count", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        company({ id: "100" }),
        company({ id: "101", properties: { hubspot_owner_id: "" } }),
      ],
    });
    assert.equal(out[0].json.location_count, 1);
    assert.equal(out[0].json.skipped_count, 1);
  });

  it("skips companies missing required ramsisa_* fields and counts them", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        company({ id: "100" }),
        company({ id: "101", properties: { ramsisa_tier: "" } }),
        company({ id: "102", properties: { ramsisa_latitude: NaN } }),
        company({
          id: "103",
          properties: { ramsisa_territory: "" },
        }),
      ],
    });
    assert.equal(out[0].json.location_count, 1);
    assert.equal(out[0].json.skipped_count, 3);
  });

  it("throws when no companies are eligible", async () => {
    await assert.rejects(
      runCodeNode(code, {
        inputItems: [
          company({ id: "100", properties: { ramsisa_include: "false" } }),
        ],
      }),
      /No HubSpot companies eligible/,
    );
  });

  it("accepts ramsisa_lat/ramsisa_lng property aliases", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        {
          id: "100",
          properties: {
            name: "Acme",
            ramsisa_include: "true",
            ramsisa_tier: "A",
            ramsisa_territory: "north",
            ramsisa_lat: 30.1,
            ramsisa_lng: 31.2,
            hubspot_owner_id: "8001",
          },
        },
      ],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].json.locations[0].latitude, 30.1);
    assert.equal(out[0].json.locations[0].longitude, 31.2);
  });

  it("treats 'true' / 'TRUE' / 'yes' / '1' / boolean true as ramsisa_include", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        company({ id: "1", properties: { ramsisa_include: "true" } }),
        company({ id: "2", properties: { ramsisa_include: "TRUE" } }),
        company({ id: "3", properties: { ramsisa_include: "yes" } }),
        company({ id: "4", properties: { ramsisa_include: "1" } }),
        company({ id: "5", properties: { ramsisa_include: true } }),
      ],
    });
    assert.equal(out[0].json.location_count, 5);
  });

  it("expands three-letter day aliases on ramsisa_available_days", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        company({
          id: "100",
          properties: { ramsisa_available_days: "sat,sun" },
        }),
      ],
    });
    assert.deepEqual(out[0].json.locations[0].available_days, [
      "saturday",
      "sunday",
    ]);
  });
});
