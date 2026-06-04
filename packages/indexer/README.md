# Hot Hands Indexer

Indexes DeepBook Predict and Hot Hands data, resolves signals, and computes scores.

Stage 3 starts with a read-only Predict testnet canary: read render-ready BTC
oracle data from the public Predict server, then graduate to Sui
events/checkpoints for lower-latency oracle updates. Direct onchain reads should
stay reserved for wallet-adjacent flows and transaction confirmation.

The first foundation slice is DB-backed but still public-server first: run
bounded, high-limit backfills for oracles, mints, redeems, trades, prices, and
SVI into raw tables, then derive projections for market heat, recent activity,
settlement views, and PWA feeds. No cursor paging has been found on the public
Predict endpoints yet, so every job should be idempotent and freshness-aware.

## Local Durable Setup

Current status: `verify:testnet` uses public Predict server reads, while the
local testnet app can prefer indexed Postgres reads when `DATABASE_URL` is set.
The durable Postgres path uses the same normalized records, then persists and
serves them behind a narrow local setup:

1. Create a local Postgres database and export `DATABASE_URL`, for example:

   ```bash
   export DATABASE_URL=postgres://hot_hands:hot_hands@127.0.0.1:5432/hot_hands
   ```

2. For the normal local app loop, start the launcher with the same
   `DATABASE_URL`. It applies migrations, runs a bounded write backfill, starts
   the local API/PWA, and then starts the live indexer:

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
5. If you skipped the launcher in step 2, start the local app with the same
   `DATABASE_URL`:

   ```bash
   bun run dev:testnet
   ```

   The local API will prefer indexed reads for:

   - Market Heat and latest activity rows
   - Trade market ladder candidates
   - Portfolio mint/redeem events for a connected `PredictManager`
   - Oracle price history for the BTC chart

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

   Prices, positions, and active-oracle trades poll every 1 second by default;
   oracle metadata polls every 30 seconds. Tune with
   `HOT_HANDS_INDEXER_PRICE_POLL_MS`,
   `HOT_HANDS_INDEXER_POSITIONS_POLL_MS`,
   `HOT_HANDS_INDEXER_TRADES_POLL_MS`, and
   `HOT_HANDS_INDEXER_ORACLES_POLL_MS`. Every job writes freshness status to
   `predict_indexer_jobs`, and the local API exposes it at
   `/testnet/indexer-status`.

   The chart endpoint requests downsampled full-range history from
   `predict_oracle_prices`, preserving the first and latest indexed points while
   returning at most the requested point budget.
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
