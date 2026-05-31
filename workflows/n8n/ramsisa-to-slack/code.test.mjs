import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadCodeNode, runCodeNode } from "../_scripts/test-harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wf = join(here, "workflow.json");

const code = loadCodeNode(wf, "Format message");

// Format message runs in runOnceForEachItem mode — the code references $json
// directly (the current webhook payload from Ramsisa Trigger), so each test
// passes one $json object and asserts on the single returned item.

describe("Format message", () => {
  it("renders a completed status with absolute download URL as a Slack link", async () => {
    const out = await runCodeNode(code, {
      $json: {
        schedule_id: "sch_123",
        status: "completed",
        download_url: "https://schedule.ramsisa.com/api/v1/schedules/sch_123/download/",
        summary: { total_visits: 42, total_days: 12 },
      },
    });
    assert.equal(out.json.status, "completed");
    assert.match(out.json.text, /:white_check_mark:/);
    assert.match(out.json.text, /\*Ramsisa schedule completed\*/);
    assert.match(out.json.text, /`sch_123`/);
    assert.match(out.json.text, /42 visits · 12 days/);
    assert.match(
      out.json.text,
      /<https:\/\/schedule\.ramsisa\.com\/.*\|Download CSV>/,
    );
  });

  it("falls back to a plain path note when download_url is relative", async () => {
    const out = await runCodeNode(code, {
      $json: {
        schedule_id: "sch_123",
        status: "completed",
        download_url: "/api/v1/schedules/sch_123/download/",
      },
    });
    assert.doesNotMatch(out.json.text, /<.*\|Download CSV>/);
    assert.match(out.json.text, /SCHEDULE_PUBLIC_BASE_URL/);
    assert.match(out.json.text, /\/api\/v1\/schedules\/sch_123\/download\//);
  });

  it("renders a failed status with the error message", async () => {
    const out = await runCodeNode(code, {
      $json: {
        schedule_id: "sch_456",
        status: "failed",
        error: "Solver timed out after 30s",
      },
    });
    assert.equal(out.json.status, "failed");
    assert.match(out.json.text, /:x:/);
    assert.match(out.json.text, /\*Ramsisa schedule failed\*/);
    assert.match(out.json.text, /\*Error:\* Solver timed out after 30s/);
  });

  it("omits the summary line when no summary is present", async () => {
    const out = await runCodeNode(code, {
      $json: { schedule_id: "sch_x", status: "completed" },
    });
    assert.doesNotMatch(out.json.text, /Summary:/);
  });

  it("renders a partial summary (visits only) without dropping the line", async () => {
    const out = await runCodeNode(code, {
      $json: {
        schedule_id: "sch_x",
        status: "completed",
        summary: { total_visits: 7 },
      },
    });
    assert.match(out.json.text, /\*Summary:\* 7 visits$/m);
  });

  it("uses the hourglass icon and 'unknown' label for an unset status", async () => {
    const out = await runCodeNode(code, {
      $json: { schedule_id: "sch_x" },
    });
    assert.equal(out.json.status, "unknown");
    assert.match(out.json.text, /:hourglass:/);
    assert.match(out.json.text, /Ramsisa schedule unknown/);
  });

  it("renders an em-dash when schedule_id is missing", async () => {
    const out = await runCodeNode(code, {
      $json: { status: "completed" },
    });
    assert.match(out.json.text, /\*Schedule ID:\* `—`/);
  });

  it("does not emit a download line for a failed status even if download_url is set", async () => {
    const out = await runCodeNode(code, {
      $json: {
        schedule_id: "sch_x",
        status: "failed",
        download_url: "https://example.com/x.csv",
        error: "boom",
      },
    });
    assert.doesNotMatch(out.json.text, /Download CSV/);
    assert.doesNotMatch(out.json.text, /SCHEDULE_PUBLIC_BASE_URL/);
  });
});
