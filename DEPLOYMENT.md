# Deployment

Hot Hands deploys as three production pieces:

- Cloudflare Pages serves the PWA from `apps/pwa/dist`.
- Railway runs the Bun API service.
- Railway runs the live indexer worker.
- Railway Postgres stores indexed Predict data and app-owned state.

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
