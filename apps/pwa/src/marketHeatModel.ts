export type MarketHeatStatus = "copy_ready" | "watching";
export type MarketHeatSortMode = "latest" | "heat";

export type MarketHeatPreviewRowInput = {
  id: string;
  wallet: string;
  manager: string;
  market: string;
  side: "UP" | "DOWN";
  strike: number;
  expiryMs: number;
  intervalLabel: string;
  observedAtMs: number;
  heatScore: number;
  status: MarketHeatStatus;
};

export type MarketHeatPreviewRow = {
  id: string;
  displayName: string;
  manager: string;
  market: string;
  strikeLabel: string;
  intervalLabel: string;
  observedAtMs: number;
  heatScore: number;
  actionLabel: "Copy now" | "Copy next";
  status: MarketHeatStatus;
  statusLabel: string;
};

export type MarketHeatIntentState = {
  selectedRowId: string | null;
};

export type MarketHeatIntentPanel = {
  actionLabel: "Copy now" | "Copy next";
  closeLabel: "Cancel";
  detailLabel: "Next observed mint" | "Recent mint";
  signatureLabel: "We'll prepare the next mint for your signature" | "Ready for user signature";
  statusLabel: string;
  title: string;
};

export type MarketHeatPreview = {
  title: "Market Heat";
  modeLabel: "Testnet";
  actionLabel: "Copy";
  detailLabel: "Observed Predict mints";
  sourceLabel: string;
  rows: MarketHeatPreviewRow[];
};

export type LoadMarketHeatPreviewOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: number;
};

export type BuildMarketHeatPreviewOptions = {
  nowMs?: number;
};

const MARKET_HEAT_CANDIDATE_LIMIT = 24;

export const MARKET_HEAT_PREVIEW_ROWS: MarketHeatPreviewRowInput[] = [
  {
    id: "external-0x84d2",
    wallet: "0x84d2f193f73f9d5f2bb0fe47238bc8c2441b91af",
    manager: "manager 0xb795...3125",
    market: "BTC-USD",
    side: "UP",
    strike: 12_400,
    expiryMs: 1_779_158_400_000,
    intervalLabel: "15m",
    observedAtMs: 1_779_158_400_000,
    heatScore: 92,
    status: "copy_ready",
  },
  {
    id: "external-0x28b7",
    wallet: "0x28b7a9cd430a1d7ec8c90f0cb74b212ad8934c10",
    manager: "manager 0x43af...e64",
    market: "BTC-USD",
    side: "DOWN",
    strike: 7_800,
    expiryMs: 1_779_158_400_000,
    intervalLabel: "1h",
    observedAtMs: 1_779_151_200_000,
    heatScore: 87,
    status: "watching",
  },
  {
    id: "external-0x6f09",
    wallet: "0x6f098d1adf9c8b603452dc72cb9096da0c82aa35",
    manager: "manager 0xc873...028a",
    market: "BTC-USD",
    side: "UP",
    strike: 4_200,
    expiryMs: 1_779_158_400_000,
    intervalLabel: "1d",
    observedAtMs: 1_779_079_200_000,
    heatScore: 81,
    status: "watching",
  },
];

export function buildMarketHeatPreview(
  rows: MarketHeatPreviewRowInput[] = MARKET_HEAT_PREVIEW_ROWS,
  limit = 24,
  { nowMs = Date.now() }: BuildMarketHeatPreviewOptions = {},
): MarketHeatPreview {
  return {
    title: "Market Heat",
    modeLabel: "Testnet",
    actionLabel: "Copy",
    detailLabel: "Observed Predict mints",
    sourceLabel: "Captured",
    rows: sortMarketHeatInputs(rows)
      .slice(0, limit)
      .map((row) => ({
      id: row.id,
      displayName: formatWallet(row.wallet),
      manager: row.manager,
      market: `${row.market} ${row.side}`,
      strikeLabel: `Strike ${formatMint(row.strike)}`,
      intervalLabel: row.intervalLabel,
      observedAtMs: row.observedAtMs,
      heatScore: row.heatScore,
      actionLabel: row.status === "copy_ready" ? "Copy now" : "Copy next",
      status: row.status,
      statusLabel: formatTradeTime(row.observedAtMs, nowMs),
    })),
  };
}

export function sortMarketHeatRows(
  rows: MarketHeatPreviewRow[],
  sortMode: MarketHeatSortMode,
): MarketHeatPreviewRow[] {
  return [...rows].sort((left, right) => compareMarketHeatRows(left, right, sortMode));
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
    detailLabel: isCopyReady ? "Recent mint" : "Next observed mint",
    signatureLabel: isCopyReady
      ? "Ready for user signature"
      : "We'll prepare the next mint for your signature",
    statusLabel: row.statusLabel,
    title: `Copy ${row.displayName}`,
  };
}

export async function loadMarketHeatPreview({
  apiBaseUrl,
  fetcher = fetch,
  nowMs = Date.now(),
}: LoadMarketHeatPreviewOptions = {}): Promise<MarketHeatPreview> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
    return buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, MARKET_HEAT_CANDIDATE_LIMIT, {
      nowMs,
    });
  }

  try {
    const response = await fetcher(buildMarketHeatUrl(normalizedBaseUrl));

    if (!response.ok) {
      return buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, MARKET_HEAT_CANDIDATE_LIMIT, {
        nowMs,
      });
    }

    const payload: unknown = await response.json();
    const rows = parseMarketHeatRows(payload);

    if (!rows) {
      return buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, MARKET_HEAT_CANDIDATE_LIMIT, {
        nowMs,
      });
    }

    return {
      ...buildMarketHeatPreview(rows, MARKET_HEAT_CANDIDATE_LIMIT, { nowMs }),
      sourceLabel: formatMarketHeatSource(payload),
    };
  } catch {
    return buildMarketHeatPreview(MARKET_HEAT_PREVIEW_ROWS, MARKET_HEAT_CANDIDATE_LIMIT, {
      nowMs,
    });
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

function sortMarketHeatInputs(rows: MarketHeatPreviewRowInput[]): MarketHeatPreviewRowInput[] {
  return [...rows].sort((left, right) => compareMarketHeatRows(left, right, "latest"));
}

function compareMarketHeatRows(
  left: Pick<MarketHeatPreviewRow, "heatScore" | "id" | "observedAtMs">,
  right: Pick<MarketHeatPreviewRow, "heatScore" | "id" | "observedAtMs">,
  sortMode: MarketHeatSortMode,
): number {
  if (sortMode === "heat") {
    return (
      right.heatScore - left.heatScore ||
      right.observedAtMs - left.observedAtMs ||
      left.id.localeCompare(right.id)
    );
  }

  return (
    right.observedAtMs - left.observedAtMs ||
    right.heatScore - left.heatScore ||
    left.id.localeCompare(right.id)
  );
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
    isNonNegativeNumber(value.strike) &&
    isNonNegativeNumber(value.expiryMs) &&
    isNonEmptyString(value.intervalLabel) &&
    isNonNegativeNumber(value.observedAtMs) &&
    isNonNegativeNumber(value.heatScore) &&
    (value.status === "copy_ready" || value.status === "watching")
  );
}

function formatTradeTime(observedAtMs: number, nowMs: number): string {
  const elapsedMs = Math.max(0, nowMs - observedAtMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);

  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) {
    return `${elapsedDays}d ago`;
  }

  return new Date(observedAtMs).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
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
