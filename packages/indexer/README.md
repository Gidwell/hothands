# Hot Hands Indexer

Indexes DeepBook Predict and Hot Hands data, resolves signals, and computes scores.

Stage 3 starts with a read-only Predict testnet canary: read render-ready BTC
oracle data from the public Predict server, then graduate to Sui
events/checkpoints for lower-latency oracle updates. Direct onchain reads should
stay reserved for wallet-adjacent flows and transaction confirmation.

The first foundation slice is DB-backed but still public-server first: run
bounded, high-limit backfills for oracles, mints, redeems, trades, prices, and
SVI into raw tables, then derive projections for market heat, recent activity,
settlement views, and PWA feeds. The public Predict oracle price endpoint
supports millisecond `start_time` and `end_time` windows, so historical chart
backfills should use bounded windows and stay idempotent/freshness-aware.

## Local Durable Setup

Current status: `verify:testnet` uses public Predict server reads, while the
local testnet app can prefer indexed Postgres reads when `DATABASE_URL` is set.
The durable Postgres path uses the same normalized records, then persists and
serves them behind a narrow local setup:

1. Create a local Postgres database and export `DATABASE_URL`, for example:

   ```bash
   createdb hothands_dev
   export DATABASE_URL=postgres://$USER@127.0.0.1:5432/hothands_dev
   ```

   Use the connection string that matches your local Postgres user. Do not
   commit real credentials.
2. For the normal teammate/agent app loop, start the root launcher with the
   same `DATABASE_URL`. It applies migrations, runs a bounded write backfill,
   starts the local API/PWA, and then starts the live indexer:

   ```bash
   bun run dev:testnet
   ```

   Disable either automatic bootstrap step with `HOT_HANDS_DEV_MIGRATE=false`
   or `HOT_HANDS_DEV_BACKFILL=false` when you intentionally want to skip it.
3. For manual debugging, apply indexer migrations directly:

   ```bash
   bun run --cwd packages/indexer migrate
   ```

4. Run the Predict backfill CLI in dry-run mode first:

   ```bash
   bun run --cwd packages/indexer backfill:predict -- --dry-run --trade-limit 5000 --price-limit 10000
   ```

   Once migrations are applied, write to Postgres:

   ```bash
   bun run --cwd packages/indexer backfill:predict -- --write --trade-limit 5000 --price-limit 10000
   ```

   Start with small limits locally, then replay with wider limits. The CLI reads
   `DATABASE_URL` in write mode, fetches from the public Predict server, and upserts
   raw oracles, mints, redeems, trades, prices, and SVI.

   To backfill only historical oracle prices for chart depth, use a price-only
   windowed run. This reads `/oracles/:oracle_id/prices?start_time=...&end_time=...`
   in bounded chunks:

   ```bash
   bun run --cwd packages/indexer backfill:predict -- --dry-run --prices-only --price-window-days 3 --price-window-ms 3600000 --price-sample-ms 1000
   bun run --cwd packages/indexer backfill:predict -- --write --prices-only --price-window-days 3 --price-window-ms 3600000 --price-sample-ms 1000
   ```

   Keep `--price-window-concurrency` low, usually `2`, if the public Predict
   server starts returning rate limits. Price and SVI series backfills are
   intentionally limited to the current active BTC trade markets. Explicit
   `--oracle-id` values may target trade-history diagnostics, but expired
   oracle IDs are ignored for price/SVI history so pruned chart series are not
   resurrected.

   In production, Railway Postgres uses the private
   `postgres.railway.internal` host. A local `railway run ... backfill` command
   receives that private URL but cannot connect to it from your laptop. For
   production chart history, either run the command inside Railway with
   `railway ssh --service hothands-indexer -- ...`, or set the indexer startup
   bootstrap env vars described below and redeploy `hothands-indexer`.

5. If you skipped the launcher in step 2, start the local app with the same
   `DATABASE_URL`:

   ```bash
   bun run dev:testnet
   ```

   The local API will prefer indexed reads for:

   - Market Heat and latest activity rows
   - Lightweight BTC price/market snapshots for 1-second UI refreshes
   - Trade market ladder candidates
   - Portfolio mint/redeem events for a connected `PredictManager`
   - Oracle price history for the BTC chart
   - Hot Hands-owned wallet sessions, followed wallets, copy/fade receipts, and
     heat snapshots through `/app/*` API routes

   When `DATABASE_URL` is set, the dev launcher starts a separate live indexer
   process after migration/backfill bootstrap. The API remains read-only against
   Postgres. You can run the same process by itself with:

   ```bash
   bun run --cwd packages/indexer live -- --once
   bun run --cwd packages/indexer live
   ```

   The live indexer currently runs these idempotent jobs:

   - `predict.oracles`: refresh BTC oracle metadata and settlement fields
   - `predict.prices`: poll active BTC oracle `/prices/latest`
   - `predict.positions.minted`: poll global minted positions
   - `predict.positions.redeemed`: poll global redeemed positions
   - `predict.trades.active_oracles`: poll per-active-oracle trade history

   Prices, small latest-page positions, small active-oracle trade pages, and
   latest-only SVI poll every 1 second by default; oracle metadata polls every
   30 seconds. Tune with
   `HOT_HANDS_INDEXER_PRICE_POLL_MS`,
   `HOT_HANDS_INDEXER_POSITIONS_POLL_MS`,
   `HOT_HANDS_INDEXER_SVI_POLL_MS`,
   `HOT_HANDS_INDEXER_TRADES_POLL_MS`, and
   `HOT_HANDS_INDEXER_ORACLES_POLL_MS`. Live global position pages default to
   `250` rows and active-oracle trade pages default to `50` rows; use
   `HOT_HANDS_INDEXER_TRADE_LIMIT` or `HOT_HANDS_INDEXER_ORACLE_TRADE_LIMIT`
   only when you intentionally need a wider diagnostic live read. Wide history
   reads belong in bounded backfill jobs, not 1-second live polling. Live SVI
   fetches one latest point per active oracle by default; use
   `HOT_HANDS_INDEXER_SVI_LIMIT` when you intentionally need a wider diagnostic
   live read. Every job writes freshness status to `predict_indexer_jobs`, and
   the local API exposes it at `/testnet/indexer-status`.

   Live jobs use per-job adaptive backoff after errors instead of continuing to
   hit the public Predict server on the fixed poll interval. Successful loops
   keep a small jitter so jobs do not stay synchronized after a deploy. On
   `429` rate limits, a 1-second job backs off from a 5-second floor and grows
   exponentially up to 120 seconds by default. Tune with
   `HOT_HANDS_INDEXER_BACKOFF_JITTER_RATIO`,
   `HOT_HANDS_INDEXER_BACKOFF_MAX_MS`, and
   `HOT_HANDS_INDEXER_RATE_LIMIT_BACKOFF_FLOOR_MS`.

   Live global mint/redeem jobs use their previous indexed source timestamp as
   a local high-water mark before writing. This keeps repeated latest-page
   reads idempotent without re-upserting duplicate rows or rebuilding position
   summaries every second. As of the current public Predict server behavior,
   `start_time` is verified for oracle price history but not for the global
   `positions/minted` and `positions/redeemed` endpoints, so server-side
   position cursors should not be assumed until re-tested.

   The live indexer also runs chart-series maintenance by default. It deletes
   only `predict_oracle_prices` and `predict_oracle_svi` rows for expired
   oracles whose `expiry_ms` is at or before the prune cutoff. For active
   oracles, it rolls raw price ticks older than 24h into
   `predict_oracle_price_candles_1m`, then deletes those older raw ticks. The
   candle rows preserve spot OHLC, forward-price OHLC, sample count, first/last
   timestamps, and first/last checkpoints for future candlestick charts. It
   never deletes `predict_trade_events`, `predict_position_summaries`, or
   `predict_oracles`, so historic wallet and position data remains intact. The
   job runs every minute by default and deletes at most 100 expired oracles per
   table per run. Tune with `HOT_HANDS_INDEXER_MAINTENANCE_POLL_MS`,
   `HOT_HANDS_INDEXER_PRUNE_BATCH_ORACLE_LIMIT`,
   `HOT_HANDS_INDEXER_PRUNE_MAX_BATCHES`,
   `HOT_HANDS_INDEXER_PRUNE_RETENTION_MS`, and
   `HOT_HANDS_INDEXER_PRICE_CANDLE_RAW_RETENTION_MS`; disable expired-series
   pruning with `HOT_HANDS_INDEXER_PRUNE_EXPIRED_SERIES=false` or candle rollup
   with `HOT_HANDS_INDEXER_PRICE_CANDLES=false`.

   The chart endpoint requests downsampled full-range history from raw price
   ticks plus one-minute candle closes, preserving the first and latest indexed
   points while returning at most the requested point budget.

   To have the live indexer backfill chart depth before it begins normal polling,
   set `HOT_HANDS_INDEXER_STARTUP_PRICE_BACKFILL_DAYS` to the desired bounded
   history window. Optional tuning knobs are
   `HOT_HANDS_INDEXER_STARTUP_PRICE_SAMPLE_MS`,
   `HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_MS`, and
   `HOT_HANDS_INDEXER_STARTUP_PRICE_WINDOW_CONCURRENCY`. For example, production
   can set `HOT_HANDS_INDEXER_STARTUP_PRICE_BACKFILL_DAYS=3` and
   `HOT_HANDS_INDEXER_STARTUP_PRICE_SAMPLE_MS=1000` to keep one historical
   chart point per second while live polling continues at one latest tick per
   second. Startup price backfill writes each oracle/window as it goes, so a
   multi-day bootstrap does not need to hold the whole price history in memory
   before writing. Startup price backfill uses only active BTC trade markets.
   It should not be used to rebuild expired oracle chart history.

   For emergency/manual cleanup, the same prune logic can be run once from a
   Railway service console or local database shell:

   ```bash
   bun run --cwd packages/indexer prune:predict -- --dry-run
   bun run --cwd packages/indexer prune:predict -- --write --max-batches 100 --vacuum
   ```

   The manual prune command uses the same 24h active raw price retention by
   default. Override with `--price-candle-raw-retention-ms <ms>` only for
   emergency cleanup or diagnostics.

   Normal `VACUUM (ANALYZE)` makes deleted pages reusable by Postgres but may
   not immediately lower provider volume usage. If a deployed database is
   already near full, first add temporary volume headroom, then prune, and only
   consider a rewrite-style reclaim such as `VACUUM FULL` during a maintenance
   window.
6. Build projections from the raw tables before serving product flows:

   ```text
   public Predict server -> Postgres raw tables -> projections -> API/PWA
   ```

Do not treat observed external-wallet mints as pre-trade signals. This path is
for reactive copy/fade preparation, settlement-aware scoring, and durable
activity projections. Public Predict, captured fixtures, and direct Sui event
reads remain fallbacks when the local indexer is unavailable.

Run the read-only canary with:

```bash
bun run verify:testnet
```

It reads server status, Predict object state, BTC oracles, and the selected BTC
oracle's latest indexed price. It does not require wallet credentials or submit
transactions.

Implemented testnet read checkpoint:

- read recent binary mints from `/positions/minted`
- read recent binary redeems from `/positions/redeemed`
- read per-oracle activity from `/trades/:oracle_id`
- read indexed oracle prices and SVI where available
- keep range endpoints available for later with `/ranges/minted` and
  `/ranges/redeemed`

These rows are raw DeepBook Predict activity, not Hot Hands-native social
records. A mint row has the trader address, manager ID, oracle ID, expiry,
strike, direction, quantity, cost, and ask price. A redeem row adds payout, bid
price, and settlement state.

Hot Hands-owned social/auth records live beside the Predict raw tables but stay
separate from them:

- `app_wallet_auth_challenges` and `app_wallet_sessions` back Sui personal-message auth.
- `app_wallet_follows` stores authenticated follower -> leader wallet edges.
- `app_copy_receipts` stores submitted Copy/Fade attribution, source position,
  execution side, amount, and transaction digest.
- `app_wallet_heat_snapshots` reserves durable historical heat scores and
  components for future streak/leaderboard analysis.

`deepbook-predict.ts` normalizes captured minted, redeemed, and per-oracle rows
into `PredictNormalizedTradeEvent` records and computes provisional
`MarketHeatTrader` rankings. Field aliases observed on testnet such as
`event_digest`, `event_index`, and `checkpoint_timestamp_ms` are covered by
fixture tests.

The PWA should label these as testnet Market Heat and use them for
activity/trader discovery. With `DATABASE_URL`, the local API consumes indexed
and downsampled projections before public Predict responses. Users can still
watch an external trader's next observed mint and receive a prepared mirror-copy
or fade transaction, but that is reactive action from public activity. Hot
Hands-native reputation requires watch rules, copy/fade executions, native
signals when present, and settlement-aware scoring.

Primary responsibilities:

- Predict server polling/replay adapters
- DB-backed raw Predict backfill tables
- derived and downsampled feed projections
- DeepBook Predict trade-history normalization
- external wallet heat scoring
- watch-rule matching inputs
- copy/fade execution verification against Sui transaction digests
- Sui event/checkpoint adapters for oracle updates
- Hot Hands DB/event indexing
- signal resolution
- hot score snapshots
- hot table cache
