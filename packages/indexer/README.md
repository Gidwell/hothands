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

Primary responsibilities:

- Predict server polling/replay adapters
- Sui event/checkpoint adapters for oracle updates
- Hot Hands event indexing
- signal resolution
- hot score snapshots
- hot table cache
