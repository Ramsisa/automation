---
apiVersion: v1
requires:
  n8n-nodes-ramsisa: ">=0.1.0"
  n8n: ">=1.20"
external_credentials:
  - ramsisaApi
  - slackApi
---

# Ramsisa → Slack

Posts a one-line Slack notification every time a Ramsisa schedule completes
or fails. Includes the schedule ID, month, summary counts (if available),
and a CSV download link.

## Common use cases

| Vertical                       | Why a Slack ping is useful                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| Pharma rep → doctors           | District manager gets nudged when next month's plan is ready.      |
| CPG/FMCG sales → retail stores | Sales ops channel sees each new schedule + can grab the CSV.       |
| Field service → installations  | Dispatcher channel gets a heads-up to start route review.          |
| Audit/compliance → branches    | Audit lead is notified when the quarter's plan is generated.       |
| Real estate agents             | Brokerage ops channel sees the new touring schedule.               |

Replace the description above with what's specific to your team — the
mechanics (webhook → message) are identical.

## Required custom fields

None on your side. This workflow only consumes Ramsisa's own webhook payload.

If the enrichment lookup finds extra fields (e.g. `summary.total_visits`),
they are surfaced automatically — but the workflow degrades gracefully when
they are missing.

## Setup steps

1. **Import** `workflow.json` into n8n (`Workflows → Import from File`).
2. **Bind credentials**:
   - `Ramsisa Trigger` → your `Ramsisa API` credential.
   - `Slack: post` → a `Slack API` credential (Slack app with `chat:write` scope).
3. **Replace `YOUR_SLACK_CHANNEL_ID`** in the `Slack: post` node with the channel ID
   (the `C...` value, not the channel name).
4. **Activate** the workflow. Copy the `Ramsisa Trigger` node's **Production URL**.
5. **Pass that URL** as the `webhook_url` on any `Ramsisa: Generate Schedule` call —
   directly via the n8n action node, the public API, or another integration.

When Ramsisa fires the webhook, this workflow posts to Slack within a second or two.

## Sanitization note

`workflow.json` is run through `workflows/n8n/_scripts/sanitize.mjs` on every
commit. It is import-safe: no environment-specific IDs, webhook URLs, or
localhost references are present.
