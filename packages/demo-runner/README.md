# Hot Hands Demo Runner

Scripted fake users and table scenarios.

Modes:

- fixture mode
- replay mode
- live testnet bot mode

The demo runner should feed the same realtime and scoring paths as production.

## Stage 2 Realtime Adapter

`produceRealtimeActivityTrace` projects deterministic replay frames into shared
`table_activity` items:

- `signal_landed`
- `copy_submitted`
- `copy_executed`
- `settlement_posted`
- `hot_hand_updated`

These events remain visibly sourced as `fixture_replay` so demo data cannot be
confused with future testnet/indexed activity.

Inspect the stream locally with:

```bash
bun run demo:play opening-night --realtime
```
