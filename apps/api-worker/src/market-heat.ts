export interface MarketHeatProjection {
  source: "captured_testnet";
  title: string;
  mode: "testnet";
  detail: string;
  capturedAt: string;
  rows: MarketHeatRow[];
}

export interface MarketHeatRow {
  id: string;
  wallet: string;
  manager: string;
  market: string;
  side: "UP" | "DOWN";
  observedMint: number;
  heatScore: number;
  preparedCopies: number;
  status: "copy_ready" | "watching";
}

export function getCapturedTestnetMarketHeat(): MarketHeatProjection {
  return CAPTURED_TESTNET_MARKET_HEAT;
}

const CAPTURED_TESTNET_MARKET_HEAT: MarketHeatProjection = {
  source: "captured_testnet",
  title: "Testnet Market Heat",
  mode: "testnet",
  detail: "Captured DeepBook Predict mint activity for read-only PWA testnet mode.",
  capturedAt: "2026-05-19T16:00:00.000Z",
  rows: [
    {
      id: "captured-alpha-cruz-btc-up-67k",
      wallet: "0x7a2c...4f91",
      manager: "Alpha Cruz",
      market: "BTC-USD",
      side: "UP",
      observedMint: 67_000,
      heatScore: 91,
      preparedCopies: 14,
      status: "copy_ready"
    },
    {
      id: "captured-mina-park-btc-down-66k",
      wallet: "0x55e9...c812",
      manager: "Mina Park",
      market: "BTC-USD",
      side: "DOWN",
      observedMint: 66_000,
      heatScore: 84,
      preparedCopies: 9,
      status: "watching"
    },
    {
      id: "captured-vee-moss-btc-up-68k",
      wallet: "0xb183...9d0a",
      manager: "Vee Moss",
      market: "BTC-USD",
      side: "UP",
      observedMint: 68_000,
      heatScore: 78,
      preparedCopies: 6,
      status: "copy_ready"
    }
  ]
};
