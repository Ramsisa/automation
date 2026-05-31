---
apiVersion: v1
requires:
  n8n-nodes-ramsisa: ">=0.1.0"
  n8n: ">=1.20"
external_credentials:
  - ramsisaApi
  - hubspotApi
---

# HubSpot Companies → Ramsisa

On the first of every month, pull all HubSpot companies flagged for
scheduling, **group them by HubSpot owner (the rep)**, and submit one
Ramsisa `/schedules/generate/` call per rep. No manual export, no rep
gets lumped together.

Ramsisa's API is per-rep: one call produces one rep's schedule. This
workflow respects that — if 12 reps have eligible companies, it makes 12
generate calls, each scoped to the companies owned by that rep.

## Common use cases

| Vertical                       | "Company" in HubSpot is | Tier means            | Territory means (sub-area within one rep) |
| ------------------------------ | ----------------------- | --------------------- | ----------------------------------------- |
| Pharma rep → doctors           | Clinics                 | Prescription tier     | Cluster within the rep's patch            |
| CPG/FMCG sales → retail stores | Stores / chains         | Sales volume          | Cluster within the sales region           |
| B2B field sales                | Customer accounts       | ARR / contract tier   | Sub-region of the AE patch                |
| Field service → installations  | Customer sites          | Service contract tier | Day-route zone                            |
| Audit/compliance → branches    | Branches                | Risk class            | Cluster within auditor district           |

`territory` is **not** how reps are partitioned — that's the HubSpot owner.
It's the geographic sub-grouping Ramsisa uses to keep each day-route tight
inside one rep's coverage. A single rep typically covers several territories.

## Required custom fields

Add these custom properties on the HubSpot **Company** object before importing
the workflow. Names are taken literally — change them in HubSpot, change them
in the `Group companies by owner` Code node to match.

| Property                  | Type             | Required | Purpose                                                                                                                       |
| ------------------------- | ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ramsisa_include`         | single checkbox  | yes      | Only companies with this checked are scheduled.                                                                               |
| `ramsisa_tier`            | dropdown A/B/C   | yes      | Visit frequency target.                                                                                                       |
| `ramsisa_territory`       | single-line text | yes      | Sub-area within one rep's coverage. Drives day-route grouping inside that rep's schedule.                                     |
| `ramsisa_latitude`        | number           | yes      | Decimal degrees. `ramsisa_lat` is accepted as an alias.                                                                       |
| `ramsisa_longitude`       | number           | yes      | Decimal degrees. `ramsisa_lng` is accepted as an alias.                                                                       |
| `ramsisa_available_from`  | single-line text | no       | `HH:MM` 24h.                                                                                                                  |
| `ramsisa_available_to`    | single-line text | no       | `HH:MM` 24h.                                                                                                                  |
| `ramsisa_available_days`  | single-line text | no       | Lowercase weekday names separated by comma, semicolon, whitespace, or pipe (`saturday,sunday,monday` or `saturday\|sunday\|monday`). Three-letter aliases are auto-expanded. |

In addition, each company must have a **HubSpot owner** set — that's the
standard built-in `hubspot_owner_id` field, not a custom property. The
workflow groups companies by this field to decide which rep gets which
schedule. Companies flagged for scheduling but with no owner are skipped
(reason logged in the `skipped` array).

The HubSpot company `id` (`hs_object_id`) is used as the Ramsisa location
`ID`, so the schedule output can be joined back to HubSpot for the
downstream task workflow (`ramsisa-to-hubspot-tasks`).

## Setup steps

1. **Create the custom properties** above in HubSpot Settings → Properties → Company.
2. **Assign HubSpot owners** to every company you want scheduled. Each company's
   owner is the rep who will visit it.
3. **Tag the companies** that should be scheduled (`ramsisa_include = true`)
   and fill the required fields. The workflow refuses to submit rows with
   missing tier / territory / latitude / longitude.
4. **Import** `workflow.json` into n8n.
5. **Bind credentials**:
   - `HubSpot: List companies` → a `HubSpot API` private-app credential with
     `crm.objects.companies.read` scope.
   - `Ramsisa: Generate Schedule` → your `Ramsisa API` credential.
6. **(Optional)** If you want completion notifications or per-rep emails, pair
   this with `ramsisa-to-slack` or `ramsisa-to-hubspot-tasks` and copy that
   workflow's Ramsisa Trigger Production URL into this node's `Webhook URL`
   field. Every per-rep generate call uses the same webhook URL — Ramsisa
   POSTs back N times, once per completed schedule, each with its own
   `schedule_id`.
7. **Activate** the workflow. It runs at 09:00 on the 1st of every month and
   targets the **following** calendar month (`now + 1 month`).

To run once on demand, swap the `Schedule Trigger` for a `Manual Trigger` —
nothing else changes.

### What "per-rep" means in the execution log

After running, the n8n execution view shows `Ramsisa: Generate Schedule`
firing N times (once per rep with eligible companies). Each call's input
item is `{ owner_id, locations, location_count, skipped_count }`; its
output is `{ schedule_id, status }`. Look here to confirm every rep got a
schedule submitted.

## Sanitization note

`workflow.json` is run through `workflows/n8n/_scripts/sanitize.mjs` on every
commit. It is import-safe: no environment-specific IDs, webhook URLs, or
localhost references are present.
