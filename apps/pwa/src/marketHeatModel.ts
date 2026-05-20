export type MarketHeatStatus = "copy_ready" | "watching";

export type MarketHeatPreviewRowInput = {
  id: string;
  wallet: string;
  manager: string;
  market: string;
  side: "UP" | "DOWN";
  observedMint: number;
  heatScore: number;
  preparedCopies: number;
  status: MarketHeatStatus;
};

export type MarketHeatPreviewRow = {
  id: string;
  displayName: string;
  manager: string;
  market: string;
  observedMint: string;
  heatScore: number;
  preparedCopies: number;
  actionLabel: "Watch hand" | "Copy hand";
  status: MarketHeatStatus;
  statusLabel: "Copy ready" | "Watching";
};

export type MarketHeatPreview = {
  title: "Market Heat";
  modeLabel: "Testnet";
  actionLabel: "Watch hand";
  detailLabel: "Observed Predict mints";
  rows: MarketHeatPreviewRow[];
};

export const MARKET_HEAT_PREVIEW_ROWS: MarketHeatPreviewRowInput[] = [
  {
    id: "external-0x84d2",
    wallet: "0x84d2f193f73f9d5f2bb0fe47238bc8c2441b91af",
    manager: "manager 0xb795...3125",
    market: "BTC-USD",
    side: "UP",
    observedMint: 12_400,
    heatScore: 92,
    preparedCopies: 18,
    status: "copy_ready",
  },
  {
    id: "external-0x28b7",
    wallet: "0x28b7a9cd430a1d7ec8c90f0cb74b212ad8934c10",
    manager: "manager 0x43af...e64",
    market: "BTC-USD",
    side: "DOWN",
    observedMint: 7_800,
    heatScore: 87,
    preparedCopies: 11,
    status: "watching",
  },
  {
    id: "external-0x6f09",
    wallet: "0x6f098d1adf9c8b603452dc72cb9096da0c82aa35",
    manager: "manager 0xc873...028a",
    market: "BTC-USD",
    side: "UP",
    observedMint: 4_200,
    heatScore: 81,
    preparedCopies: 7,
    status: "watching",
  },
];

export function buildMarketHeatPreview(
  rows: MarketHeatPreviewRowInput[] = MARKET_HEAT_PREVIEW_ROWS,
  limit = 2,
): MarketHeatPreview {
  return {
    title: "Market Heat",
    modeLabel: "Testnet",
    actionLabel: "Watch hand",
    detailLabel: "Observed Predict mints",
    rows: rows.slice(0, limit).map((row) => ({
      id: row.id,
      displayName: formatWallet(row.wallet),
      manager: row.manager,
      market: `${row.market} ${row.side}`,
      observedMint: formatMint(row.observedMint),
      heatScore: row.heatScore,
      preparedCopies: row.preparedCopies,
      actionLabel: row.status === "copy_ready" ? "Copy hand" : "Watch hand",
      status: row.status,
      statusLabel: row.status === "copy_ready" ? "Copy ready" : "Watching",
    })),
  };
}

function formatWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function formatMint(value: number): string {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toLocaleString();
}
