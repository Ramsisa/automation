# Ramsisa Automation

Integration packages and pre-built workflows for **Ramsisa Schedule**. Drop them into your stack as-is, or read them as a worked example for a proof-of-concept against the Ramsisa API.

## What is Ramsisa Schedule?

Ramsisa Schedule is a **tiered, territory-aware field-visit scheduler**. You hand it a list of locations — each with a `tier` (A/B/C), a `territory`, latitude/longitude, and an availability window — plus a target month and a rep. It returns a complete day-by-day route plan: which locations that rep visits, on which day, in what order, respecting the visit frequency that the tier dictates.

It is delivered as an HTTP API at <https://schedule.ramsisa.com/> (paths versioned under `/api/v1/`). The core surface:

| Endpoint                          | What it does                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `POST /schedules/generate/`       | Submit locations + month for one rep. Returns a `schedule_id` and runs async. |
| `GET  /schedules/{id}/`           | Poll status (`pending` → `running` → `completed` / `failed`).                 |
| `GET  /schedules/{id}/download/`  | Download the finished schedule as CSV.                                        |
| Webhook                           | If a `webhook_url` was provided at submission time, Ramsisa POSTs there on completion with a summary and an absolute `download_url`. |

Full reference: <https://schedule.ramsisa.com/docs/> (api-reference, integration-guide).

The engine is **vertical-neutral**. The same call shape serves:

- CPG/FMCG sales reps visiting retail accounts
- B2B field sales reps visiting customer sites
- Field-service techs visiting installations
- Auditors visiting branches
- Insurance adjusters visiting claim sites
- Medical reps visiting clinics
- Inspectors visiting properties
- Real-estate agents visiting listings

`tier` and `territory` just mean "how often does this location get visited" and "which sub-area of the rep's patch is this in" — the labels you give them are your business's.

## How this repo helps

Two ways to use what's here.

### 1. Productized integration — install and go

The packages below wrap the Ramsisa API as **native building blocks** inside no-code/low-code automation platforms. A non-engineer can wire Ramsisa into their existing stack without writing API code.

| Path                  | What it is                                                                                                          | Status                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `n8n-nodes-ramsisa/`  | n8n community node (npm package). Credentials + action operations (Generate / Generate-and-Wait / Get Status / Download). Source lives in [`Ramsisa/n8n-nodes-ramsisa`](https://github.com/Ramsisa/n8n-nodes-ramsisa) and is embedded here as a git submodule. | v0.1.6 published [↗](https://www.npmjs.com/package/n8n-nodes-ramsisa), passed n8n's automated verification review |
| `make-app-ramsisa/`   | Make custom app definition — same surface for Make's marketplace.                                                   | scaffolded            |
| `workflows/n8n/`      | Pre-built n8n workflows that depend on `n8n-nodes-ramsisa`. See [Workflows](#workflows) below; strategy in `workflows/PLAN.md`. | v1 set built |
| `workflows/make/`     | Pre-built Make scenarios that depend on `make-app-ramsisa`.                                                         | planned               |

### 2. Reference implementation — copy the patterns

If you're building your own integration — a CLI, a script, a different platform, a quick PoC to see whether Ramsisa fits your data — read these as **working examples** of the Ramsisa API in motion. You get answers to the questions that the OpenAPI spec alone doesn't:

- **Shape of a real payload** — what `locations`, `tier`, `territory`, `available_from/to` look like for an actual rep. The sample data in `workflows/n8n/sheets-ramsisa-gmail-loop/sample-data/` is a runnable example.
- **Sync vs. async** — `Generate Schedule (Wait for Completion)` in `n8n-nodes-ramsisa/nodes/Ramsisa/` shows the poll-until-terminal pattern. For the webhook-driven alternative, hand `webhook_url` off to n8n's built-in Webhook node — the completion payload (`schedule_id`, `status`, `download_url`) is enough to drive whatever comes next without a custom trigger.
- **One-rep-per-call shape** — Ramsisa generates one rep's schedule per request. The `sheets-ramsisa-gmail-loop` workflow is the minimal 1:1 mapping of that contract (one sheet of locations in, one CSV out, one email sent). Scaling to a team is orchestration on top — duplicate the workflow per rep, or wrap it with a parent flow that calls it via `Execute Workflow` for each rep.
- **Closing the loop into a CRM** — `ramsisa-to-hubspot-tasks` shows how to turn each visit in the returned CSV into a task on the matching Company.
- **API-version pinning** — every package builds URLs as `${baseUrl}/api/${apiVersion}/...`. Borrow the pattern; future major versions of the API land additively instead of breaking your code.

The fastest path to a PoC is in `dev/` — a throwaway containerized n8n with the Ramsisa node pre-loaded. Bring up the stack, import the workflows, point credentials at your Ramsisa instance, and you have a working end-to-end pipeline within an hour. See [`dev/README.md`](dev/README.md).

## Workflows

The v1 launch set under `workflows/n8n/`. Each ships with a sanitized `workflow.json`, a README that opens with `apiVersion` / `requires` front-matter, and a "Common use cases" section so one workflow can serve multiple verticals. Folder names describe the *shape* of the flow, never a vertical.

| Workflow                                                                       | What it does                                                                                                                                                                                                                                                          | Credentials                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [`sheets-ramsisa-gmail-loop`](workflows/n8n/sheets-ramsisa-gmail-loop)         | End-to-end single-rep demo. Pulls one rep's client locations from a Google Sheet, generates that rep's Ramsisa schedule synchronously (Generate Schedule + Wait for Completion), and emails the CSV to the rep as an attachment. Loop or duplicate for multi-rep coverage. | Ramsisa, Google Sheets, Gmail |
| [`ramsisa-to-slack`](workflows/n8n/ramsisa-to-slack)                           | Posts a one-line Slack notification every time a Ramsisa schedule completes or fails, with the schedule ID, month, summary counts, and CSV download link. Universal "ops channel" ping.                                                                                | Ramsisa, Slack               |
| [`hubspot-companies-to-ramsisa`](workflows/n8n/hubspot-companies-to-ramsisa)   | Monthly cron pulls HubSpot Companies flagged with `ramsisa_include` (plus tier / territory / lat / lng custom properties) and submits them to Ramsisa for next month's plan. No manual export.                                                                          | Ramsisa, HubSpot             |
| [`ramsisa-to-hubspot-tasks`](workflows/n8n/ramsisa-to-hubspot-tasks)           | Receives the completed schedule webhook and turns each visit into a HubSpot **Task** associated to the matching Company. Pairs with `hubspot-companies-to-ramsisa` to close the loop.                                                                                  | Ramsisa, HubSpot             |

Build helpers live in `workflows/n8n/_scripts/`: `sanitize.mjs` strips env-specific IDs from raw n8n exports, `validate.mjs` checks the front-matter contract and that referenced nodes exist.

## API version pinning

Every integration ties to a specific Ramsisa API version. Three layers:

1. **Credentials/connection** carries `apiVersion` (default `"v1"`). All HTTP paths are built as `${baseUrl}/api/${apiVersion}/...`. A future v2 of the API does not break existing installs.
2. **Package version** documents a compatibility matrix in its own README, e.g. `n8n-nodes-ramsisa 1.x → API v1`.
3. **Workflow files** declare in front-matter the API version and minimum package version they require. A smoke-test script (planned) validates these match before import.

## Why this exists

Most CRM/ERP/spreadsheet platforms have an existing integration in n8n and Make. A Ramsisa node in those ecosystems means every one of those integrations becomes a Ramsisa integration too — without us writing a 1:1 connector for each. And the same packages double as the most concrete documentation we can ship for the API: working code, real payloads, runnable end-to-end.
