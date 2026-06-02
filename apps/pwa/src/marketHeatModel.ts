export type MarketHeatStatus = "copy_ready" | "watching";
export type MarketHeatSortMode = "latest" | "heat";

export type MarketHeatPreviewRowInput = {
  id: string;
  oracleId?: string;
  wallet: string;
  manager: string;
  market: string;
  side: "UP" | "DOWN";
  quantity?: number;
  cost?: number;
  costUsd?: number;
  strike: number;
  expiryMs: number;
  intervalLabel: string;
  observedAtMs: number;
  heatScore: number;
  status: MarketHeatStatus;
};

export type MarketHeatPriceInput = {
  market: string;
  price: number;
  source: string;
};

export type MarketHeatPrice = {
  marketLabel: string;
  priceLabel: string;
  statusLabel: string;
};

export type MarketHeatAvailableMarketInput = {
  [key: string]: unknown;
  id?: unknown;
  oracleId?: unknown;
  market?: unknown;
  intervalLabel?: unknown;
  expiry?: unknown;
  expiryMs?: unknown;
  strike?: unknown;
  strikeCandidate?: unknown;
  strikeCandidatePrice?: unknown;
  latestPrice?: unknown;
  status?: unknown;
};

export type MarketHeatAvailableMarket = {
  id: string;
  oracleId: string;
  pairLabel: string;
  intervalLabel: string;
  expiry: number;
  expiryMs: number;
  expiryTimeLabel: string;
  strike: number;
  strikeRaw: number;
  strikeLabel: string;
  status: string;
};

export type MarketHeatPreviewRow = {
  id: string;
  oracleId?: string;
  wallet: string;
  displayName: string;
  manager: string;
  pairLabel: string;
  side: "UP" | "DOWN";
  quantity?: number;
  cost?: number;
  costUsd?: number;
  strike: number;
  strikeLabel: string;
  intervalLabel: string;
  expiryMs: number;
  expiryTimeLabel: string;
  observedAtMs: number;
  heatScore: number;
  actionLabel: "Copy now" | "Watch next";
  status: MarketHeatStatus;
  statusLabel: string;
};

export type MarketHeatIntentState = {
  selectedRowId: string | null;
};

export type MarketHeatIntentPanel = {
  actionLabel: "Copy now" | "Watch next";
  closeLabel: "Cancel";
  detailLabel: "Next observed mint" | "Recent mint";
  signatureLabel:
    | "We'll watch this wallet and prepare the next mint for your signature"
    | "Ready for your wallet signature";
  statusLabel: string;
  title: string;
};

export type MarketHeatPreview = {
  title: "Alpha Feed";
  modeLabel: "Testnet";
  actionLabel: "Copy";
  detailLabel: "Live BTC Predict mints";
  sourceLabel: string;
  marketPrice: MarketHeatPrice;
  availableMarkets?: MarketHeatAvailableMarket[];
  rows: MarketHeatPreviewRow[];
};

export type LoadMarketHeatPreviewOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  nowMs?: number;
  timeZone?: string;
};

export type BuildMarketHeatPreviewOptions = {
  marketPrice?: MarketHeatPriceInput;
  nowMs?: number;
  timeZone?: string;
};

export type SelectVisibleMarketHeatRowsOptions = {
  limit?: number;
  nowMs?: number;
  showExpired?: boolean;
  sortMode: MarketHeatSortMode;
};

export type SelectTradeMarketsOptions = {
  nowMs?: number;
};

export type TradeMarketSideSummary = {
  walletCount: number;
  tradeCount: number;
  volumeUsd: number;
  volumeLabel: string;
  estimatedPrice?: number;
};

export type TradeStrikeOption = {
  strike: number;
  strikeRaw: number;
  strikeLabel: string;
};

export type TradeMarketLadderRow = {
  id: string;
  oracleId: string;
  pairLabel: string;
  intervalLabel: string;
  roundLabel: string;
  expiry: number;
  expiryMs: number;
  expiryTimeLabel: string;
  timeRemainingLabel: string;
  strike: number;
  strikeRaw: number;
  strikeLabel: string;
  moneynessLabel: string;
  activityLabel: string;
  uniqueWalletCount: number;
  tradeCount: number;
  distinctStrikeCount: number;
  strikeOptions?: TradeStrikeOption[];
  volumeUsd: number;
  volumeLabel: string;
  up: TradeMarketSideSummary;
  down: TradeMarketSideSummary;
};

export type TradeQuoteSide = "UP" | "DOWN";

export type TradeQuote = {
  source: string;
  market: string;
  oracleId: string;
  expiry: string;
  strike: string;
  side: TradeQuoteSide;
  requestedSpendUsd: number;
  cost: string;
  costUsd: number;
  quantity: string;
  payoutUsd: number;
  maxProfitUsd: number;
  redeemPayout: string;
  redeemPayoutUsd: number;
  effectivePrice: number;
  quoteStatus: "ready";
};

export type LoadTradeQuoteOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  market: TradeMarketLadderRow;
  side: TradeQuoteSide;
  spendUsd: number;
};

const MARKET_HEAT_CANDIDATE_LIMIT = 96;
const CAPTURED_ROW_BASE_AGE_MS = 5 * 60_000;
const CAPTURED_ROW_AGE_STEP_MS = 15 * 60_000;
const CAPTURED_MARKET_PRICE: MarketHeatPriceInput = {
  market: "BTC-USD",
  price: 102_480,
  source: "captured_testnet",
};

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
  {
    marketPrice = CAPTURED_MARKET_PRICE,
    nowMs = Date.now(),
    timeZone,
  }: BuildMarketHeatPreviewOptions = {},
): MarketHeatPreview {
  return {
    title: "Alpha Feed",
    modeLabel: "Testnet",
    actionLabel: "Copy",
    detailLabel: "Live BTC Predict mints",
    sourceLabel: "Captured",
    marketPrice: buildMarketHeatPrice(marketPrice),
    rows: sortMarketHeatInputs(rows)
      .slice(0, limit)
      .map((row) => {
        const isActionableCopy = row.status === "copy_ready" && row.expiryMs > nowMs;
        const oracleId = isNonEmptyString(row.oracleId) ? row.oracleId : undefined;
        const quantity = optionalNonNegativeNumber(row.quantity);
        const cost = optionalNonNegativeNumber(row.cost);
        const costUsd = normalizeCostUsd(row);

        return {
          id: row.id,
          ...(oracleId === undefined ? {} : { oracleId }),
          wallet: row.wallet,
          displayName: formatWallet(row.wallet),
          manager: formatManager(row.manager),
          pairLabel: formatPair(row.market),
          side: row.side,
          ...(quantity === undefined ? {} : { quantity }),
          ...(cost === undefined ? {} : { cost }),
          ...(costUsd === undefined ? {} : { costUsd }),
          strike: row.strike,
          strikeLabel: `Strike ${formatStrike(row.strike)}`,
          intervalLabel: row.intervalLabel,
          expiryMs: row.expiryMs,
          expiryTimeLabel: formatExpiryTime(row.expiryMs, timeZone),
          observedAtMs: row.observedAtMs,
          heatScore: row.heatScore,
          actionLabel: isActionableCopy ? "Copy now" : "Watch next",
          status: isActionableCopy ? "copy_ready" : "watching",
          statusLabel: formatTradeTime(row.observedAtMs, nowMs),
        };
      }),
  };
}

export function selectTradeMarkets(
  preview: MarketHeatPreview,
  { nowMs = Date.now() }: SelectTradeMarketsOptions = {},
): MarketHeatAvailableMarket[] {
  if (preview.availableMarkets !== undefined) {
    return preview.availableMarkets;
  }

  const seen = new Set<string>();

  return preview.rows
    .filter((row) => row.expiryMs > nowMs)
    .map((row) => {
      const strike = parseFormattedUsd(row.strikeLabel.replace(/^Strike\s+/i, ""));

      return {
        id: `derived-${row.intervalLabel}-${row.expiryMs}-${strike}`,
        oracleId: row.id,
        pairLabel: row.pairLabel,
        intervalLabel: row.intervalLabel,
        expiry: row.expiryMs,
        expiryMs: row.expiryMs,
        expiryTimeLabel: row.expiryTimeLabel,
        strike,
        strikeRaw: strike,
        strikeLabel: formatStrike(strike),
        status: "active",
      };
    })
    .filter((market) => {
      const key = `${market.intervalLabel}:${market.expiryMs}:${market.strike}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return market.strike > 0;
    })
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        left.strike - right.strike ||
        left.id.localeCompare(right.id),
    );
}

export function buildTradeMarketLadder(
  preview: MarketHeatPreview,
  { nowMs = Date.now() }: SelectTradeMarketsOptions = {},
): TradeMarketLadderRow[] {
  return selectTradeMarkets(preview, { nowMs })
    .map((market) => {
      const activityRows = preview.rows.filter((row) => isActivityForMarket(row, market));
      const up = summarizeTradeMarketSide(activityRows, "UP");
      const down = summarizeTradeMarketSide(activityRows, "DOWN");
      const wallets = new Set(activityRows.map((row) => row.wallet));
      const strikes = new Set(activityRows.map((row) => row.strike));
      const volumeUsd = roundUsd(up.volumeUsd + down.volumeUsd);
      const volumeLabel = formatUsdAmount(volumeUsd);
      const tradeCount = activityRows.length;
      const strikeOptions = buildTradeStrikeOptions(market, activityRows);

      return {
        id: market.id,
        oracleId: market.oracleId,
        pairLabel: market.pairLabel,
        intervalLabel: market.intervalLabel,
        roundLabel: `${market.intervalLabel} round`,
        expiry: market.expiry,
        expiryMs: market.expiryMs,
        expiryTimeLabel: market.expiryTimeLabel,
        timeRemainingLabel: formatTimeRemaining(market.expiryMs, nowMs),
        strike: market.strike,
        strikeRaw: market.strikeRaw,
        strikeLabel: market.strikeLabel,
        moneynessLabel: formatMoneyness(
          market.strike - parseFormattedUsd(preview.marketPrice.priceLabel),
        ),
        activityLabel: formatTradeMarketActivity(wallets.size, tradeCount, volumeLabel),
        uniqueWalletCount: wallets.size,
        tradeCount,
        distinctStrikeCount: strikes.size,
        strikeOptions,
        volumeUsd,
        volumeLabel,
        up,
        down,
      };
    })
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        right.tradeCount - left.tradeCount ||
        Math.abs(left.strike - parseFormattedUsd(preview.marketPrice.priceLabel)) -
          Math.abs(right.strike - parseFormattedUsd(preview.marketPrice.priceLabel)) ||
        left.id.localeCompare(right.id),
    );
}

function buildTradeStrikeOptions(
  market: MarketHeatAvailableMarket,
  activityRows: MarketHeatPreviewRow[],
): TradeStrikeOption[] {
  const byStrikeRaw = new Map<number, TradeStrikeOption>();
  const addOption = (strike: number, strikeRaw = Math.round(strike * 1_000_000)) => {
    if (!Number.isFinite(strike) || strike <= 0 || !Number.isFinite(strikeRaw) || strikeRaw <= 0) {
      return;
    }

    byStrikeRaw.set(strikeRaw, {
      strike,
      strikeRaw,
      strikeLabel: formatStrike(strike),
    });
  };

  addOption(market.strike, market.strikeRaw);
  for (const row of activityRows) {
    addOption(row.strike);
  }

  return [...byStrikeRaw.values()].sort(
    (left, right) =>
      left.strike - right.strike ||
      left.strikeRaw - right.strikeRaw,
  );
}

export function sortMarketHeatRows(
  rows: MarketHeatPreviewRow[],
  sortMode: MarketHeatSortMode,
): MarketHeatPreviewRow[] {
  return [...rows].sort((left, right) => compareMarketHeatRows(left, right, sortMode));
}

export function selectVisibleMarketHeatRows(
  rows: MarketHeatPreviewRow[],
  {
    limit = 8,
    nowMs = Date.now(),
    showExpired = false,
    sortMode,
  }: SelectVisibleMarketHeatRowsOptions,
): MarketHeatPreviewRow[] {
  const eligibleRows = showExpired
    ? rows
    : rows.filter((row) => row.expiryMs > nowMs);

  return sortMarketHeatRows(eligibleRows, sortMode).slice(0, limit);
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
      ? "Ready for your wallet signature"
      : "We'll watch this wallet and prepare the next mint for your signature",
    statusLabel: row.statusLabel,
    title: `${isCopyReady ? "Copy" : "Watch"} ${row.displayName}`,
  };
}

export async function loadMarketHeatPreview({
  apiBaseUrl,
  fetcher = fetch,
  nowMs = Date.now(),
  timeZone,
}: LoadMarketHeatPreviewOptions = {}): Promise<MarketHeatPreview> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
    return buildCapturedMarketHeatPreview(nowMs, timeZone);
  }

  try {
    const response = await fetcher(buildMarketHeatUrl(normalizedBaseUrl));

    if (!response.ok) {
      return buildCapturedMarketHeatPreview(nowMs, timeZone);
    }

    const payload: unknown = await response.json();
    const rows = parseMarketHeatRows(payload);

    if (!rows) {
      return buildCapturedMarketHeatPreview(nowMs, timeZone);
    }

    const sourceLabel = formatMarketHeatSource(payload);
    const previewRows =
      sourceLabel === "Captured" ? refreshCapturedRows(rows, nowMs) : rows;
    const marketPrice = parseMarketHeatPrice(payload) ?? CAPTURED_MARKET_PRICE;
    const availableMarkets = parseAvailableMarkets(payload, marketPrice, timeZone);

    return {
      ...buildMarketHeatPreview(previewRows, MARKET_HEAT_CANDIDATE_LIMIT, {
        marketPrice,
        nowMs,
        timeZone,
      }),
      availableMarkets,
      sourceLabel,
    };
  } catch {
    return buildCapturedMarketHeatPreview(nowMs, timeZone);
  }
}

export async function loadTradeQuote({
  apiBaseUrl,
  fetcher = fetch,
  market,
  side,
  spendUsd,
}: LoadTradeQuoteOptions): Promise<TradeQuote | null> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
    return null;
  }

  const response = await fetcher(
    buildTradeQuoteUrl(normalizedBaseUrl, market, side, spendUsd),
  );
  if (!response.ok) {
    return null;
  }

  return parseTradeQuote(await response.json());
}

function buildMarketHeatUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/testnet/market-heat`;
}

function buildTradeQuoteUrl(
  apiBaseUrl: string,
  market: TradeMarketLadderRow,
  side: TradeQuoteSide,
  spendUsd: number,
): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/testnet/quote`);
  const estimatedPrice =
    side === "UP" ? market.up.estimatedPrice : market.down.estimatedPrice;

  url.searchParams.set("oracleId", market.oracleId);
  url.searchParams.set("expiry", String(market.expiry));
  url.searchParams.set("strike", String(market.strikeRaw));
  url.searchParams.set("side", side);
  url.searchParams.set("spendUsd", String(spendUsd));
  if (estimatedPrice !== undefined) {
    url.searchParams.set("estimatedPrice", String(estimatedPrice));
  }

  return url.toString();
}

function buildCapturedMarketHeatPreview(
  nowMs: number,
  timeZone?: string,
): MarketHeatPreview {
  return buildMarketHeatPreview(
    refreshCapturedRows(MARKET_HEAT_PREVIEW_ROWS, nowMs),
    MARKET_HEAT_CANDIDATE_LIMIT,
    { marketPrice: CAPTURED_MARKET_PRICE, nowMs, timeZone },
  );
}

function buildMarketHeatPrice(price: MarketHeatPriceInput): MarketHeatPrice {
  return {
    marketLabel: formatPair(price.market),
    priceLabel: formatUsd(price.price),
    statusLabel: formatMarketPriceSource(price.source),
  };
}

function isActivityForMarket(
  row: MarketHeatPreviewRow,
  market: MarketHeatAvailableMarket,
): boolean {
  if (row.oracleId && row.oracleId === market.oracleId) {
    return true;
  }

  return (
    row.pairLabel === market.pairLabel &&
    row.expiryMs === market.expiryMs &&
    row.intervalLabel === market.intervalLabel
  );
}

function summarizeTradeMarketSide(
  rows: MarketHeatPreviewRow[],
  side: "UP" | "DOWN",
): TradeMarketSideSummary {
  const sideRows = rows.filter((row) => row.side === side);
  const volumeUsd = roundUsd(
    sideRows.reduce((total, row) => total + (row.costUsd ?? 0), 0),
  );
  const payoutUsd = sideRows.reduce((total, row) => total + normalizeQuantityUsd(row), 0);
  const estimatedPrice =
    volumeUsd > 0 && payoutUsd > 0 ? roundPrice(volumeUsd / payoutUsd) : undefined;

  return {
    walletCount: new Set(sideRows.map((row) => row.wallet)).size,
    tradeCount: sideRows.length,
    volumeUsd,
    volumeLabel: formatUsdAmount(volumeUsd),
    ...(estimatedPrice === undefined ? {} : { estimatedPrice }),
  };
}

function normalizeQuantityUsd(row: MarketHeatPreviewRow): number {
  if (!isNonNegativeNumber(row.quantity) || row.quantity === 0) {
    return 0;
  }

  return row.quantity / 1_000_000;
}

function normalizeCostUsd(row: MarketHeatPreviewRowInput): number | undefined {
  if (isNonNegativeNumber(row.costUsd)) {
    return roundUsd(row.costUsd);
  }

  if (isNonNegativeNumber(row.cost)) {
    return roundUsd(row.cost / 1_000_000);
  }

  return undefined;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPrice(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function formatTradeMarketActivity(
  walletCount: number,
  tradeCount: number,
  volumeLabel: string,
): string {
  if (tradeCount === 0) {
    return "No recent trades";
  }

  return `${walletCount} ${pluralize(walletCount, "wallet")} · ${tradeCount} ${pluralize(
    tradeCount,
    "trade",
  )} · ${volumeLabel}`;
}

function formatTimeRemaining(expiryMs: number, nowMs: number): string {
  const remainingMs = expiryMs - nowMs;

  if (remainingMs <= 0) {
    return "Expired";
  }

  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m left`;
  }

  if (minutes < 36 * 60) {
    return `${Math.ceil(minutes / 60)}h left`;
  }

  return `${Math.ceil(minutes / (24 * 60))}d left`;
}

function formatMoneyness(diff: number): string {
  if (!Number.isFinite(diff) || diff === 0) {
    return "At spot";
  }

  const prefix = diff > 0 ? "+" : "-";
  return `${prefix}${formatUsdAmount(Math.abs(diff))} vs spot`;
}

function formatUsdAmount(value: number): string {
  if (!Number.isFinite(value)) {
    return "$0";
  }

  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  })}`;
}

function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function refreshCapturedRows(
  rows: MarketHeatPreviewRowInput[],
  nowMs: number,
): MarketHeatPreviewRowInput[] {
  return rows.map((row, index) => {
    const observedAtMs =
      nowMs - CAPTURED_ROW_BASE_AGE_MS - index * CAPTURED_ROW_AGE_STEP_MS;
    const durationMs = durationMsFromIntervalLabel(row.intervalLabel);

    return {
      ...row,
      observedAtMs,
      expiryMs:
        row.status === "copy_ready"
          ? nowMs + Math.max(durationMs / 2, 5 * 60_000)
          : observedAtMs + durationMs,
    };
  });
}

function durationMsFromIntervalLabel(intervalLabel: string): number {
  const match = /^(\d+)\s*([mhd])$/i.exec(intervalLabel.trim());

  if (!match) {
    return 15 * 60_000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "d") {
    return value * 24 * 60 * 60_000;
  }

  if (unit === "h") {
    return value * 60 * 60_000;
  }

  return value * 60_000;
}

function formatWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function formatManager(manager: string): string {
  const normalized = manager.replace(/^manager\s+/i, "").trim();

  if (!normalized) {
    return "Manager unknown";
  }

  if (normalized.includes("...")) {
    return `Manager ${normalized}`;
  }

  if (normalized.startsWith("0x") && normalized.length > 14) {
    return `Manager ${formatWallet(normalized)}`;
  }

  return manager;
}

function formatPair(market: string): string {
  return market.replace("-", "/");
}

function formatStrike(value: number): string {
  if (!Number.isFinite(value)) {
    return "unknown";
  }

  return `$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}`;
}

function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatExpiryTime(expiryMs: number, timeZone?: string): string {
  if (!Number.isFinite(expiryMs) || expiryMs <= 0) {
    return "Expiry unknown";
  }

  const expiry = new Date(expiryMs);
  const localLabel = formatExpiryWithIntl(expiry, timeZone) ?? formatExpiryWithIntl(expiry);

  return localLabel ?? "Expiry unknown";
}

function formatExpiryWithIntl(expiry: Date, timeZone?: string): string | null {
  try {
    const options: Intl.DateTimeFormatOptions = {
      day: "numeric",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "short",
      timeZoneName: "short",
    };

    if (timeZone) {
      options.timeZone = timeZone;
    }

    const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(expiry);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value;
    const month = getPart("month");
    const day = getPart("day");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const timeZoneName = getPart("timeZoneName");

    if (!month || !day || !hour || !minute || !timeZoneName) {
      return null;
    }

    return `${month} ${day}, ${hour}:${minute} ${timeZoneName}`;
  } catch {
    return null;
  }
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

function parseMarketHeatPrice(payload: unknown): MarketHeatPriceInput | null {
  if (!isRecord(payload) || !isRecord(payload.marketPrice)) {
    return null;
  }

  const { market, price, source } = payload.marketPrice;

  if (!isNonEmptyString(market) || !isNonNegativeNumber(price) || !isNonEmptyString(source)) {
    return null;
  }

  return { market, price, source };
}

function parseAvailableMarkets(
  payload: unknown,
  marketPrice: MarketHeatPriceInput,
  timeZone?: string,
): MarketHeatAvailableMarket[] | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const rawMarkets = Array.isArray(payload.markets)
    ? payload.markets
    : Array.isArray(payload.availableMarkets)
      ? payload.availableMarkets
      : undefined;

  if (!rawMarkets) {
    return undefined;
  }

  const markets = rawMarkets
    .map((market) => parseAvailableMarket(market, marketPrice, timeZone))
    .filter((market): market is MarketHeatAvailableMarket => market !== null)
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        left.strike - right.strike ||
        left.id.localeCompare(right.id),
    );

  return markets;
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

function parseAvailableMarket(
  value: unknown,
  marketPrice: MarketHeatPriceInput,
  timeZone?: string,
): MarketHeatAvailableMarket | null {
  if (!isRecord(value)) {
    return null;
  }

  const oracleId = isNonEmptyString(value.oracleId) ? value.oracleId : null;
  const market = isNonEmptyString(value.market) ? value.market : marketPrice.market;
  const intervalLabel = isNonEmptyString(value.intervalLabel) ? value.intervalLabel : null;
  const expiry = firstNonNegativeNumber([value.expiry, value.expiryMs]);
  const expiryMs = expiry === null ? null : normalizeEpochMs(expiry);
  const status = isNonEmptyString(value.status) ? value.status : "active";
  const strike = firstNonNegativeNumber([
    value.strikeCandidatePrice,
    value.strike,
    value.latestPrice,
    marketPrice.price,
  ]);
  const strikeRaw = firstNonNegativeNumber([
    value.strikeCandidate,
    value.strike,
    strike,
  ]);

  if (!oracleId || !intervalLabel || expiry === null || expiryMs === null || strike === null || strikeRaw === null) {
    return null;
  }

  return {
    id: isNonEmptyString(value.id) ? value.id : `${oracleId}-${expiryMs}`,
    oracleId,
    pairLabel: formatPair(market),
    intervalLabel,
    expiry,
    expiryMs,
    expiryTimeLabel: formatExpiryTime(expiryMs, timeZone),
    strike,
    strikeRaw,
    strikeLabel: formatStrike(strike),
    status,
  };
}

function parseTradeQuote(payload: unknown): TradeQuote | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    !isNonEmptyString(payload.source) ||
    !isNonEmptyString(payload.market) ||
    !isNonEmptyString(payload.oracleId) ||
    !isNonEmptyString(payload.expiry) ||
    !isNonEmptyString(payload.strike) ||
    (payload.side !== "UP" && payload.side !== "DOWN") ||
    !isNonNegativeNumber(payload.requestedSpendUsd) ||
    !isNonEmptyString(payload.cost) ||
    !isNonNegativeNumber(payload.costUsd) ||
    !isNonEmptyString(payload.quantity) ||
    !isNonNegativeNumber(payload.payoutUsd) ||
    !isNonNegativeNumber(payload.maxProfitUsd) ||
    !isNonEmptyString(payload.redeemPayout) ||
    !isNonNegativeNumber(payload.redeemPayoutUsd) ||
    !isNonNegativeNumber(payload.effectivePrice) ||
    payload.quoteStatus !== "ready"
  ) {
    return null;
  }

  return {
    source: payload.source,
    market: payload.market,
    oracleId: payload.oracleId,
    expiry: payload.expiry,
    strike: payload.strike,
    side: payload.side,
    requestedSpendUsd: payload.requestedSpendUsd,
    cost: payload.cost,
    costUsd: payload.costUsd,
    quantity: payload.quantity,
    payoutUsd: payload.payoutUsd,
    maxProfitUsd: payload.maxProfitUsd,
    redeemPayout: payload.redeemPayout,
    redeemPayoutUsd: payload.redeemPayoutUsd,
    effectivePrice: payload.effectivePrice,
    quoteStatus: payload.quoteStatus,
  };
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

function formatMarketPriceSource(source: string): string {
  if (source === "captured_testnet") {
    return "Captured";
  }

  return formatCompactLabel(source);
}

function parseFormattedUsd(value: string): number {
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeEpochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
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

function optionalNonNegativeNumber(value: unknown): number | undefined {
  return isNonNegativeNumber(value) ? value : undefined;
}

function firstNonNegativeNumber(values: unknown[]): number | null {
  for (const value of values) {
    if (isNonNegativeNumber(value)) {
      return value;
    }
  }

  return null;
}
