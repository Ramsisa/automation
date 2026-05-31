# Local dev environment

Throwaway n8n instance for testing the workflows in this repo end-to-end.
**Not for production.** SQLite, no auth, single container.

Runs on port `5679` so it can sit alongside your other n8n (which is
typically on 5678) without conflict.

## First-time setup

```bash
# 1. Configure secrets
cp dev/.env.example dev/.env
openssl rand -hex 32   # paste the output into dev/.env as N8N_ENCRYPTION_KEY

# 2. Build the community node so `dist/` exists for the bind mount
cd n8n-nodes-ramsisa
npm install
npm run build
cd ..

# 3. Start n8n
docker compose -f dev/docker-compose.yml up -d

# 4. Open the UI
open http://localhost:5679        # macOS
xdg-open http://localhost:5679    # Linux
```

The `Ramsisa` + `Ramsisa Trigger` nodes appear in the node palette
automatically — they are loaded via `N8N_CUSTOM_EXTENSIONS` pointing at the
bind-mounted `../n8n-nodes-ramsisa` directory.

## Day-to-day

**After changing the node's TypeScript source:**

```bash
npm --prefix n8n-nodes-ramsisa run build
docker compose -f dev/docker-compose.yml restart n8n
```

**Import all four workflows at once** (recommended):

```bash
bash dev/import-workflows.sh
```

The script injects a fresh UUID into each `workflow.json` before piping it
to `n8n import:workflow` (the CLI requires a top-level `id`, which
`sanitize.mjs` deliberately strips because it is environment-specific).
Re-running creates duplicates — wipe state with
`docker compose -f dev/docker-compose.yml down -v` first if you want a
clean slate.

**Manual import** via the UI: **Workflows → ⋯ → Import from File** →
select the `workflow.json` from your host. The UI auto-generates the
missing `id`; the CLI doesn't.

## Webhooks

The `Ramsisa Trigger` node only fires when something POSTs to its
Production URL. Two scenarios:

- **Schedule server running on your machine**: works out of the box.
  Ramsisa hits `http://localhost:5679/webhook/ramsisa`.
- **Schedule server at schedule.ramsisa.com**: the live API can't reach
  `localhost`. Expose port 5679 via a tunnel and update `WEBHOOK_URL`:

  ```bash
  cloudflared tunnel --url http://localhost:5679
  #   ...prints e.g. https://random-words.trycloudflare.com
  # Edit dev/.env → WEBHOOK_URL=https://random-words.trycloudflare.com/
  docker compose -f dev/docker-compose.yml restart n8n
  ```

  Then activate the trigger workflow, copy the **Production URL** n8n
  generates (which now starts with the tunnel hostname), and paste it as
  the `webhook_url` on a Ramsisa Generate Schedule call.

## Tear down

```bash
docker compose -f dev/docker-compose.yml down       # stop, keep state
docker compose -f dev/docker-compose.yml down -v    # also wipe n8n_data
```

## What this is NOT

- Not a production deployment. No HTTPS, no auth, no backups.
- Not a replacement for whatever n8n you run elsewhere. The named volume
  `dev_n8n_data` is local to this compose project; nothing here touches it.
