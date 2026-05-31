---
apiVersion: v1
requires:
  n8n-nodes-ramsisa: ">=0.1.0"
  n8n: ">=1.20"
external_credentials:
  - ramsisaApi
  - googleSheetsOAuth2Api
  - gmailOAuth2
---

# Sheets → Ramsisa → Gmail (single rep)

A complete monthly loop for **one rep**: a Google Sheet of that rep's client
locations is sent to Ramsisa, which returns the rep's optimized visit schedule
as a CSV. The CSV is emailed straight to the rep as an attachment. No code on
your side — bind three credentials and run.

Ramsisa's `/schedules/generate/` endpoint is per-rep by design: each call
produces one rep's schedule. So this workflow is a 1:1 mapping of that API
call — one sheet in, one CSV out, one email sent. To cover multiple reps,
duplicate the workflow per rep (each with its own sheet), or invoke this one
in a loop from a parent workflow.

## Common use cases

This workflow is shape-agnostic. The same flow serves any team where a single
field worker visits a recurring set of places:

| Vertical                       | "Location" is  | Tier means            | Territory means          |
| ------------------------------ | -------------- | --------------------- | ------------------------ |
| Pharma rep → doctors           | Clinics        | Prescription tier     | Sub-area of the rep      |
| CPG/FMCG sales → retail stores | Stores         | Sales volume          | Cluster within the patch |
| B2B field sales                | Customer sites | ARR / contract tier   | Sub-region of the patch  |
| Field service → installations  | Customer sites | Service contract tier | Day-route zone           |
| Audit/compliance → branches    | Branches       | Risk class            | Cluster within district  |

`territory` is **not** a different rep — it's the geographic sub-grouping
Ramsisa uses to keep each day-route tight. One rep, many territories,
visited on different days.

## Required custom fields

Your Google Sheet needs **one tab** of locations. Identify the rep separately
in the workflow's `Config` node (see Setup step 4).

### Locations tab — one row per place to visit

Column names match the Ramsisa API verbatim
([API reference](https://schedule.ramsisa.com/docs/api-reference/)). The
mapper also accepts `ID`, `latitude`, `longitude` as friendly aliases.

| Column           | Required | Notes                                                                                                                      |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`             | yes      | Stable unique identifier (string). Used to join back on Period 2.                                                          |
| `name`           | yes      | Location name; surfaced in the output CSV.                                                                                 |
| `tier`           | yes      | `A`, `B`, or `C`. Drives monthly visit target.                                                                             |
| `territory`      | yes      | Free-form string. Used by the engine to group nearby locations into the same day-route.                                    |
| `lat`            | yes      | Decimal degrees.                                                                                                           |
| `lng`            | yes      | Decimal degrees.                                                                                                           |
| `available_from` | no       | `HH:MM` 24h, e.g. `09:00`. Defaults to `09:00` on the engine.                                                              |
| `available_to`   | no       | `HH:MM` 24h, e.g. `17:00`. Defaults to `17:00` on the engine.                                                              |
| `available_days` | no       | Comma-separated lowercase weekday names (`saturday,sunday,monday`). Three-letter aliases (`sat,sun,mon`) are auto-expanded. |

## Setup steps

1. **Import** `workflow.json` into n8n (`Workflows → Import from File`).
2. **Bind credentials**:
   - `Ramsisa: Generate Schedule` → your `Ramsisa API` credential.
   - `Sheets: Locations` → a `Google Sheets OAuth2` credential.
   - `Gmail: Send` → a `Gmail OAuth2` credential.
3. **Point `Sheets: Locations`** at your spreadsheet (replace the placeholder
   document ID and tab name with your real values).
4. **Edit `Config`** to set the rep's email (and name, optional) — these drive
   the recipient and the email greeting:
   - `rep_email` — required.
   - `rep_name` — optional; falls back to "there".
   - `month` — defaults to next month, edit if you want a different target.
5. **Save and run** the `Manual Trigger`. The `Generate Schedule (Wait for
   Completion)` operation submits the job, polls until it's done (default: 5s
   interval, 10-minute timeout), downloads the CSV, and emails it to the rep —
   all in one synchronous run. No webhook URL to wire up.

To run monthly, swap the `Manual Trigger` for a `Schedule Trigger` set to your
preferred cadence (e.g. 1st of every month at 09:00 in your timezone).

### Covering multiple reps

This workflow is single-rep on purpose — it matches Ramsisa's per-rep API
shape. To cover a team:

- **N copies of this workflow**, each pointing at a different rep's sheet
  (cleanest when each rep owns their own client list); or
- **One parent workflow** that iterates over a list of reps and calls this
  one via `Execute Workflow` per rep (cleanest when you want a single place to
  trigger "send everyone their schedule").

### When to switch to the webhook pattern instead

The synchronous shape blocks the entire workflow execution until Ramsisa
finishes. That's fine for most schedules, but if a single rep's job
routinely takes longer than n8n's per-execution timeout (or you don't want
to hold an execution open), use the async variant: change the operation
back to **Generate Schedule**, add a **Ramsisa Trigger** node as the entry
point of a second workflow, and pass the trigger's Production URL via the
`Webhook URL` field.

## Sanitization note

`workflow.json` is run through `workflows/n8n/_scripts/sanitize.mjs` on every
commit. It is import-safe: no environment-specific IDs, webhook URLs, or
localhost references are present.
