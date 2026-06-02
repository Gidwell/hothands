# Hot Hands PWA

Mobile-first React/Vite app.

Primary responsibilities:

- table-first home screen
- spectator rail
- hot trader cards
- testnet-read mode for real DeepBook Predict trade activity
- watch-next-trade controls for external Predict traders
- copy-next-signal controls for Hot Hands-native leaders after native signals
  exist
- wallet signing flow
- mobile visual verification hooks

Testnet mode:

- without `VITE_HOT_HANDS_API_URL`, it renders captured fallback rows
- with `VITE_HOT_HANDS_API_URL`, it fetches
  `/testnet/market-heat`, opens Testnet mode by default, and falls back to
  captured rows if the request fails
- source labels stay compact (`Captured`, `API testnet`) so the first screen
  stays scan-friendly
- market heat rows show wallet, direction, strike, expiry bucket, latest trade
  time, and heat
- rows default to `Latest` ordering so testers can watch new public trades
  arrive; while Testnet mode is open, the PWA refreshes market heat every
  10 seconds; the `Heat` toggle preserves the provisional score ranking
- `Copy now` means a recent mint can be prepared for user signature; `Copy next`
  means the wallet can be watched for the next mint
- wallet connect checks for the user's `PredictManager`; when it is missing, the
  wallet bar prompts account creation so trade cards do not each render their own
  Predict Account setup section
- trade cards prepare quoted `predict::mint` transactions after wallet-level
  Predict account setup is available
