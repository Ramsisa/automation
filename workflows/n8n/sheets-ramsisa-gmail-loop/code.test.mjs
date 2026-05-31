import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCodeNode, runCodeNode } from "../_scripts/test-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wf = join(here, "workflow.json");

describe("Build locations payload", () => {
  const code = loadCodeNode(wf, "Build locations payload");

  it("maps canonical column names into a Ramsisa locations payload", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        {
          id: "A1",
          name: "Acme",
          tier: "A",
          territory: "north",
          latitude: 30.1,
          longitude: 31.2,
        },
      ],
    });
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].json.locations, [
      {
        id: "A1",
        name: "Acme",
        tier: "A",
        territory: "north",
        latitude: 30.1,
        longitude: 31.2,
      },
    ]);
  });

  it("accepts ID/lat/lng aliases and uppercases tier", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        {
          ID: "A1",
          name: "Acme",
          tier: "a",
          territory: "north",
          lat: 30.1,
          lng: 31.2,
        },
      ],
    });
    const loc = out[0].json.locations[0];
    assert.equal(loc.id, "A1");
    assert.equal(loc.tier, "A");
    assert.equal(loc.latitude, 30.1);
    assert.equal(loc.longitude, 31.2);
  });

  it("expands three-letter day aliases", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        {
          id: "A1",
          name: "Acme",
          tier: "A",
          territory: "north",
          latitude: 30,
          longitude: 31,
          available_days: "sat,sun,mon",
        },
      ],
    });
    assert.deepEqual(out[0].json.locations[0].available_days, [
      "saturday",
      "sunday",
      "monday",
    ]);
  });

  it("accepts pipe-separated days", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        {
          id: "A1",
          name: "Acme",
          tier: "A",
          territory: "north",
          latitude: 30,
          longitude: 31,
          available_days: "tue|wed|thu",
        },
      ],
    });
    assert.deepEqual(out[0].json.locations[0].available_days, [
      "tuesday",
      "wednesday",
      "thursday",
    ]);
  });

  it("passes available_from/to through unchanged", async () => {
    const out = await runCodeNode(code, {
      inputItems: [
        {
          id: "A1",
          name: "Acme",
          tier: "A",
          territory: "north",
          latitude: 30,
          longitude: 31,
          available_from: "09:00",
          available_to: "17:00",
        },
      ],
    });
    assert.equal(out[0].json.locations[0].available_from, "09:00");
    assert.equal(out[0].json.locations[0].available_to, "17:00");
  });

  it("throws when any row is missing tier", async () => {
    await assert.rejects(
      runCodeNode(code, {
        inputItems: [
          {
            id: "A1",
            name: "Acme",
            tier: "",
            territory: "north",
            latitude: 30,
            longitude: 31,
          },
        ],
      }),
      /missing id\/tier\/latitude\/longitude/,
    );
  });

  it("throws when latitude is non-numeric", async () => {
    await assert.rejects(
      runCodeNode(code, {
        inputItems: [
          {
            id: "A1",
            name: "Acme",
            tier: "A",
            territory: "north",
            latitude: "oops",
            longitude: 31,
          },
        ],
      }),
      /missing id\/tier\/latitude\/longitude/,
    );
  });
});
