---
apiVersion: v1
requires:
  n8n-nodes-ramsisa: ">=0.1.0"
  n8n: ">=1.20"
external_credentials:
  - ramsisaApi
  - hubspotApi
---

# Ramsisa → HubSpot Tasks

Turns each generated Ramsisa visit into a HubSpot **Task** associated to the
corresponding Company. Reps work the schedule directly out of HubSpot — no
spreadsheet handoff.

Pairs with [`hubspot-companies-to-ramsisa`](../hubspot-companies-to-ramsisa)
to close the loop: companies in → schedule → tasks back into the CRM.

## Common use cases

| Vertical                       | "Task" represents                                          |
| ------------------------------ | ---------------------------------------------------------- |
| Pharma rep → doctors           | A planned detail call at a clinic.                         |
| CPG/FMCG sales → retail stores | A merchandising visit at a store.                          |
| B2B field sales                | An onsite meeting at a customer account.                   |
| Field service → installations  | A service visit at a customer site.                        |
| Audit/compliance → branches    | A scheduled audit / spot check.                            |

## Required custom fields

None on the HubSpot side — Tasks are a standard HubSpot object.

The workflow assumes the Ramsisa `location_id` is the HubSpot Company
`hs_object_id`. That's the convention enforced by the companion
`hubspot-companies-to-ramsisa` workflow. If you feed Ramsisa from a different
source, make sure `ID` in your `locations[]` payload equals the HubSpot
Company id you want the task associated to.

The schedule CSV is consumed exactly as the Ramsisa engine emits it. The
columns are:

| Column          | Required by this workflow | Used for                                                          |
| --------------- | ------------------------- | ----------------------------------------------------------------- |
| `date`          | yes                       | Task due date (`YYYY-MM-DD`). Task is set to `09:00` local on that date — the engine doesn't emit a per-visit time. |
| `order`         | no                        | Position in the day's route. Surfaced in the task subject and body. |
| `location_id`   | yes                       | HubSpot Company association (`hs_object_id`).                     |
| `location_name` | no                        | Human-readable task subject; falls back to `location_id`.         |
| `territory`     | no                        | Shown in the task body for context.                               |
| `tier`          | no                        | Shown in the task body for context.                               |

## Setup steps

1. **Import** `workflow.json` into n8n.
2. **Bind credentials**:
   - `Ramsisa Trigger` → your `Ramsisa API` credential.
   - `HubSpot: Create task` → your `HubSpot API` private-app credential with
     scopes `crm.objects.companies.read` and `crm.objects.tasks.write`.
3. **Activate** the workflow. Copy the `Ramsisa Trigger` Production URL.
4. **Pass that URL** as the `webhook_url` on every `Ramsisa: Generate Schedule`
   call you want to mirror into HubSpot. The companion
   `hubspot-companies-to-ramsisa` workflow has a `Webhook URL` field on its
   Ramsisa node — paste it there.

Tasks are created via the HubSpot v3 Tasks API
(`POST /crm/v3/objects/tasks`) using the standard task-to-company
association (`associationTypeId: 192`). No HubSpot custom properties are
required.

The request batches at 5 tasks/second to stay well under HubSpot's daily +
burst rate limits.

## Sanitization note

`workflow.json` is run through `workflows/n8n/_scripts/sanitize.mjs` on every
commit. It is import-safe: no environment-specific IDs, webhook URLs, or
localhost references are present.
