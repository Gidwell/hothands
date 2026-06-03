# Hot Hands Product Spec

Last updated: June 3, 2026

## One-Line Pitch

Hot Hands is the live social copy/fade layer for DeepBook Predict: find wallets heating up in real BTC UP/DOWN markets, watch their trades, and mirror or fade them with your own amount.

## Product Principles

- The app should feel like a live social market floor: high-energy and communal, but always grounded in BTC UP/DOWN prediction language.
- Avoid literal craps/dice/table-game terminology unless the feature truly maps to prediction markets.
- The home page should answer: which real Predict wallets are hot, who is watching them, what can I copy, and what can I fade right now?
- Copying and fading should be explicit and user-signed for MVP.
- Onchain state should prove important social and trading artifacts, but ephemeral liveness should stay offchain.
- The testnet demo must work even if public data is noisy, slow, or quiet.
- External wallet watching is the first live-data loop. Hot Hands-native
  pre-trade signals are a later upgrade, not the dependency that makes the app
  feel alive.

## Stage 1 Learnings

- Shared deterministic fixtures should be the source of truth for local demos, UI replay, e2e tests, and scoring checks. Avoid separate PWA-only demo stories.
- Demo scenarios should each prove a product point: `opening-night` for the happy path, `trap-streak` for high win rate with negative ROI, and `hot-hand-swing` for leaderboard movement.
- Spectator and heartbeat activity makes the app feel live, but it should remain ephemeral and cheap unless it becomes a meaningful table event.
- The strongest Stage 1 UX was arming a one-shot copy intent, not automatic custody. Keep copy explicit and user-sized until a later delegated-trading design is deliberately chosen.
- Fixture, replay, and live testnet modes must stay visually and technically distinguishable so judges understand what proof they are seeing.

## MVP User Stories

- As a spectator, I can enter a live BTC table and see real DeepBook Predict activity.
- As a follower, I can watch a hot trader address or `PredictManager`.
- As a follower, I can arm a watch-next-trade rule with my own sizing limits.
- As a follower, I can receive a prepared copy or fade transaction when the watched trader mints a new BTC UP/DOWN position.
- As a follower, I can fade an observed trade by taking the opposite side at the same oracle, expiry, and strike.
- As any user, I can see current market heat ranked by realized performance, activity, streak, size, copy demand, and fade demand.
- As any user, I can see useful trader identity even before a trader has created a Hot Hands profile, using SuiNS when available and a shortened wallet otherwise.
- As a connected user, I can claim my wallet profile and link my X account.
- As a judge, I can watch a deterministic demo and a live testnet-read mode that clearly distinguish fixture copy behavior from real Predict wallet activity.
- Later, as a Hot Hands-native leader, I can post a public pre-trade signal with market, direction, strike, expiry, confidence, and optional thesis.

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
- `armed`: has a watch-next-trade or native copy rule ready.
- `watched trader`: external address or manager being followed from Predict activity.
- `leader`: Hot Hands-native profile that has posted signals or attracted followers.
- `copier`: executed a copy trade.
- `fader`: executed the opposite side of an observed trade.

## External Wallet Watches

The first live MVP watches public DeepBook Predict activity.

Source rows:

- `/positions/minted`
- `/positions/redeemed`
- `/trades/:oracle_id`

A watched trade is an observed Predict mint, not a pre-trade call.

Required normalized fields:

- `trade_id`
- `trader`
- `manager_id`
- `oracle_id`
- `expiry_ms`
- `strike`
- `is_up`
- `quantity`
- `cost`
- `ask_price`
- `checkpoint`
- `checkpoint_timestamp_ms`

Watch rule fields:

- `rule_id`
- `follower`
- `watched_trader`
- `watched_manager_id`
- `max_cost`
- `sizing_mode`
- `sizing_value`
- `filters`
- `expires_at_ms`
- `status`

Execution flow:

1. Follower arms a watch-next-trade rule.
2. Indexer observes a new Predict mint by the watched trader or manager.
3. Backend validates market, size, freshness, and user constraints.
4. Backend prepares a DeepBook Predict mint transaction using follower size rules and selected action.
5. Follower signs and executes.
6. Hot Hands records the copy/fade relationship and tracks redeem/settlement.

MVP copy is reactive. Do not imply Hot Hands saw or executed the external
trader's intent before it landed on DeepBook Predict.

## Profiles And Identity

Hot Hands should display a useful identity for every wallet in the feed,
including wallets that have never opened the app.

Profile states:

- `shadow`: auto-created from observed DeepBook Predict activity.
- `claimed`: connected wallet user can edit display name, avatar, and bio.
- `x_linked`: claimed profile has a verified X account handle/avatar link.

Display fallback:

```text
claimed display name -> linked X handle -> SuiNS name -> shortened wallet
```

SuiNS names are display enrichment. Wallet signature remains the authority for
claiming and editing a Hot Hands profile.

## Hot Hands-Native Signals

A signal is a public pre-trade call.

Native signals are a later, stronger attribution layer. They can reduce copy
latency and support squads, thesis, confidence, and creator reputation, but
they are not required for the first real-data MVP.

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

## Copy And Fade Semantics

MVP social trade actions are explicit and user-signed.

Two MVP-compatible sources:

- `watch_next_trade`: reactive copy of a public external Predict mint.
- `copy_next_signal`: copy of a Hot Hands-native pre-trade signal.

Action types:

- `mirror`: same side as the source trade or signal.
- `fade`: opposite side at the same oracle, expiry, and strike.

Shared social trade fields:

- `rule_id`
- `follower`
- `source_kind`
- `source_id`
- `action_type`
- `source_side`
- `executed_side`
- `max_cost`
- `sizing_mode`
- `sizing_value`
- `expires_at_ms`
- `status`

Sizing modes:

- `fixed_cost`
- `percent_of_leader`
- `max_affordable`

Copy/fade counts should be tracked separately at both the position and trader
level. Heat can use these values, but the UI should still expose raw copy/fade
demand because it is socially legible.

## Scoring

Hot score should make the table feel alive while resisting obvious gaming.

Use two score labels until Hot Hands-native proof exists:

- `Market Heat`: inferred from raw DeepBook Predict activity.
- `Hot Hands Reputation`: earned from Hot Hands-native signals, copy/fade
  executions or receipts, and linked settlement outcomes.

Market Heat inputs:

- recent mints
- recent realized PnL from redeems or settled positions
- recent ROI where cost/payout are known
- activity freshness
- trade size
- sample size
- copy/fade demand
- spam penalties

Hot Hands Reputation inputs:

- current resolved win streak
- recent realized PnL
- recent ROI
- hit rate
- copied volume and successful copy outcomes
- faded volume and successful fade outcomes
- position-level copy/fade demand
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
+ 0.10 * social_demand_score
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

### Live Testnet Read Mode

Reads public DeepBook Predict mints/redeems/trades and renders real wallet
activity. Copy can be disabled, preview-only, or user-signed depending on the
wallet-flow milestone.

### Live Testnet Bot Mode

Funded test wallets post signals and execute real DeepBook Predict testnet trades. Used for final validation and demo proof.
