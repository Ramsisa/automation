# n8n-nodes-ramsisa

An [n8n](https://n8n.io/) community node for the [Ramsisa](https://ramsisa.com/) field visit scheduling API.

Generate tiered, territory-aware field-visit schedules directly from your n8n workflows. Works for any team that visits the same set of locations on a recurring cadence — sales reps to retail accounts, field-service techs to customer sites, auditors to branches, medical reps to clinics, inspectors to properties. Pulls the location list from any source n8n already supports (Google Sheets, Airtable, HubSpot, Salesforce, Postgres, …), submits the generation request to Ramsisa, and returns the schedule — either synchronously (the `Wait for Completion` operation polls and downloads the CSV in one step) or asynchronously by handing the completion event off to n8n's built-in `Webhook` node.

## Installation

In your n8n instance: **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-ramsisa
```

Requires n8n `>= 1.123` (or 2.x) on Node `>= 22.16`.

## Credentials

Create a **Ramsisa API** credential with:

| Field       | Default                        | Description                                                                                          |
| ----------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Base URL    | `https://schedule.ramsisa.com` | Root URL of your Ramsisa instance (no `/api` suffix).                                                |
| API Version | `v1`                           | API version this connection targets. Pinned so future major versions don't break existing workflows. |
| API Key     | _(required)_                   | Bearer token from your Ramsisa organization admin.                                                   |

The credential test hits `GET {baseUrl}/api/{apiVersion}/health/` to validate connectivity.

## Node

### Ramsisa (action node)

| Operation                               | What it does                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generate Schedule                       | `POST /schedules/generate/` — submits locations + month, returns `schedule_id` and `status`. Async; provide a `webhook_url` if you want to react to completion in n8n.    |
| Generate Schedule (Wait for Completion) | `POST /schedules/generate/` then polls `GET /schedules/{id}/` until terminal. Optionally downloads the CSV. Synchronous — no webhook wiring needed.                       |
| Get Schedule Status                     | `GET /schedules/{id}/` — poll status.                                                                                                                                     |
| Download Schedule CSV                   | `GET /schedules/{id}/download/` — fetch the completed CSV as a binary attachment.                                                                                         |

## Recommended workflow shape

For most flows, the synchronous **Generate Schedule (Wait for Completion)** operation is the simplest path — one node, one CSV out:

```
[Google Sheets: locations] → [Ramsisa: Generate Schedule (Wait for Completion)] → [Send Email] / [Slack] / [HubSpot]
```

For long-running schedules where you don't want to hold an n8n execution open, hand the completion event off to n8n's built-in **Webhook** node:

```
[Google Sheets: locations] → [Ramsisa: Generate Schedule (webhook_url = n8n Webhook URL)]

                                    ↓ (Ramsisa POSTs here when done)

[Webhook (n8n built-in, POST)] → [Ramsisa: Get Schedule Status] → [Ramsisa: Download Schedule CSV] → [Send Email] / [Slack] / [HubSpot]
```

The async path relies on the Ramsisa server emitting an absolute `download_url` (configured server-side via `SCHEDULE_PUBLIC_BASE_URL`). The completion payload includes `schedule_id`, `status`, and `download_url` — feed any of these into the rest of your workflow directly.

## Compatibility matrix

| `n8n-nodes-ramsisa` version | Ramsisa API version | n8n version       | Node version |
| --------------------------- | ------------------- | ----------------- | ------------ |
| `0.1.x`                     | `v1`                | `>= 1.123` or 2.x | `>= 22.16`   |

## Local development

```bash
cd n8n-nodes-ramsisa
npm install
npm run build
```

Link into a local n8n install for testing:

```bash
npm link
cd ~/.n8n/custom    # or wherever your n8n custom-nodes folder is
npm link n8n-nodes-ramsisa
```

Then restart n8n.

## License

MIT
