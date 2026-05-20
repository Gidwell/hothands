# Hot Hands E2E

Playwright and performance verification.

Primary responsibilities:

- mobile PWA e2e flows
- realtime table activity stream contracts
- visual screenshots
- spectator heartbeat simulations
- demo trace assertions

Stage 2 simulated realtime gate: [STAGE-2-REALTIME-GATE.md](./STAGE-2-REALTIME-GATE.md)

## Worker Live Harness

`bun run --cwd packages/e2e test:worker-live` starts a local Bun
HTTP/WebSocket harness instead of Wrangler. Wrangler currently stalls before
binding a local port in the Codex desktop environment, so the harness reuses the
API worker protocol, table state, table activity broadcast logic, and market
heat projection directly.

This verifies the browser-facing contracts for:

- live table WebSocket activity
- `/testnet/market-heat` fetches in PWA Testnet mode

It is not a Cloudflare runtime parity test.
