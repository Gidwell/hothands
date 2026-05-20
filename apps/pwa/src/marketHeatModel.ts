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

export type MarketHeatIntentState = {
  selectedRowId: string | null;
};

export type MarketHeatIntentPanel = {
  actionLabel: "Watch hand" | "Copy hand";
  closeLabel: "Cancel";
  detailLabel: "No copy prepared" | "Prepared copy";
  signatureLabel: "Copy waits for a ready mint" | "Ready for user signature";
  statusLabel: "Copy ready" | "Watching";
  title: string;
};

export type MarketHeatPreview = {
  title: "Market Heat";
  modeLabel: "Testnet";
  actionLabel: "Watch hand";
  detailLabel: "Observed Predict mints";
  sourceLabel: string;
  rows: MarketHeatPreviewRow[];
};

export type LoadMarketHeatPreviewOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
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
    sourceLabel: "Captured",
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

export function selectMarketHeatIntent(
  state: MarketHeatIntentState,
  rowId: string,
  rows: MarketHeatPreviewRow[],
): MarketHeatIntentState {
  if (!rows.some((row) => row.id === rowId)) {
    return state;
  }

  return {
    selectedRowId: rowId,
  };
}

export function closeMarketHeatIntent(_state: MarketHeatIntentState): MarketHeatIntentState {
  return {
    selectedRowId: null,
  };
}

export function buildMarketHeatIntentPanel(
  row: MarketHeatPreviewRow | null | undefined,
): MarketHeatIntentPanel | null {
  if (!row) {
    return null;
  }

  const isCopyReady = row.status === "copy_ready";

  return {
    actionLabel: row.actionLabel,
    closeLabel: "Cancel",
    detailLabel: isCopyReady ? "Prepared copy" : "No copy prepared",
    signatureLabel: isCopyReady ? "Ready for user signature" : "Copy waits for a ready mint",
    statusLabel: row.statusLabel,
    title: `${isCopyReady ? "Copy" : "Watch"} ${row.displayName}`,
  };
}

export async function loadMarketHeatPreview({
  apiBaseUrl,
  fetcher = fetch,
}: LoadMarketHeatPreviewOptions = {}): Promise<MarketHeatPreview> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
    return buildMarketHeatPreview();
  }

  try {
    const response = await fetcher(buildMarketHeatUrl(normalizedBaseUrl));

    if (!response.ok) {
      return buildMarketHeatPreview();
    }

    const payload: unknown = await response.json();
    const rows = parseMarketHeatRows(payload);

    if (!rows) {
      return buildMarketHeatPreview();
    }

    return {
      ...buildMarketHeatPreview(rows),
      sourceLabel: formatMarketHeatSource(payload),
    };
  } catch {
    return buildMarketHeatPreview();
  }
}

function buildMarketHeatUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/testnet/market-heat`;
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

function parseMarketHeatRows(payload: unknown): MarketHeatPreviewRowInput[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.rows)) {
    return null;
  }

  const rows = payload.rows.filter(isMarketHeatRowInput);

  return rows.length > 0 ? rows : null;
}

function isMarketHeatRowInput(value: unknown): value is MarketHeatPreviewRowInput {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.wallet) &&
    isNonEmptyString(value.manager) &&
    isNonEmptyString(value.market) &&
    (value.side === "UP" || value.side === "DOWN") &&
    isNonNegativeNumber(value.observedMint) &&
    isNonNegativeNumber(value.heatScore) &&
    isNonNegativeNumber(value.preparedCopies) &&
    (value.status === "copy_ready" || value.status === "watching")
  );
}

function formatMarketHeatSource(payload: unknown): string {
  if (!isRecord(payload)) {
    return "API";
  }

  const rawSource = isNonEmptyString(payload.source) ? payload.source : "api";
  if (rawSource === "captured_testnet") {
    return "Captured";
  }

  const source = formatCompactLabel(rawSource);
  const mode = isNonEmptyString(payload.mode) ? payload.mode.toLowerCase() : "";

  return mode && !source.toLowerCase().includes(mode) ? `${source} ${mode}` : source;
}

function formatCompactLabel(value: string): string {
  if (value.toLowerCase() === "api") {
    return "API";
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
