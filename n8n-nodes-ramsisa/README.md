# n8n-nodes-ramsisa

An [n8n](https://n8n.io/) community node for the [Ramsisa](https://ramsisa.com/) field visit scheduling API.

Generate tiered, territory-aware field-visit schedules directly from your n8n workflows. Works for any team that visits the same set of locations on a recurring cadence — sales reps to retail accounts, field-service techs to customer sites, auditors to branches, medical reps to clinics, inspectors to properties. Pulls the location list from any source n8n already supports (Google Sheets, Airtable, HubSpot, Salesforce, Postgres, …), submits the generation request to Ramsisa, and receives the CSV back via webhook.

## Installation

In your n8n instance: **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-ramsisa
```

Requires n8n `>= 1.20` (uses `NodeConnectionType`).

## Credentials

Create a **Ramsisa API** credential with:

| Field       | Default                   | Description                                                                                          |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Base URL    | `https://api.ramsisa.com` | Root URL of your Ramsisa instance (no `/api` suffix).                                                |
| API Version | `v1`                      | API version this connection targets. Pinned so future major versions don't break existing workflows. |
| API Key     | _(required)_              | Bearer token from your Ramsisa organization admin.                                                   |

The credential test hits `GET {baseUrl}/api/{apiVersion}/health/` to validate connectivity.

## Nodes

### Ramsisa (action node)

| Operation                               | What it does                                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generate Schedule                       | `POST /schedules/generate/` — submits locations + month, returns `schedule_id` and `status`. Async; pair with the Ramsisa Trigger to react to completion. |
| Generate Schedule (Wait for Completion) | `POST /schedules/generate/` then polls `GET /schedules/{id}/` until terminal. Optionally downloads the CSV. Synchronous — no webhook trigger needed.      |
| Get Schedule Status                     | `GET /schedules/{id}/` — poll status.                                                                                                                     |
| Download Schedule CSV                   | `GET /schedules/{id}/download/` — fetch the completed CSV as a binary attachment.                                                                         |

### Ramsisa Trigger (webhook trigger)

A static webhook receiver. Copy the trigger's **Production URL** into the `Webhook URL` field of any **Generate Schedule** action. When Ramsisa POSTs the completion event, this node fires with the payload.

Options:

- **Enrich With Full Status** — after receiving the webhook, automatically fetch the full status (summary, timestamps, etc.). Requires credentials.
- **Download CSV Attachment** — automatically download the CSV as a binary attachment when status is `completed`. Requires credentials.

The trigger relies on the Ramsisa server emitting an absolute `download_url` (configured server-side via `SCHEDULE_PUBLIC_BASE_URL`).

## Recommended workflow shape

```
[Google Sheets: locations] → [Ramsisa: Generate Schedule (webhook_url = trigger URL)]

                                    ↓ (Ramsisa POSTs here when done)

[Ramsisa Trigger] → [Send Email] / [HubSpot: Create Tasks] / [Slack: Notify]
```

## Compatibility matrix

| `n8n-nodes-ramsisa` version | Ramsisa API version | n8n version |
| --------------------------- | ------------------- | ----------- |
| `0.1.x`                     | `v1`                | `>= 1.20`   |

## Local development

```bash
cd automation/n8n-nodes-ramsisa
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
