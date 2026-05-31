# make-app-ramsisa

Make.com custom app for the Ramsisa field-visit scheduling API. Mirrors the
surface of `n8n-nodes-ramsisa`:

- Connection: API key + base URL + API version (default `v1`)
- Actions: Generate Schedule, Get Schedule Status, Download Schedule CSV
- Instant trigger: Receive Schedule Webhook

**Status: scaffolded only.** The folder layout, manifest, base config, and the
connection are wired up against `/api/v1`. Each module has a working
`api.imljson` (HTTP call) plus stub `parameters.imljson` / `interface.imljson`
that need to be fleshed out and tested with the Make Apps SDK CLI before this
can be uploaded.

## Layout

```
make-app-ramsisa/
├── metadata.json                  # app id, name, version, public flag
├── base.imljson                   # baseUrl + auth header + error mapping
├── readme.md → README.md          # public app description
├── connections/
│   └── apiKey/
│       ├── api.imljson            # connection-test request
│       ├── parameters.imljson     # what the user enters: baseUrl, apiVersion, apiKey
│       └── metadata.json
├── modules/
│   ├── generate-schedule/         # action — POST /schedules/generate/
│   ├── get-schedule-status/       # action — GET  /schedules/{id}/
│   ├── download-schedule-csv/     # action — GET  /schedules/{id}/download/ (binary)
│   └── receive-webhook/           # instant trigger — paired with webhook
└── webhooks/
    └── schedule-completion/       # instant webhook receiver
```

## What's wired

- `metadata.json` — app id, version, description, public flag set to `false`
  (private during dev).
- `base.imljson` — `{{connection.baseUrl}}/api/{{connection.apiVersion}}`
  prefix, `Authorization: Bearer {{connection.apiKey}}` header, and a generic
  error-message extractor.
- `connections/apiKey/parameters.imljson` — three user inputs:
  `baseUrl` (default `https://schedule.ramsisa.com`), `apiVersion` (`v1`),
  `apiKey` (password-typed).
- `connections/apiKey/api.imljson` — health-check call to
  `/api/{{parameters.apiVersion}}/health/` so Make can validate the
  credential at save time.
- Each `modules/<name>/api.imljson` — correct HTTP method + URL + body /
  query / binary handling for the operation.

## What's TODO

These are listed by file so a future pass can tick them off:

- [ ] `modules/generate-schedule/parameters.imljson` — declare `locations`
      (collection of objects with the same fields as the n8n node), `month`
      (text, `YYYY-MM` placeholder), `webhookUrl` (text, optional), and
      the four `additionalFields` (visits_completed, monthly_target,
      period_target, excluded_days).
- [ ] `modules/generate-schedule/interface.imljson` — output schema:
      `schedule_id`, `status`, `created_at`.
- [ ] `modules/generate-schedule/expect.imljson` — display-only metadata
      for the bundle preview in Make.
- [ ] `modules/get-schedule-status/parameters.imljson` — `scheduleId`
      (text, required).
- [ ] `modules/get-schedule-status/interface.imljson` — full status object
      (id, status, summary, created_at, completed_at, download_url, error).
- [ ] `modules/download-schedule-csv/parameters.imljson` — `scheduleId`
      (text, required).
- [ ] `modules/download-schedule-csv/interface.imljson` — binary output:
      `data` (buffer, `text/csv`).
- [ ] `webhooks/schedule-completion/api.imljson` — `parse` block that pulls
      `schedule_id` and `status` from the body for filter-condition use.
- [ ] `webhooks/schedule-completion/attach.imljson` /
      `detach.imljson` — Make uses these to register the webhook URL with
      the user. For Ramsisa we don't auto-register (the user pastes the
      Make-provided URL into a `Generate Schedule` call), so these are
      typically no-op stubs but still required by the SDK.
- [ ] `modules/receive-webhook/` — points at the `schedule-completion`
      webhook and re-emits the body (optionally enriched via a Get Status
      call, like the n8n trigger does).

## Local dev

The Make Apps SDK CLI (`@makecom/apps-sdk-cli`) handles pushing this folder
to the Make platform. It is not declared in this repo's root `package.json`
yet — install it locally when starting work:

```bash
npm i -g @makecom/apps-sdk-cli
apps-sdk login
apps-sdk push make-app-ramsisa
```

## API version pinning

`base.imljson` builds every URL as
`{{connection.baseUrl}}/api/{{connection.apiVersion}}/...`. The connection
parameters default `apiVersion` to `"v1"` and currently only offer `v1` as
an option — mirrors the n8n credentials. A future API v2 ships as an
additive option on the connection plus a new major version of this app.
