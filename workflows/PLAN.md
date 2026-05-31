# Ramsisa Workflows — Plan

Strategy doc for the pre-built automation workflows that sit on top of the
`n8n-nodes-ramsisa` community node and the upcoming `make-app-ramsisa` app.

## Purpose

Each workflow is **a sellable, demoable asset** — a "Ramsisa + X" landing page
in code form. The bar for a workflow to ship: a non-engineer can install it,
point it at their data, and have a working schedule pipeline within an hour.

## Positioning (vertical-neutral)

Ramsisa is a **tiered, territory-aware, recurring field-visit scheduler**. The
API takes `locations` with `tier (A/B/C)`, `territory`, `latitude/longitude`,
and `available_from/to`. Each `/schedules/generate/` call produces **one rep's**
schedule from that rep's location list — multi-rep coverage is orchestration
(N calls, one per rep). Nothing about the engine is pharma-specific. Every
workflow's README treats the system as the generic scheduler it is, and lists
the verticals it serves under a **"Common use cases"** section — so one
`workflow.json` can be the hub page for several vertical landing pages.

`territory` is **not** a different rep. It's the geographic sub-grouping
Ramsisa uses to keep each day-route tight within one rep's coverage. A rep
typically covers several territories, visited on different days.

Reference verticals (non-exhaustive):

| Vertical                      | "Location" is  | Tier means            | Territory means (sub-area within one rep) |
| ----------------------------- | -------------- | --------------------- | ----------------------------------------- |
| Pharma rep → doctors          | Clinics        | Prescription tier     | Cluster within the rep's patch            |
| CPG/FMCG sales → retail       | Stores         | Sales volume          | Cluster within the sales region           |
| B2B field sales               | Customer sites | ARR / contract tier   | Sub-region of the AE patch                |
| Field service → installations | Customer sites | Service contract tier | Day-route zone                            |
| Audit/compliance → branches   | Branches       | Risk class            | Cluster within auditor district           |
| Insurance adjusters           | Claim sites    | Claim value / urgency | Cluster within adjuster region            |
| Telecom field engineers       | Cell sites     | Criticality           | Cluster within maintenance area           |
| Building inspectors           | Properties     | Risk class            | Cluster within inspector district         |
| Real estate agents            | Listings       | Listing priority      | Neighborhood within the market area       |

## Distribution

Two surfaces, repo is source of truth:

1. **This repo** (`automation/workflows/`) — canonical `workflow.json` files,
   READMEs, sanitization + validation scripts. Pinned to API versions.
2. **n8n.io template gallery** (https://n8n.io/workflows) — each finished
   workflow is published as an official template with a permanent SEO
   landing page plus a one-click install link. Repo `workflow.json` is the
   source; gallery is the marketing surface.

Publishing flow per workflow:

1. Build + sanitize in repo.
2. Pass `validate.mjs`.
3. Submit to gallery with the README copy as the listing body.
4. Gallery URL recorded in the workflow's README as the canonical install link.

## Folder structure

```
automation/workflows/
├── PLAN.md                                  # this file
├── README.md                                # catalog (built later)
├── n8n/
│   ├── <workflow-slug>/
│   │   ├── workflow.json                    # sanitized n8n export
│   │   ├── README.md                        # front-matter + setup + verticals
│   │   └── sample-data/                     # where applicable
│   └── _scripts/
│       ├── sanitize.mjs                     # strip env-specific IDs
│       └── validate.mjs                     # front-matter + node-existence checks
└── make/                                    # parallel structure, future
```

Naming convention: folder names describe the **shape** of the flow, never the
vertical (`hubspot-companies-to-ramsisa`, never `hubspot-doctors-to-ramsisa`).

## Per-workflow contract

Every `<workflow-slug>/README.md` opens with this front-matter:

```yaml
---
apiVersion: v1
requires:
  n8n-nodes-ramsisa: ">=0.1.0"
  n8n: ">=1.20"
external_credentials:
  - hubspotApi
  - ramsisaApi
gallery_url: https://n8n.io/workflows/<id>-ramsisa-...
---
```

`validate.mjs` enforces this format.

Required README sections, in order:

1. **Title + one-sentence pitch** — vertical-neutral.
2. **Common use cases** — 3–5 verticals this workflow serves, each with a one-line mapping ("Companies = clinics; tier = prescription tier; territory = day-route sub-area within one rep").
3. **Required custom fields** — what the source system needs to expose (e.g. HubSpot custom properties, Sheet columns).
4. **Setup steps** — credentials, env vars, import order.
5. **Sanitization note** — confirms the JSON has been run through `sanitize.mjs`.

## Workflow inventory

**Input side** (pull locations into Ramsisa):

| #   | Slug                             | Notes                                         |
| --- | -------------------------------- | --------------------------------------------- |
| 1   | `google-sheets-to-ramsisa`       | Universal entry; covers any team with a sheet |
| 2   | `airtable-to-ramsisa`            | More structured users                         |
| 3   | `hubspot-companies-to-ramsisa`   | CRM money flow                                |
| 4   | `salesforce-accounts-to-ramsisa` | Enterprise equivalent                         |
| 5   | `postgres-to-ramsisa`            | Teams with their own DB                       |

**Output side** (distribute the completed schedule):

| #   | Slug                           | Notes                                      |
| --- | ------------------------------ | ------------------------------------------ |
| 6   | `ramsisa-to-gmail-per-rep`     | Per-rep CSV slice via email                |
| 7   | `ramsisa-to-slack`             | Internal notification                      |
| 8   | `ramsisa-to-google-calendar`   | One event per visit on each rep's calendar |
| 9   | `ramsisa-to-hubspot-tasks`     | Tasks back into the CRM                    |
| 10  | `ramsisa-to-salesforce-events` | Events back into Salesforce                |
| 11  | `ramsisa-to-drive-archive`     | Long-term CSV archive                      |

**End-to-end loops** (combined input + output, the demo killers):

| #   | Slug                        | Notes                               |
| --- | --------------------------- | ----------------------------------- |
| 12  | `sheets-ramsisa-gmail-loop` | The single demo-video workflow      |
| 13  | `hubspot-full-loop`         | Companies in → schedule → tasks out |
| 14  | `salesforce-full-loop`      | Salesforce equivalent               |

**Rescheduling / Period 2**:

| #   | Slug                              | Notes                   |
| --- | --------------------------------- | ----------------------- |
| 15  | `period2-reschedule-from-hubspot` | Closes the monthly loop |

## v1 launch set (chosen)

Build these first, in this order:

1. **`sheets-ramsisa-gmail-loop`** (#12) — Sheets locations → Ramsisa → Gmail per-rep CSV. The single all-in-one demo video. Ships with sample sheet data.
2. **`ramsisa-to-slack`** (#7) — Quick universal win. Ships in a few hours after the demo loop.
3. **`hubspot-companies-to-ramsisa`** (#3) — Half of the CRM money loop.
4. **`ramsisa-to-hubspot-tasks`** (#9) — The other half. Together they cover the highest-value buyer segments (pharma, CPG, B2B sales, audit).

v2 candidates (in priority order): Airtable input, Salesforce full loop, Period 2 reconciliation, Google Calendar output, S3/Drive archive.

## Sanitization + validation

Two scripts in `automation/workflows/n8n/_scripts/`. Both run as a pre-commit
hook AND a CI step.

### `sanitize.mjs`

Runs on every `workflow.json` before commit. Strips:

- `credentials.id` (keeps `credentials.name`) — n8n re-binds on import
- `versionId`, `meta`, `triggerCount`, `webhookId` — environment-specific noise
- Hard-coded webhook URLs in HTTP nodes — replaced with `={{$env.RAMSISA_WEBHOOK_URL}}` or similar
- Any base URLs that point at a developer's localhost
- Output: canonical, environment-free JSON ready for import on any n8n instance

### `validate.mjs`

Runs in CI on every workflow folder:

1. Parse front-matter from `README.md` (`gray-matter` or similar)
2. Load `workflow.json`, walk node list
3. **Assert** every `ramsisa*` node type exists in the current `n8n-nodes-ramsisa` build (`Ramsisa`, `RamsisaTrigger`)
4. **Assert** front-matter `apiVersion` is in the credentials' `apiVersion` options array (currently `["v1"]`)
5. **Assert** front-matter `requires.n8n-nodes-ramsisa` semver is satisfiable by the current `n8n-nodes-ramsisa/package.json` version
6. **Assert** all required README sections exist (Title, Common use cases, Required custom fields, Setup steps)

The validator is what makes the API-version-pinning promise real instead of aspirational.

## API version pinning — three layers

Repeated from `automation/README.md` for completeness:

1. **Credentials** carry `apiVersion` (default `"v1"`); URLs built as `${baseUrl}/api/${apiVersion}/...`.
2. **Package version** documents a compatibility matrix in its own README (`n8n-nodes-ramsisa 0.1.x → API v1`).
3. **Workflow files** declare in front-matter `apiVersion` and `requires.n8n-nodes-ramsisa`. `validate.mjs` enforces.

A future API v2 ships as an additive `apiVersion` option on the credentials, a new major of `n8n-nodes-ramsisa`, and a new generation of workflows. Existing installs keep working without intervention.

## Open questions / future

- **Workflow versioning.** When a workflow needs a behavior change after publish, do we bump the gallery listing in place or publish v2 as a separate listing? Probably in-place for additive changes, new listing for breaking changes — TBD when we hit the first one.
- **Localization.** Gallery listings can be EN-only at launch; revisit when there's evidence of demand for translated READMEs.
- **Make app workflows.** Once `make-app-ramsisa/` ships, mirror the priority order under `automation/workflows/make/`. Same shape, same versioning, same sanitization concerns.
- **CI integration.** The `validate.mjs` script should run on every PR that touches `automation/workflows/`. Hook into the existing GitHub Actions workflow once it exists for the automation/ subtree.
