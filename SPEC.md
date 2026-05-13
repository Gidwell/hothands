# Hot Hands Product Spec

Last updated: May 13, 2026

## One-Line Pitch

Hot Hands is the live social layer for DeepBook Predict: find traders who are heating up, watch the table form around them, and copy their next BTC signal with your own amount.

## Product Principles

- The app should feel like a mobile casino table, not a trading dashboard.
- The home page should answer: who is hot, who is watching, who is armed, and what can I copy right now?
- Copying should be explicit and user-signed for MVP.
- Onchain state should prove important social and trading artifacts, but ephemeral liveness should stay offchain.
- The testnet demo must work even if public data is noisy, slow, or quiet.

## MVP User Stories

- As a spectator, I can enter a live BTC table and see who else is watching.
- As a follower, I can arm a copy-next-signal rule for a trader.
- As a leader, I can post a public signal with market, direction, strike, expiry, confidence, and optional thesis.
- As a follower, I can execute a prepared copy trade when a leader posts a signal.
- As any user, I can see current hot hands ranked by streak, ROI, PnL, and copy demand.
- As a judge, I can watch a deterministic demo that shows spectators, signals, copy activity, settlement, and changing leaderboards.

## Non-MVP

- Custodial automatic copy trading.
- Pooled squad vaults.
- Manager performance fees.
- Encrypted alpha calls.
- Full calibration-heavy scoring UI.
- Mainnet deployment.

## Tables

A table is the live social room around a market or trader context.

Primary table identity for MVP:

```text
table_id = oracle_id
```

Later table identities:

```text
table_id = trader_id:active
table_id = squad_id:active
table_id = btc:15m
```

Table roles:

- `spectator`: connected and watching.
- `armed`: has a copy-next-signal rule ready.
- `leader`: has posted signals or is being followed.
- `copier`: executed a copy trade.

## Signals

A signal is a public pre-trade call.

Required fields:

- `signal_id`
- `leader`
- `oracle_id`
- `expiry_ms`
- `strike`
- `is_up`
- `confidence_bps`
- `created_at_ms`
- `intended_cost`
- `status`

Signal status:

- `posted`
- `copyable`
- `expired`
- `settled_win`
- `settled_loss`
- `voided`

Settlement rule:

```text
UP wins when settlement_price > strike
DOWN wins when settlement_price <= strike
```

Anti-gaming rules:

- Ignore signals created too close to expiry.
- Require minimum intended cost or copied amount for score eligibility.
- Collapse repeated identical market/strike/direction spam.
- Clip extreme ROI contributions.
- Weight scores by sample size.

## Copy Next Signal

MVP copy is explicit and user-signed.

Copy rule fields:

- `rule_id`
- `follower`
- `leader`
- `max_cost`
- `sizing_mode`
- `sizing_value`
- `expires_at_ms`
- `status`

Sizing modes:

- `fixed_cost`
- `percent_of_leader`
- `max_affordable`

Execution flow:

1. Follower arms a copy rule.
2. Leader posts a signal.
3. Backend prepares a DeepBook Predict transaction using follower size constraints.
4. Follower signs and executes.
5. Hot Hands emits or records a `CopyReceipt`.

## Scoring

Hot score should make the table feel alive while resisting obvious gaming.

Inputs:

- current resolved win streak
- recent realized PnL
- recent ROI
- hit rate
- copied volume
- sample size
- signal freshness
- calibration, when confidence is available

Initial formula:

```text
hot_score =
  0.30 * streak_score
+ 0.25 * recent_roi_score
+ 0.20 * recent_pnl_score
+ 0.10 * hit_rate_score
+ 0.10 * copied_volume_score
+ 0.05 * freshness_score
- penalties
```

UI labels:

- `Heating Up`: 2 resolved wins in recent window.
- `Hot Hand`: 4 resolved wins and positive recent ROI.
- `On Fire`: 5+ resolved wins, positive ROI, and copy activity.
- `Trap Streak`: strong win rate but negative ROI.

## Demo Modes

### Fixture Mode

Fully deterministic local mode with fake oracle, fake signals, fake spectators, fake settlement, and no chain calls.

### Replay Mode

Recorded DeepBook Predict testnet data replayed through the same UI and realtime channels. Used as a fallback if testnet is slow during judging.

### Live Testnet Bot Mode

Funded test wallets post signals and execute real DeepBook Predict testnet trades. Used for final validation and demo proof.

