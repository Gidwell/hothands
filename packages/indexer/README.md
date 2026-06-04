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

The first UI pass should label these as "Testnet trades" or "Market Heat" and
use them for activity/trader discovery. As the indexer comes online, the PWA
should consume indexed and downsampled projections rather than public Predict
server responses directly. Users can still watch an external trader's next
observed mint and receive a prepared mirror-copy or fade transaction, but that
is reactive action from public activity. Hot Hands-native reputation requires
watch rules, copy/fade executions, native signals when present, and
settlement-aware scoring.

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
