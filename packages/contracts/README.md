# Hot Hands Contracts

Sui Move package for the minimal social proof layer.

MVP events:

- `ProfileCreated`
- `ExternalTraderWatched`
- `WatchRuleArmed`
- `SignalPosted`
- `CopyRuleArmed`
- `CopyReceipt`
- `Followed`

DeepBook Predict remains the trading execution layer.

Stage 3 transaction work starts with snapshot-testable DeepBook Predict testnet
transaction intents and SDK transaction builders. Do not treat the current
testnet package/object IDs as mainnet-stable.

Current scope:

- centralize provisional Predict testnet package, registry, Predict object, and
  DUSDC quote type constants pinned to `predict-testnet-4-16`
- expose Move target strings for manager creation, manager deposit, market key
  construction, and mint
- serialize a conservative copied binary mint intent for tests and future wallet
  integration. The existing-manager mint plan builds
  `market_key::new(oracle_id, expiry, strike, is_up)` and then calls
  `predict::mint(predict, manager, oracle, key, quantity, clock)`
- build SDK transactions for `predict::create_manager`,
  `predict_manager::deposit<Quote>`, and copied mint

The package includes a no-funds testnet dev-inspect canary for
`predict::create_manager`. Full deposit and mint dry-runs still need funded
testnet objects: gas, an existing user-owned `PredictManager` shared object, a
DUSDC coin, and a Predict oracle object.
