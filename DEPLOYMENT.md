# Deployment

Hot Hands deploys as three production pieces:

- Cloudflare Pages serves the PWA from `apps/pwa/dist`.
- Railway runs the Bun API service.
- Railway runs the live indexer worker.
- Railway Postgres stores indexed Predict data and app-owned state.

## Current Production

- PWA: `https://hothands.pages.dev`
- API: `https://hothands-api-production.up.railway.app`
- Railway project: `capable-expression`
- Railway services: `Postgres`, `hothands-api`, `hothands-indexer`
- Cloudflare Pages project: `hothands`

The first production deployment was created from the CLI. GitHub auto-deploys
still need provider dashboard access to `Gidwell/hothands`:

- Railway: connect `hothands-api` and `hothands-indexer` to `Gidwell/hothands`
  on `main`.
- Cloudflare Pages: connect the `hothands` Pages project to `Gidwell/hothands`
  on `main` and set the production build variables below.

## Railway

The Railway project should contain:

- `Postgres`
- `hothands-api`
- `hothands-indexer`

Both app services deploy from the repository root and use `railway.json`.
The shared start command is:

```bash
bun run railway:start
```

Each service selects its process with `HOT_HANDS_RAILWAY_PROCESS`.

### API Service

Variables:

```text
HOT_HANDS_RAILWAY_PROCESS=api
HOST=0.0.0.0
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

The public API domain should point at this service. The health endpoint is:

```text
/health
```

### Indexer Service

Variables:

```text
HOT_HANDS_RAILWAY_PROCESS=indexer
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

The indexer has no public domain. Use logs and `/testnet/indexer-status` on the
API to confirm it is writing fresh data.

Optional chart-history bootstrap variables:

```text
HOT_HANDS_INDEXER_STARTUP_PRICE_BACKFILL_DAYS=3
HOT_HANDS_INDEXER_STARTUP_PRICE_SAMPLE_MS=1000
HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_MS=3600000
HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_CONCURRENCY=2
```

Set these on `hothands-indexer` when production charts need deeper history. The
worker runs a price-only backfill from inside Railway before live polling starts,
then resumes the normal latest-price indexer. `1000` keeps one historical point
per second, matching the live chart cadence closely enough for smooth graphs.
Writes are idempotent by price event ID, so reruns fill missing points without
duplicating existing rows.

### Manual Railway Deploys

Until Railway GitHub auto-deploys are connected, deploy from the repository
root with the Railway CLI:

```bash
railway up --service hothands-api --detach --message "<deploy message>"
railway up --service hothands-indexer --detach --message "<deploy message>"
```

Use `railway logs --service hothands-api` or
`railway logs --service hothands-indexer` to watch startup and ingestion health.

### Production Backfills

Run migrations first when schema files change:

```bash
railway run --service hothands-api -- bun run indexer:migrate
```

`railway run` executes locally with Railway variables. Production Postgres uses
the internal host `postgres.railway.internal`, so local one-off backfills cannot
connect unless a public TCP proxy is configured. Prefer the indexer startup
bootstrap variables above for chart history backfills.

For local or public-DB manual runs, the regular bounded Predict backfill is:

```bash
railway run --service hothands-api -- bun run indexer:backfill:predict -- --write --trade-limit 5000 --price-limit 10000
```

For deeper chart history, use a price-only windowed backfill. The public Predict
price endpoint supports millisecond `start_time` and `end_time` windows:

```bash
railway run --service hothands-api -- bun run indexer:backfill:predict -- --write --prices-only --price-window-days 3 --price-window-ms 3600000 --price-sample-ms 1000
```

Keep `--price-window-concurrency` low, usually `2`, if the public Predict server
starts returning rate limits. By default this covers the current active BTC
trade markets; use explicit `--oracle-id` values for targeted diagnostics.

If Railway SSH is configured for the machine, the same command can run inside the
private network:

```bash
railway ssh --service hothands-indexer -- bun run indexer:backfill:predict -- --write --prices-only --price-window-days 3 --price-window-ms 3600000 --price-sample-ms 1000
```

## Cloudflare Pages

Production branch:

```text
main
```

Build command:

```bash
bun install --frozen-lockfile && bun run build:pwa
```

Build output directory:

```text
apps/pwa/dist
```

Variables:

```text
VITE_HOT_HANDS_API_URL=https://<railway-api-domain>
VITE_HOT_HANDS_SHARE_URL=https://<cloudflare-pages-domain>
```

### Manual Cloudflare Pages Deploys

Until Cloudflare GitHub auto-deploys are connected, build the PWA with the
production API URL and deploy the static bundle:

```bash
VITE_HOT_HANDS_API_URL=https://hothands-api-production.up.railway.app VITE_HOT_HANDS_SHARE_URL=https://hothands.pages.dev bun run build:pwa
wrangler pages deploy apps/pwa/dist --project-name hothands --branch main --commit-hash <git-sha> --commit-message "<deploy message>"
```

## First Deploy Checklist

1. Run Railway migrations against production Postgres.
2. Run an initial Predict backfill against production Postgres.
3. Deploy `hothands-api`.
4. Deploy `hothands-indexer`.
5. Generate or assign the Railway API domain.
6. Set the Cloudflare Pages API URL to the Railway API domain.
7. Deploy Cloudflare Pages.
8. Verify:

```bash
curl https://<railway-api-domain>/health
curl https://<railway-api-domain>/testnet/indexer-status
curl https://<railway-api-domain>/testnet/market-heat
```

For product testing, `indexer_unavailable` is a failed environment.
