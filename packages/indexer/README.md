# Hot Hands Indexer

Indexes DeepBook Predict and Hot Hands data, resolves signals, and computes scores.

Stage 3 starts with a read-only Predict testnet canary: read render-ready BTC
oracle data from the public Predict server, then graduate to Sui
events/checkpoints for lower-latency oracle updates. Direct onchain reads should
stay reserved for wallet-adjacent flows and transaction confirmation.

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
use them for activity/trader discovery. Users can still watch an external
trader's next observed mint and receive a prepared copy transaction, but that is
reactive copy from public activity. Hot Hands-native reputation requires watch
rules, copy receipts, native signals when present, and settlement-aware scoring.

Primary responsibilities:

- Predict server polling/replay adapters
- DeepBook Predict trade-history normalization
- external wallet heat scoring
- watch-rule matching inputs
- Sui event/checkpoint adapters for oracle updates
- Hot Hands event indexing
- signal resolution
- hot score snapshots
- hot table cache
