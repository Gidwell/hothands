import {
  loadHotHandsProfileNames,
  loadMainnetSuinsNames,
  mergeDemoWalletDisplayNames,
  resolveWalletDisplayName,
  type WalletDisplayNameSource,
  type WalletDisplayNamesByAddress,
} from "./suinsDisplayNames";
import { formatUtcTimeZoneLabel } from "./timeZoneLabels";

export type MarketHeatStatus = "copy_ready" | "watching";
export type MarketHeatSortMode = "latest" | "heat";
export type MarketHeatWalletStreakType = "win" | "loss" | "none";
export type MarketDurationOption = {
  count: number;
  label: string;
  value: string;
};

export type MarketHeatWalletStats = {
  totalPnl: number;
  currentStreakType: MarketHeatWalletStreakType;
  currentStreakLength: number;
  lastSeenMs: number;
};

export type MarketHeatCopyAttribution = {
  count: number;
  amountUsd: number;
  copyCount?: number;
  fadeCount?: number;
  copyAmountUsd?: number;
  fadeAmountUsd?: number;
};

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
  strikeRaw?: number;
  expiryMs: number;
  intervalLabel: string;
  observedAtMs: number;
  heatScore: number;
  status: MarketHeatStatus;
  walletStats?: MarketHeatWalletStats;
  copyAttribution?: MarketHeatCopyAttribution;
  fillCount?: number;
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
  strikeRaw?: unknown;
  strikeCandidate?: unknown;
  strikeCandidatePrice?: unknown;
  minStrike?: unknown;
  tickSize?: unknown;
  latestPrice?: unknown;
  pricingModel?: unknown;
  status?: unknown;
};

export type MarketHeatPricingModel = {
  forward: number;
  forwardPrice: number;
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
  timestampMs: number;
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
  minStrikeRaw?: number;
  tickSizeRaw?: number;
  latestPrice?: number;
  latestPriceTimestampMs?: number;
  latestPriceCheckpoint?: number;
  status: string;
  pricingModel?: MarketHeatPricingModel;
};

export type MarketHeatPreviewRow = {
  id: string;
  oracleId?: string;
  wallet: string;
  displayName: string;
  displayNameSource?: WalletDisplayNameSource;
  manager: string;
  pairLabel: string;
  side: "UP" | "DOWN";
  quantity?: number;
  cost?: number;
  costUsd?: number;
  strike: number;
  strikeRaw?: number;
  strikeLabel: string;
  intervalLabel: string;
  expiryMs: number;
  expiryTimeLabel: string;
  timeRemainingLabel?: string;
  observedAtMs: number;
  heatScore: number;
  heatScoreLabel: string;
  entryPrice?: number;
  entryPriceLabel?: string;
  currentPrice?: number;
  currentPriceLabel?: string;
  entryNowTone?: "up" | "down" | "flat" | "unknown";
  walletStats?: MarketHeatWalletStats;
  walletStatsLabel?: string;
  copyAttribution?: MarketHeatCopyAttribution;
  copyAttributionLabel?: string;
  fillCount?: number;
  actionLabel: "Copy now";
  status: MarketHeatStatus;
  statusLabel: string;
};

export type MarketHeatIntentMode = "copy" | "fade";

export type MarketHeatIntentState = {
  mode?: MarketHeatIntentMode;
  selectedRowId: string | null;
};

export type MarketHeatIntentPanel = {
  actionLabel: "Copy now" | "Fade now";
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
  feedCursor?: string;
  sourceLabel: string;
  marketPrice: MarketHeatPrice;
  availableMarkets?: MarketHeatAvailableMarket[];
  rows: MarketHeatPreviewRow[];
};

type MarketHeatPreviewRowBuildOptions = {
  nowMs: number;
  timeZone?: string;
  walletDisplayNames: WalletDisplayNamesByAddress;
};

export type LoadMarketHeatPreviewOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  includeExpired?: boolean;
  nowMs?: number;
  timeZone?: string;
  useDemoDisplayNames?: boolean;
  useHotHandsProfileNames?: boolean;
  useMainnetSuinsNames?: boolean;
};

export type LoadMarketHeatPriceSnapshotOptions = LoadMarketHeatPreviewOptions;
export type LoadMarketHeatFeedUpdatesOptions = LoadMarketHeatPreviewOptions;

export type BuildMarketHeatPreviewOptions = {
  marketPrice?: MarketHeatPriceInput;
  nowMs?: number;
  timeZone?: string;
  walletDisplayNames?: WalletDisplayNamesByAddress;
};

export type DemoMarketHeatPreviewOptions = {
  marketPriceLabel?: string | null;
  nowMs?: number;
  strikeAnchorPriceLabel?: string | null;
  timeZone?: string;
};

export type SelectVisibleMarketHeatRowsOptions = {
  diversifyWallets?: boolean;
  intervalLabel?: string | null;
  limit?: number;
  nowMs?: number;
  showExpired?: boolean;
  sortMode: MarketHeatSortMode;
};

export type SelectTradeMarketsOptions = {
  intervalLabel?: string | null;
  nowMs?: number;
  spotPriceLabel?: string | null;
};

export type TradeMarketSideSummary = {
  walletCount: number;
  tradeCount: number;
  volumeUsd: number;
  volumeLabel: string;
  estimatedPrice?: number;
};

export type TradeStrikeOption = {
  profile?: TradeRiskProfile;
  side?: TradeQuoteSide;
  strike: number;
  strikeRaw: number;
  strikeLabel: string;
  targetPrice?: number;
  payoutMultiple?: number;
  upEstimatedPrice?: number;
  downEstimatedPrice?: number;
};

export type TradeRiskProfile = "standard" | "conservative" | "risky";

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
  minStrikeRaw?: number;
  tickSizeRaw?: number;
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
  pricingModel?: MarketHeatPricingModel;
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

export type MarketHeatCopyTrade = {
  row: MarketHeatPreviewRow;
  market: TradeMarketLadderRow;
};

export type LoadTradeQuoteOptions = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  market: TradeMarketLadderRow;
  side: TradeQuoteSide;
  spendUsd: number;
  timeoutMs?: number;
};

const MARKET_HEAT_CANDIDATE_LIMIT = 768;
const TRADE_QUOTE_TIMEOUT_MS = 6_000;
const TRADE_SYNTHETIC_STRIKE_STEPS_PER_SIDE = 12;
const TRADE_TARGET_SYNTHETIC_PRICE_STEP = 0.075;
const TRADE_FALLBACK_DISPLAY_STRIKE_STEP_USD = 500;
const TRADE_MAX_SYNTHETIC_SEARCH_TICKS = 50_000;
const TRADE_RISK_PROFILES: readonly {
  profile: TradeRiskProfile;
  targetPrice: number;
  payoutMultiple: number;
}[] = [
  { profile: "standard", targetPrice: 0.5, payoutMultiple: 2 },
  { profile: "conservative", targetPrice: 2 / 3, payoutMultiple: 1.5 },
  { profile: "risky", targetPrice: 0.25, payoutMultiple: 4 },
];
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
    walletDisplayNames = {},
  }: BuildMarketHeatPreviewOptions = {},
): MarketHeatPreview {
  const previewRows = sortMarketHeatInputs(dedupeMarketHeatInputs(rows))
    .slice(0, limit)
    .map((row) =>
      buildMarketHeatPreviewRowFromInput(row, {
        nowMs,
        timeZone,
        walletDisplayNames,
      }),
    );

  return {
    title: "Alpha Feed",
    modeLabel: "Testnet",
    actionLabel: "Copy",
    detailLabel: "Live BTC Predict mints",
    sourceLabel: "Captured",
    marketPrice: buildMarketHeatPrice(marketPrice),
    rows: annotateMarketHeatRowPrices(previewRows),
  };
}

export function withDemoMarketHeatPreview(
  preview: MarketHeatPreview,
  {
    marketPriceLabel,
    nowMs = Date.now(),
    strikeAnchorPriceLabel,
    timeZone,
  }: DemoMarketHeatPreviewOptions = {},
): MarketHeatPreview {
  const baseMarkets = (preview.availableMarkets ?? []).filter(
    (market) => !isDemoMarketId(market.id),
  );
  const baseRows = preview.rows.filter((row) => !isDemoMarketId(row.id));
  const marketPrice = Math.max(
    1,
    parseFormattedUsd(marketPriceLabel ?? preview.marketPrice.priceLabel),
  );
  const strikeAnchorPrice = Math.max(
    1,
    parseFormattedUsd(strikeAnchorPriceLabel ?? preview.marketPrice.priceLabel),
  );
  const demoContext = buildDemoMarketHeatContext(
    marketPrice,
    nowMs,
    timeZone,
    strikeAnchorPrice,
    baseMarkets,
  );
  const demoMarkets = demoContext.markets.filter(
    (market) =>
      !isPacificDailyExpiry(market.expiryMs) ||
      !baseMarkets.some((baseMarket) => isPacificDailyExpiry(baseMarket.expiryMs)),
  );
  const demoRows = demoContext.rows
    .map((row) =>
      buildMarketHeatPreviewRowFromInput(row, {
        nowMs,
        timeZone,
        walletDisplayNames: demoContext.walletDisplayNames,
      }),
    );
  const availableMarkets = [...demoMarkets, ...baseMarkets];

  return {
    ...preview,
    availableMarkets,
    rows: annotateMarketHeatRowPrices([...demoRows, ...baseRows], availableMarkets),
  };
}

const DEMO_MARKET_ID_PREFIX = "demo-";
const DEMO_STRIKE_SCALE = 1_000_000;
const DEMO_STRIKE_TICK_USD = 25;
const DEMO_STRIKE_TICK_RAW = DEMO_STRIKE_TICK_USD * DEMO_STRIKE_SCALE;
const DEMO_PRICING_MODEL_A = 500_000;
const DEMO_PRICING_MODEL_B = 20_000_000;
const DEMO_PRICING_MODEL_SIGMA = 20_000_000;
const DEMO_15M_UP_STRIKE_OFFSETS: readonly number[] = [
  25,
  50,
  0,
  75,
  25,
  50,
  100,
  0,
];
const DEMO_15M_DOWN_STRIKE_OFFSETS: readonly number[] = [
  -25,
  -50,
  0,
  -75,
  -25,
  -50,
  -100,
  0,
];
const DEMO_1H_UP_STRIKE_OFFSETS: readonly number[] = [
  100,
  200,
  0,
  300,
  100,
  200,
  400,
  0,
];
const DEMO_1H_DOWN_STRIKE_OFFSETS: readonly number[] = [
  -100,
  -200,
  0,
  -300,
  -100,
  -200,
  -400,
  0,
];

type DemoWalletIdentity = {
  displayName?: string;
  source?: WalletDisplayNameSource;
  wallet: string;
};

type DemoPositionSpec = {
  attribution?: MarketHeatCopyAttribution;
  heatScore: number;
  identityIndex: number;
  observedAgoMs: number;
  quantityUsd: number;
  roi: number;
  side: "UP" | "DOWN";
  streakLength: number;
  streakType: MarketHeatWalletStreakType;
  strikeOffset: number;
  totalPnlAtomic: number;
};

const DEMO_IDENTITIES: readonly DemoWalletIdentity[] = [
  { displayName: "momentum", source: "hot_hands_profile", wallet: demoWallet("1001") },
  { displayName: "breakout.sui", source: "mainnet_suins", wallet: demoWallet("2002") },
  { wallet: demoWallet("3003") },
  { displayName: "candles", source: "hot_hands_profile", wallet: demoWallet("4004") },
  { displayName: "oracle.sui", source: "mainnet_suins", wallet: demoWallet("5005") },
  { wallet: demoWallet("6006") },
  { displayName: "reversal", source: "hot_hands_profile", wallet: demoWallet("7007") },
  { displayName: "strike.sui", source: "mainnet_suins", wallet: demoWallet("8008") },
  { wallet: demoWallet("9009") },
  { displayName: "conviction", source: "hot_hands_profile", wallet: demoWallet("a00a") },
  { displayName: "tempo.sui", source: "mainnet_suins", wallet: demoWallet("b00b") },
  { wallet: demoWallet("c00c") },
  { displayName: "edge", source: "hot_hands_profile", wallet: demoWallet("d00d") },
  { displayName: "volatility.sui", source: "mainnet_suins", wallet: demoWallet("e00e") },
  { wallet: demoWallet("f00f") },
  { displayName: "fade desk", source: "hot_hands_profile", wallet: demoWallet("1100") },
  { displayName: "uponly.sui", source: "mainnet_suins", wallet: demoWallet("2200") },
  { wallet: demoWallet("3300") },
  { displayName: "basis", source: "hot_hands_profile", wallet: demoWallet("4400") },
  { displayName: "counter.sui", source: "mainnet_suins", wallet: demoWallet("5500") },
];

const DEMO_15M_POSITIONS: readonly DemoPositionSpec[] = [
  demoPosition(0, "UP", -450, 52, 80, 0.24, 70_000, "win", 5, 28_450_000),
  demoPosition(1, "DOWN", 250, 76, 55, 0.18, 2 * 60_000, "win", 2, 12_100_000),
  demoPosition(2, "UP", 700, 44, 36, 0.31, 3 * 60_000, "loss", 1, -4_800_000),
  demoPosition(3, "DOWN", 900, 64, 120, 0.19, 4 * 60_000, "win", 4, 22_900_000),
  demoPosition(4, "UP", -150, 82, 45, 0.08, 5 * 60_000, "win", 1, 6_200_000),
  demoPosition(5, "DOWN", -600, 35, 32, 0.14, 6 * 60_000, "loss", 2, -9_100_000),
  demoPosition(6, "UP", 350, 58, 95, 0.36, 7 * 60_000, "win", 6, 41_700_000),
  demoPosition(7, "DOWN", 100, 68, 62, -0.22, 8 * 60_000, "loss", 1, -11_450_000),
  demoPosition(8, "UP", -900, 47, 28, 0.09, 9 * 60_000, "none", 0, 1_800_000),
  demoPosition(9, "DOWN", 1200, 61, 75, 0.27, 10 * 60_000, "win", 3, 18_600_000),
  demoPosition(10, "UP", 0, 27, 50, -0.12, 11 * 60_000, "loss", 1, -6_300_000),
  demoPosition(11, "DOWN", -250, 50, 40, 0.05, 12 * 60_000, "loss", 3, -14_800_000),
  demoPosition(12, "UP", 1100, 38, 66, 0.42, 13 * 60_000, "win", 2, 9_900_000),
  demoPosition(13, "DOWN", 500, 55, 52, -0.15, 14 * 60_000, "none", 0, 750_000),
  demoPosition(14, "UP", -1200, 31, 88, 0.17, 15 * 60_000, "win", 2, 16_300_000),
  demoPosition(15, "DOWN", -50, 41, 34, -0.09, 16 * 60_000, "loss", 2, -7_600_000),
];

const DEMO_1H_POSITIONS: readonly DemoPositionSpec[] = [
  demoPosition(16, "DOWN", 1500, 40, 100, 0.22, 2 * 60_000, "win", 4, 31_200_000),
  demoPosition(17, "UP", -700, 72, 60, 0.05, 4 * 60_000, "loss", 1, -5_250_000),
  demoPosition(18, "DOWN", -1000, 53, 42, 0.29, 6 * 60_000, "win", 2, 8_760_000),
  demoPosition(19, "UP", 250, 62, 30, -0.16, 8 * 60_000, "loss", 3, -16_700_000),
  demoPosition(0, "DOWN", 400, 79, 85, 0.11, 10 * 60_000, "win", 5, 24_100_000),
  demoPosition(1, "UP", -1300, 30, 110, 0.34, 12 * 60_000, "win", 7, 49_400_000),
  demoPosition(2, "DOWN", 900, 66, 38, 0.21, 14 * 60_000, "loss", 1, -8_900_000),
  demoPosition(3, "UP", 1600, 50, 55, 0.48, 16 * 60_000, "win", 2, 11_450_000),
  demoPosition(4, "DOWN", -400, 47, 25, 0.03, 18 * 60_000, "none", 0, -1_000_000),
  demoPosition(5, "UP", -250, 56, 72, 0.13, 20 * 60_000, "win", 3, 17_800_000),
  demoPosition(6, "DOWN", 2100, 22, 48, 0.38, 22 * 60_000, "win", 1, 6_900_000),
  demoPosition(7, "UP", 800, 37, 34, -0.25, 24 * 60_000, "loss", 4, -22_300_000),
  demoPosition(8, "DOWN", 50, 34, 90, 0.08, 26 * 60_000, "win", 2, 19_250_000),
  demoPosition(9, "UP", -1800, 59, 64, 0.18, 28 * 60_000, "win", 1, 7_400_000),
  demoPosition(10, "DOWN", -1500, 26, 44, -0.11, 30 * 60_000, "loss", 2, -10_050_000),
  demoPosition(11, "UP", 500, 44, 58, 0.21, 32 * 60_000, "win", 3, 13_600_000),
];

type DemoMarketHeatContext = {
  markets: MarketHeatAvailableMarket[];
  rows: MarketHeatPreviewRowInput[];
  walletDisplayNames: WalletDisplayNamesByAddress;
};

function buildDemoMarketHeatContext(
  marketPrice: number,
  nowMs: number,
  timeZone?: string,
  strikeAnchorPrice = marketPrice,
  baseMarkets: readonly MarketHeatAvailableMarket[] = [],
): DemoMarketHeatContext {
  const baseStrike = roundToDemoStrike(strikeAnchorPrice);
  const fifteenMinuteExpiryMs = nextAlignedExpiryMs(nowMs, 15 * 60_000);
  const hourlyExpiryMs = nextAlignedExpiryMs(nowMs, 60 * 60_000);
  const realFifteenMinuteMarket = selectDemoBaseMarket(baseMarkets, "15m", nowMs);
  const realHourlyMarket = selectDemoBaseMarket(baseMarkets, "1h", nowMs);
  const syntheticFifteenMinuteMarket =
    realFifteenMinuteMarket ??
    buildDemoAvailableMarket({
      expiryMs: fifteenMinuteExpiryMs,
      intervalLabel: "15m",
      marketPrice,
      nowMs,
      strike: baseStrike,
      timeZone,
    });
  const hourlyMarket =
    realHourlyMarket ??
    (hourlyExpiryMs === syntheticFifteenMinuteMarket.expiryMs
      ? syntheticFifteenMinuteMarket
      : buildDemoAvailableMarket({
          expiryMs: hourlyExpiryMs,
          intervalLabel: "1h",
          marketPrice,
          nowMs,
          strike: baseStrike,
          timeZone,
        }));
  const markets = [
    realFifteenMinuteMarket ? null : syntheticFifteenMinuteMarket,
    realHourlyMarket || hourlyMarket.oracleId === syntheticFifteenMinuteMarket.oracleId
      ? null
      : hourlyMarket,
  ].filter(
    (market): market is MarketHeatAvailableMarket => market !== null,
  );
  const shouldBuildHourlyRows =
    hourlyMarket.oracleId !== syntheticFifteenMinuteMarket.oracleId;

  return {
    markets,
    rows: [
      ...buildDemoMarketHeatRowsForMarket({
        intervalLabel: "15m",
        market: syntheticFifteenMinuteMarket,
        marketPrice,
        nowMs,
        specs: DEMO_15M_POSITIONS,
        strikeAnchorPrice,
      }),
      ...(shouldBuildHourlyRows
        ? buildDemoMarketHeatRowsForMarket({
            intervalLabel: "1h",
            market: hourlyMarket,
            marketPrice,
            nowMs,
            specs: DEMO_1H_POSITIONS,
            strikeAnchorPrice,
          })
        : []),
    ],
    walletDisplayNames: buildDemoWalletDisplayNames(),
  };
}

function demoPosition(
  identityIndex: number,
  side: "UP" | "DOWN",
  strikeOffset: number,
  heatScore: number,
  quantityUsd: number,
  roi: number,
  observedAgoMs: number,
  streakType: MarketHeatWalletStreakType,
  streakLength: number,
  totalPnlAtomic: number,
  attribution?: MarketHeatCopyAttribution,
): DemoPositionSpec {
  return {
    ...(attribution ? { attribution } : {}),
    heatScore,
    identityIndex,
    observedAgoMs,
    quantityUsd,
    roi,
    side,
    streakLength,
    streakType,
    strikeOffset,
    totalPnlAtomic,
  };
}

function buildDemoMarketHeatRowsForMarket({
  intervalLabel,
  market,
  marketPrice,
  nowMs,
  specs,
  strikeAnchorPrice,
}: {
  intervalLabel: "15m" | "1h";
  market: MarketHeatAvailableMarket;
  marketPrice: number;
  nowMs: number;
  specs: readonly DemoPositionSpec[];
  strikeAnchorPrice: number;
}): MarketHeatPreviewRowInput[] {
  return specs.map((spec, index) => {
    const identity = DEMO_IDENTITIES[spec.identityIndex % DEMO_IDENTITIES.length];
    const strikeOffset = getDemoStrikeOffset(intervalLabel, spec.side, index);
    const fallbackStrikeRaw = toDemoMarketStrikeRaw(
      market,
      strikeAnchorPrice + (strikeOffset ?? spec.strikeOffset),
    );
    const strikeRaw = fallbackStrikeRaw;
    const strike = toDemoMarketStrike(market, strikeRaw);
    const currentPrice = estimateDemoMarketHeatRowPrice(market, spec.side, strikeRaw);
    const entryPrice = clampDemoPositionPrice(currentPrice / (1 + spec.roi));
    const costUsd = roundUsd(spec.quantityUsd * entryPrice);

    return buildDemoMarketHeatRow({
      attribution: spec.attribution,
      costUsd,
      heatScore: spec.heatScore,
      intervalLabel,
      market,
      nowMs,
      observedAgoMs: spec.observedAgoMs,
      quantityUsd: spec.quantityUsd,
      side: spec.side,
      streakLength: spec.streakLength,
      streakType: spec.streakType,
      strike,
      strikeRaw,
      totalPnlAtomic: spec.totalPnlAtomic,
      wallet: identity.wallet,
    });
  });
}

function getDemoStrikeOffset(
  intervalLabel: "15m" | "1h",
  side: "UP" | "DOWN",
  index: number,
): number {
  const offsets =
    intervalLabel === "15m"
      ? side === "UP"
        ? DEMO_15M_UP_STRIKE_OFFSETS
        : DEMO_15M_DOWN_STRIKE_OFFSETS
      : side === "UP"
        ? DEMO_1H_UP_STRIKE_OFFSETS
        : DEMO_1H_DOWN_STRIKE_OFFSETS;

  return offsets[index % offsets.length] ?? 0;
}

function selectDemoBaseMarket(
  baseMarkets: readonly MarketHeatAvailableMarket[],
  bucket: "15m" | "1h",
  nowMs: number,
): MarketHeatAvailableMarket | null {
  const activeMarkets = baseMarkets
    .filter((market) => market.expiryMs > nowMs)
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        Math.abs((left.latestPrice ?? left.pricingModel?.forwardPrice ?? 0) - left.strike) -
          Math.abs((right.latestPrice ?? right.pricingModel?.forwardPrice ?? 0) - right.strike) ||
        left.id.localeCompare(right.id),
    );

  if (bucket === "15m") {
    const cutoffMs = nowMs + 15 * 60_000;
    return activeMarkets.find((market) => market.expiryMs <= cutoffMs) ?? null;
  }

  const cutoffMs = nowMs + 2 * 60 * 60_000;
  return (
    activeMarkets.find(
      (market) => market.expiryMs <= cutoffMs && isPacificHourlyExpiry(market.expiryMs),
    ) ?? null
  );
}

function buildDemoWalletDisplayNames(): WalletDisplayNamesByAddress {
  return DEMO_IDENTITIES.reduce<WalletDisplayNamesByAddress>((displayNames, identity) => {
    if (identity.displayName && identity.source) {
      displayNames[identity.wallet] = {
        name: identity.displayName,
        source: identity.source,
      };
    }

    return displayNames;
  }, {});
}

function isDemoMarketId(id: string): boolean {
  return id.startsWith(DEMO_MARKET_ID_PREFIX);
}

function buildDemoAvailableMarket({
  expiryMs,
  intervalLabel,
  marketPrice,
  nowMs,
  strike,
  timeZone,
}: {
  expiryMs: number;
  intervalLabel: "15m" | "1h";
  marketPrice: number;
  nowMs: number;
  strike: number;
  timeZone?: string;
}): MarketHeatAvailableMarket {
  const strikeRaw = toDemoStrikeRaw(strike);
  const id = `${DEMO_MARKET_ID_PREFIX}${intervalLabel}-${expiryMs}`;

  return {
    id,
    oracleId: `${id}-oracle`,
    pairLabel: "BTC/USD",
    intervalLabel,
    expiry: expiryMs,
    expiryMs,
    expiryTimeLabel: formatExpiryTime(expiryMs, timeZone),
    strike,
    strikeRaw,
    strikeLabel: formatStrike(strike),
    minStrikeRaw: Math.max(DEMO_STRIKE_TICK_RAW, toDemoStrikeRaw(strike - 10_000)),
    tickSizeRaw: DEMO_STRIKE_TICK_RAW,
    latestPrice: marketPrice,
    latestPriceTimestampMs: nowMs,
    status: "active",
    pricingModel: {
      a: DEMO_PRICING_MODEL_A,
      b: DEMO_PRICING_MODEL_B,
      forward: toDemoStrikeRaw(marketPrice),
      forwardPrice: marketPrice,
      m: 0,
      rho: 0,
      sigma: DEMO_PRICING_MODEL_SIGMA,
      timestampMs: nowMs,
    },
  };
}

function buildDemoMarketHeatRow({
  attribution,
  costUsd,
  heatScore,
  intervalLabel,
  market,
  nowMs,
  observedAgoMs,
  quantityUsd,
  side,
  streakLength,
  streakType,
  strike,
  strikeRaw,
  totalPnlAtomic,
  wallet,
}: {
  attribution?: MarketHeatCopyAttribution;
  costUsd: number;
  heatScore: number;
  intervalLabel: "15m" | "1h";
  market: MarketHeatAvailableMarket;
  nowMs: number;
  observedAgoMs: number;
  quantityUsd: number;
  side: "UP" | "DOWN";
  streakLength: number;
  streakType: MarketHeatWalletStreakType;
  strike: number;
  strikeRaw: number;
  totalPnlAtomic: number;
  wallet: string;
}): MarketHeatPreviewRowInput {
  const normalizedCostUsd = roundUsd(costUsd);
  const normalizedQuantityUsd = Math.max(quantityUsd, normalizedCostUsd);
  const rowKey = `${intervalLabel}-${market.expiryMs}-${wallet.slice(2, 8)}-${side}-${strikeRaw}`;

  return {
    id: `${DEMO_MARKET_ID_PREFIX}${rowKey}`,
    oracleId: market.oracleId,
    wallet,
    manager: `manager ${wallet.slice(0, 8)}...${wallet.slice(-4)}`,
    market: "BTC-USD",
    side,
    quantity: Math.round(normalizedQuantityUsd * 1_000_000),
    cost: Math.round(normalizedCostUsd * 1_000_000),
    costUsd: normalizedCostUsd,
    strike,
    strikeRaw,
    expiryMs: market.expiryMs,
    intervalLabel,
    observedAtMs: Math.max(0, Math.min(nowMs - observedAgoMs, market.expiryMs - 1)),
    heatScore,
    status: "copy_ready",
    walletStats: {
      currentStreakLength: streakLength,
      currentStreakType: streakType,
      lastSeenMs: Math.max(0, nowMs - observedAgoMs),
      totalPnl: totalPnlAtomic,
    },
    ...(attribution ? { copyAttribution: attribution } : {}),
  };
}

function estimateDemoMarketHeatRowPrice(
  market: MarketHeatAvailableMarket,
  side: "UP" | "DOWN",
  strikeRaw: number,
): number {
  const up = computeOracleIndicativeUpPrice(market.pricingModel, strikeRaw);
  const price =
    side === "UP" ? up : up === undefined ? undefined : roundPrice(Math.max(0, 1 - up));

  return clampDemoPositionPrice(price ?? 0.5);
}

function toDemoMarketStrikeRaw(
  market: Pick<MarketHeatAvailableMarket, "minStrikeRaw" | "strike" | "strikeRaw" | "tickSizeRaw">,
  strike: number,
): number {
  const scale = computeStrikeRawScale(market) ?? DEMO_STRIKE_SCALE;
  const tickSizeRaw = market.tickSizeRaw;
  const minStrikeRaw = market.minStrikeRaw ?? tickSizeRaw ?? DEMO_STRIKE_TICK_RAW;
  const raw = Math.round(Math.max(DEMO_STRIKE_TICK_USD, strike) * scale);

  if (tickSizeRaw === undefined || !Number.isFinite(tickSizeRaw) || tickSizeRaw <= 0) {
    return Math.max(minStrikeRaw, raw);
  }

  const tickAlignedRaw = Math.round(raw / tickSizeRaw) * tickSizeRaw;

  return Math.max(minStrikeRaw, tickAlignedRaw);
}

function toDemoMarketStrike(
  market: Pick<MarketHeatAvailableMarket, "strike" | "strikeRaw">,
  strikeRaw: number,
): number {
  const scale = computeStrikeRawScale(market) ?? DEMO_STRIKE_SCALE;

  return roundSyntheticStrike(strikeRaw / scale);
}

function clampDemoPositionPrice(price: number): number {
  if (!Number.isFinite(price)) {
    return 0.5;
  }

  return roundPrice(Math.max(0.05, Math.min(0.95, price)));
}

function nextAlignedExpiryMs(nowMs: number, intervalMs: number): number {
  return Math.ceil((nowMs + 1000) / intervalMs) * intervalMs;
}

function roundToDemoStrike(price: number): number {
  return Math.max(
    DEMO_STRIKE_TICK_USD,
    Math.round(price / DEMO_STRIKE_TICK_USD) * DEMO_STRIKE_TICK_USD,
  );
}

function toDemoStrikeRaw(strike: number): number {
  return Math.round(strike * DEMO_STRIKE_SCALE);
}

function demoWallet(seed: string): string {
  const hex = seed.replace(/[^0-9a-f]/gi, "").toLowerCase();
  const prefix = hex || "0";
  return `0x${prefix.padEnd(64, "0").slice(0, 64)}`;
}

const DEMO_PACIFIC_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

function isPacificDailyExpiry(expiryMs: number): boolean {
  const parts = DEMO_PACIFIC_TIME_FORMATTER.formatToParts(expiryMs);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour === 1 && minute === 0;
}

function isPacificHourlyExpiry(expiryMs: number): boolean {
  const parts = DEMO_PACIFIC_TIME_FORMATTER.formatToParts(expiryMs);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return minute === 0;
}

function buildMarketHeatPreviewRowFromInput(
  row: MarketHeatPreviewRowInput,
  {
    nowMs,
    timeZone,
    walletDisplayNames,
  }: MarketHeatPreviewRowBuildOptions,
): MarketHeatPreviewRow {
  const isActionableCopy = row.status === "copy_ready" && row.expiryMs > nowMs;
  const oracleId = isNonEmptyString(row.oracleId) ? row.oracleId : undefined;
  const quantity = optionalNonNegativeNumber(row.quantity);
  const cost = optionalNonNegativeNumber(row.cost);
  const costUsd = normalizeCostUsd(row);
  const strikeRaw = optionalNonNegativeNumber(row.strikeRaw);
  const walletDisplayName = resolveWalletDisplayName(row.wallet, walletDisplayNames);
  const fillCount = Math.max(1, Math.floor(row.fillCount ?? 1));
  const copyAttribution = normalizeCopyAttribution(row.copyAttribution);

  const previewRow: MarketHeatPreviewRow = {
    id: row.id,
    ...(oracleId === undefined ? {} : { oracleId }),
    wallet: row.wallet,
    displayName: walletDisplayName?.name ?? formatWallet(row.wallet),
    ...(walletDisplayName ? { displayNameSource: walletDisplayName.source } : {}),
    manager: formatManager(row.manager),
    pairLabel: formatPair(row.market),
    side: row.side,
    ...(quantity === undefined ? {} : { quantity }),
    ...(cost === undefined ? {} : { cost }),
    ...(costUsd === undefined ? {} : { costUsd }),
    strike: row.strike,
    ...(strikeRaw === undefined ? {} : { strikeRaw }),
    strikeLabel: `Strike ${formatStrike(row.strike)}`,
    intervalLabel: row.intervalLabel,
    expiryMs: row.expiryMs,
    expiryTimeLabel: formatExpiryTime(row.expiryMs, timeZone),
    timeRemainingLabel: formatTimeRemaining(row.expiryMs, nowMs),
    observedAtMs: row.observedAtMs,
    heatScore: row.heatScore,
    heatScoreLabel: formatHeatScoreLabel(row),
    ...(fillCount > 1 ? { fillCount } : {}),
    ...(row.walletStats === undefined
      ? {}
      : {
          walletStats: row.walletStats,
          walletStatsLabel: formatWalletStatsLabel(
            row.walletStats,
            row.observedAtMs,
            nowMs,
          ),
        }),
    ...(copyAttribution === undefined
      ? {}
      : {
          copyAttribution,
          copyAttributionLabel: formatCopyAttributionSummary(copyAttribution),
        }),
    actionLabel: "Copy now",
    status: isActionableCopy ? "copy_ready" : "watching",
    statusLabel: formatTradeTime(row.observedAtMs, nowMs),
  };

  return annotateMarketHeatRowPrice(previewRow);
}

function normalizeCopyAttribution(
  attribution: MarketHeatCopyAttribution | undefined,
): MarketHeatCopyAttribution | undefined {
  if (!attribution) {
    return undefined;
  }

  const count = Math.floor(attribution.count);
  const amountUsd = attribution.amountUsd;
  const copyCount = optionalNonNegativeInteger(attribution.copyCount);
  const fadeCount = optionalNonNegativeInteger(attribution.fadeCount);
  const copyAmountUsd = optionalNonNegativeNumber(attribution.copyAmountUsd);
  const fadeAmountUsd = optionalNonNegativeNumber(attribution.fadeAmountUsd);

  if (count <= 0 || !Number.isFinite(amountUsd) || amountUsd < 0) {
    return undefined;
  }

  return {
    amountUsd,
    count,
    ...(copyCount === undefined ? {} : { copyCount }),
    ...(fadeCount === undefined ? {} : { fadeCount }),
    ...(copyAmountUsd === undefined ? {} : { copyAmountUsd }),
    ...(fadeAmountUsd === undefined ? {} : { fadeAmountUsd }),
  };
}

function formatCopyAttributionSummary(attribution: MarketHeatCopyAttribution): string {
  const copyCount = Math.max(0, Math.floor(attribution.copyCount ?? attribution.count));
  const fadeCount = Math.max(0, Math.floor(attribution.fadeCount ?? 0));
  const labels = [
    copyCount > 0 ? `${copyCount.toLocaleString("en-US")}C` : null,
    fadeCount > 0 ? `${fadeCount.toLocaleString("en-US")}F` : null,
  ].filter((label): label is string => Boolean(label));

  return labels.length ? labels.join("/") : "0C";
}

export function formatMarketHeatCopyAttributionDetailLabel(
  attribution: MarketHeatCopyAttribution,
): string {
  const copyCount = Math.max(0, Math.floor(attribution.copyCount ?? attribution.count));
  const fadeCount = Math.max(0, Math.floor(attribution.fadeCount ?? 0));
  const labels = [
    copyCount > 0
      ? `${copyCount.toLocaleString("en-US")} ${copyCount === 1 ? "copy" : "copies"}`
      : null,
    fadeCount > 0
      ? `${fadeCount.toLocaleString("en-US")} ${fadeCount === 1 ? "fade" : "fades"}`
      : null,
  ].filter((label): label is string => Boolean(label));

  return labels.length ? labels.join(" - ") : "0 copies";
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  const normalized = optionalNonNegativeNumber(value);
  return normalized === undefined ? undefined : Math.floor(normalized);
}

export function getCopyableMarketHeatRows(
  rows: MarketHeatPreviewRow[],
): MarketHeatPreviewRow[] {
  return rows;
}

function findMarketHeatPreviewRow(
  rows: MarketHeatPreviewRow[],
  rowId: string,
): MarketHeatPreviewRow | null {
  return getCopyableMarketHeatRows(rows).find((row) => row.id === rowId) ?? null;
}

export function selectTradeMarkets(
  preview: MarketHeatPreview,
  { intervalLabel = null, nowMs = Date.now() }: SelectTradeMarketsOptions = {},
): MarketHeatAvailableMarket[] {
  const matchesDuration = (market: Pick<MarketHeatAvailableMarket, "intervalLabel">) =>
    !intervalLabel || market.intervalLabel === intervalLabel;

  if (preview.availableMarkets !== undefined) {
    return preview.availableMarkets.filter(
      (market) => isTradeableAvailableMarket(market, nowMs) && matchesDuration(market),
    );
  }

  const seen = new Set<string>();

  return getCopyableMarketHeatRows(preview.rows)
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
        strikeRaw: row.strikeRaw ?? strike,
        strikeLabel: formatStrike(strike),
        status: "active",
      };
    })
    .filter((market) => {
      if (!matchesDuration(market)) {
        return false;
      }

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
  {
    intervalLabel = null,
    nowMs = Date.now(),
    spotPriceLabel = null,
  }: SelectTradeMarketsOptions = {},
): TradeMarketLadderRow[] {
  const spotPrice = parseFormattedUsd(spotPriceLabel ?? preview.marketPrice.priceLabel);

  const copyableRows = getCopyableMarketHeatRows(preview.rows);

  return selectTradeMarkets(preview, { intervalLabel, nowMs })
    .map((market) => {
      const activityRows = copyableRows.filter((row) => isActivityForMarket(row, market));
      const pricing = computeOracleIndicativePrices(market, market.strikeRaw);
      const up = withEstimatedPrice(
        summarizeTradeMarketSide(activityRows, "UP"),
        pricing?.up,
      );
      const down = withEstimatedPrice(
        summarizeTradeMarketSide(activityRows, "DOWN"),
        pricing?.down,
      );
      const wallets = new Set(activityRows.map((row) => row.wallet));
      const strikes = new Set(activityRows.map((row) => row.strike));
      const volumeUsd = roundUsd(up.volumeUsd + down.volumeUsd);
      const volumeLabel = formatUsdAmount(volumeUsd);
      const tradeCount = countMarketHeatFills(activityRows);
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
        ...(market.minStrikeRaw === undefined ? {} : { minStrikeRaw: market.minStrikeRaw }),
        ...(market.tickSizeRaw === undefined ? {} : { tickSizeRaw: market.tickSizeRaw }),
        moneynessLabel: formatMoneyness(market.strike - spotPrice),
        activityLabel: formatTradeMarketActivity(wallets.size, tradeCount, volumeLabel),
        uniqueWalletCount: wallets.size,
        tradeCount,
        distinctStrikeCount: strikes.size,
        strikeOptions,
        volumeUsd,
        volumeLabel,
        up,
        down,
        ...(market.pricingModel === undefined ? {} : { pricingModel: market.pricingModel }),
      };
    })
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        right.tradeCount - left.tradeCount ||
        Math.abs(left.strike - spotPrice) - Math.abs(right.strike - spotPrice) ||
        left.id.localeCompare(right.id),
    );
}

export function buildTradeMarketForMarketHeatRow(
  preview: MarketHeatPreview,
  rowId: string,
  {
    nowMs = Date.now(),
    spotPriceLabel = null,
  }: SelectTradeMarketsOptions = {},
): MarketHeatCopyTrade | null {
  const row = findMarketHeatPreviewRow(preview.rows, rowId);
  if (!row || row.status !== "copy_ready" || row.expiryMs <= nowMs) {
    return null;
  }

  const market = buildTradeMarketLadder(preview, { nowMs, spotPriceLabel }).find((candidate) => {
    if (row.oracleId && candidate.oracleId === row.oracleId) {
      return true;
    }

    return (
      candidate.pairLabel === row.pairLabel &&
      candidate.intervalLabel === row.intervalLabel &&
      candidate.expiryMs === row.expiryMs
    );
  });

  if (!market) {
    return null;
  }

  const rowStrikeRaw = row.strikeRaw ?? Math.round(row.strike * 1_000_000);
  const strikeOption =
    market.strikeOptions?.find((option) => option.strikeRaw === rowStrikeRaw) ??
    market.strikeOptions?.find((option) => option.strike === row.strike) ?? {
      strike: row.strike,
      strikeRaw: rowStrikeRaw,
      strikeLabel: formatStrike(row.strike),
    };
  const spot = parseFormattedUsd(spotPriceLabel ?? preview.marketPrice.priceLabel);
  const rowEstimatedPrice = estimateMarketHeatRowPrice(row);

  return {
    row,
    market: {
      ...market,
      strike: strikeOption.strike,
      strikeRaw: strikeOption.strikeRaw,
      strikeLabel: strikeOption.strikeLabel,
      moneynessLabel: formatMoneyness(strikeOption.strike - spot),
      ...(row.side === "UP"
        ? { up: withEstimatedPrice(market.up, rowEstimatedPrice) }
        : { down: withEstimatedPrice(market.down, rowEstimatedPrice) }),
    },
  };
}

function withEstimatedPrice(
  summary: TradeMarketSideSummary,
  estimatedPrice: number | undefined,
): TradeMarketSideSummary {
  return estimatedPrice === undefined ? summary : { ...summary, estimatedPrice };
}

function computeOracleIndicativePrices(
  market: Pick<MarketHeatAvailableMarket, "pricingModel">,
  strikeRaw: number,
): { up: number; down: number } | null {
  const up = computeOracleIndicativeUpPrice(market.pricingModel, strikeRaw);

  if (up === undefined) {
    return null;
  }

  return {
    up,
    down: roundPrice(Math.max(0, Math.min(1, 1 - up))),
  };
}

function buildTradeStrikeOptions(
  market: MarketHeatAvailableMarket,
  activityRows: MarketHeatPreviewRow[],
): TradeStrikeOption[] {
  const riskProfileOptions = buildRiskProfileTradeStrikeOptions(market);
  if (riskProfileOptions.length) {
    return riskProfileOptions;
  }

  const fallbackRiskProfileOptions = buildFallbackRiskProfileTradeStrikeOptions(
    market,
    activityRows,
  );
  if (fallbackRiskProfileOptions.length) {
    return fallbackRiskProfileOptions;
  }

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
    addOption(row.strike, row.strikeRaw);
  }

  return [...byStrikeRaw.values()].sort(
    (left, right) =>
      left.strike - right.strike ||
      left.strikeRaw - right.strikeRaw,
  );
}

function buildRiskProfileTradeStrikeOptions(
  market: MarketHeatAvailableMarket,
): TradeStrikeOption[] {
  if (!market.pricingModel) {
    return [];
  }

  type PricedTradeStrikeOption = TradeStrikeOption & {
    downEstimatedPrice: number;
    upEstimatedPrice: number;
  };

  const candidates = uniqueTradeStrikeCandidates(
    [
      {
        strike: market.strike,
        strikeRaw: market.strikeRaw,
        strikeLabel: market.strikeLabel,
      },
      ...buildSyntheticTradeStrikeOptions(market),
    ],
    market,
  )
    .map((option): PricedTradeStrikeOption | null => {
      const up = computeOracleIndicativeUpPrice(market.pricingModel, option.strikeRaw);
      if (up === undefined) {
        return null;
      }

      return {
        ...option,
        upEstimatedPrice: up,
        downEstimatedPrice: roundPrice(Math.max(0, Math.min(1, 1 - up))),
      };
    })
    .filter((option): option is PricedTradeStrikeOption => option !== null);

  if (!candidates.length) {
    return [];
  }

  const options: TradeStrikeOption[] = [];
  for (const side of ["UP", "DOWN"] as const) {
    for (const profile of TRADE_RISK_PROFILES) {
      const targetUpPrice =
        side === "UP" ? profile.targetPrice : 1 - profile.targetPrice;
      const bestCandidate = candidates.reduce((best, candidate) => {
        const bestDistance = Math.abs((best.upEstimatedPrice ?? 0) - targetUpPrice);
        const candidateDistance = Math.abs(
          (candidate.upEstimatedPrice ?? 0) - targetUpPrice,
        );

        return candidateDistance < bestDistance ? candidate : best;
      }, candidates[0]);

      options.push({
        ...bestCandidate,
        profile: profile.profile,
        side,
        targetPrice: profile.targetPrice,
        payoutMultiple: profile.payoutMultiple,
      });
    }
  }

  return options;
}

function buildFallbackRiskProfileTradeStrikeOptions(
  market: MarketHeatAvailableMarket,
  activityRows: MarketHeatPreviewRow[],
): TradeStrikeOption[] {
  const candidates = uniqueTradeStrikeCandidates(
    [
      {
        strike: market.strike,
        strikeRaw: market.strikeRaw,
        strikeLabel: market.strikeLabel,
      },
      ...buildSyntheticTradeStrikeOptions(market),
      ...activityRows.map((row) => ({
        strike: row.strike,
        strikeRaw: row.strikeRaw ?? Math.round(row.strike * 1_000_000),
        strikeLabel: formatStrike(row.strike),
      })),
    ],
    market,
  );

  if (!candidates.length) {
    return [];
  }

  const sorted = [...candidates].sort(
    (left, right) =>
      left.strikeRaw - right.strikeRaw ||
      left.strike - right.strike,
  );
  const baseIndex = Math.max(
    0,
    sorted.findIndex((option) => option.strikeRaw === market.strikeRaw),
  );
  const pick = (offset: number) =>
    sorted[Math.max(0, Math.min(sorted.length - 1, baseIndex + offset))] ?? sorted[0];
  const profileOffsets: Record<TradeRiskProfile, number> = {
    conservative: -1,
    standard: 0,
    risky: 2,
  };
  const options: TradeStrikeOption[] = [];

  for (const side of ["UP", "DOWN"] as const) {
    for (const profile of TRADE_RISK_PROFILES) {
      const signedOffset =
        side === "UP"
          ? profileOffsets[profile.profile]
          : -profileOffsets[profile.profile];
      const option = pick(signedOffset);

      options.push({
        ...option,
        profile: profile.profile,
        side,
        targetPrice: profile.targetPrice,
        payoutMultiple: profile.payoutMultiple,
      });
    }
  }

  return options;
}

function uniqueTradeStrikeCandidates(
  options: TradeStrikeOption[],
  market: Pick<MarketHeatAvailableMarket, "strike" | "strikeRaw">,
): TradeStrikeOption[] {
  const byStrikeRaw = new Map<number, TradeStrikeOption>();

  for (const option of options) {
    if (
      !Number.isFinite(option.strikeRaw) ||
      option.strikeRaw <= 0 ||
      !Number.isFinite(option.strike) ||
      option.strike <= 0
    ) {
      continue;
    }

    byStrikeRaw.set(option.strikeRaw, option);
  }

  if (!byStrikeRaw.has(market.strikeRaw)) {
    byStrikeRaw.set(market.strikeRaw, {
      strike: market.strike,
      strikeRaw: market.strikeRaw,
      strikeLabel: formatStrike(market.strike),
    });
  }

  return [...byStrikeRaw.values()];
}

function buildSyntheticTradeStrikeOptions(
  market: MarketHeatAvailableMarket,
): TradeStrikeOption[] {
  const scale = computeStrikeRawScale(market);

  if (scale === null) {
    return [];
  }

  const priceCurveOptions = buildPriceCurveSyntheticTradeStrikeOptions(market, scale);
  if (priceCurveOptions.length > 0) {
    return priceCurveOptions;
  }

  const displayStepRaw = computeSyntheticDisplayStepRaw(market);

  if (displayStepRaw === null) {
    return [];
  }

  const baseRaw = market.strikeRaw;
  const minRaw = market.minStrikeRaw ?? displayStepRaw;
  const options: TradeStrikeOption[] = [];

  for (
    let offset = -TRADE_SYNTHETIC_STRIKE_STEPS_PER_SIDE;
    offset <= TRADE_SYNTHETIC_STRIKE_STEPS_PER_SIDE;
    offset += 1
  ) {
    const strikeRaw = baseRaw + offset * displayStepRaw;
    if (strikeRaw < minRaw || strikeRaw <= 0) {
      continue;
    }

    const strike = roundSyntheticStrike(strikeRaw / scale);
    if (!Number.isFinite(strike) || strike <= 0) {
      continue;
    }

    options.push({
      strike,
      strikeRaw,
      strikeLabel: formatStrike(strike),
    });
  }

  return options;
}

function buildPriceCurveSyntheticTradeStrikeOptions(
  market: MarketHeatAvailableMarket,
  scale: number,
): TradeStrikeOption[] {
  const tickSizeRaw = market.tickSizeRaw;
  const baseUpPrice = computeOracleIndicativeUpPrice(market.pricingModel, market.strikeRaw);

  if (
    tickSizeRaw === undefined ||
    !Number.isFinite(tickSizeRaw) ||
    tickSizeRaw <= 0 ||
    baseUpPrice === undefined
  ) {
    return [];
  }

  const options: TradeStrikeOption[] = [];
  for (const direction of [-1, 1] as const) {
    let previousRaw = market.strikeRaw;
    let previousUpPrice = baseUpPrice;

    for (let step = 0; step < TRADE_SYNTHETIC_STRIKE_STEPS_PER_SIDE; step += 1) {
      const nextRaw = findNextSyntheticStrikeRaw({
        direction,
        market,
        previousRaw,
        previousUpPrice,
        tickSizeRaw,
      });

      if (nextRaw === null) {
        break;
      }

      const nextUpPrice = computeOracleIndicativeUpPrice(market.pricingModel, nextRaw);
      if (nextUpPrice === undefined) {
        break;
      }

      options.push(buildSyntheticTradeStrikeOption(nextRaw, scale));
      previousRaw = nextRaw;
      previousUpPrice = nextUpPrice;

      if (nextUpPrice <= 0 || nextUpPrice >= 1) {
        break;
      }
    }
  }

  return options;
}

function findNextSyntheticStrikeRaw({
  direction,
  market,
  previousRaw,
  previousUpPrice,
  tickSizeRaw,
}: {
  direction: -1 | 1;
  market: MarketHeatAvailableMarket;
  previousRaw: number;
  previousUpPrice: number;
  tickSizeRaw: number;
}): number | null {
  const minRaw = market.minStrikeRaw ?? tickSizeRaw;
  let lowerTicks = 0;
  let upperTicks = 1;
  let upperRaw: number | null = null;

  while (upperTicks <= TRADE_MAX_SYNTHETIC_SEARCH_TICKS) {
    const candidateRaw = previousRaw + direction * upperTicks * tickSizeRaw;
    if (!isValidSyntheticStrikeRaw(candidateRaw, minRaw)) {
      return null;
    }

    const candidateUpPrice = computeOracleIndicativeUpPrice(market.pricingModel, candidateRaw);
    if (candidateUpPrice === undefined) {
      return null;
    }

    const priceDelta = Math.abs(candidateUpPrice - previousUpPrice);
    if (
      priceDelta >= TRADE_TARGET_SYNTHETIC_PRICE_STEP ||
      candidateUpPrice <= 0 ||
      candidateUpPrice >= 1
    ) {
      upperRaw = candidateRaw;
      break;
    }

    lowerTicks = upperTicks;
    upperTicks *= 2;
  }

  if (upperRaw === null) {
    return null;
  }

  let low = lowerTicks + 1;
  let high = upperTicks;
  let bestRaw = upperRaw;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateRaw = previousRaw + direction * mid * tickSizeRaw;
    if (!isValidSyntheticStrikeRaw(candidateRaw, minRaw)) {
      high = mid - 1;
      continue;
    }

    const candidateUpPrice = computeOracleIndicativeUpPrice(market.pricingModel, candidateRaw);
    if (candidateUpPrice === undefined) {
      high = mid - 1;
      continue;
    }

    const priceDelta = Math.abs(candidateUpPrice - previousUpPrice);
    if (
      priceDelta >= TRADE_TARGET_SYNTHETIC_PRICE_STEP ||
      candidateUpPrice <= 0 ||
      candidateUpPrice >= 1
    ) {
      bestRaw = candidateRaw;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return bestRaw;
}

function isValidSyntheticStrikeRaw(strikeRaw: number, minRaw: number): boolean {
  return Number.isFinite(strikeRaw) && strikeRaw >= minRaw && strikeRaw > 0;
}

function buildSyntheticTradeStrikeOption(
  strikeRaw: number,
  scale: number,
): TradeStrikeOption {
  const strike = roundSyntheticStrike(strikeRaw / scale);

  return {
    strike,
    strikeRaw,
    strikeLabel: formatStrike(strike),
  };
}

function computeSyntheticDisplayStepRaw(
  market: Pick<MarketHeatAvailableMarket, "strike" | "strikeRaw" | "tickSizeRaw">,
): number | null {
  const tickSizeRaw = market.tickSizeRaw;
  const scale = computeStrikeRawScale(market);

  if (
    tickSizeRaw === undefined ||
    !Number.isFinite(tickSizeRaw) ||
    tickSizeRaw <= 0 ||
    scale === null
  ) {
    return null;
  }

  const minimumStepRaw = TRADE_FALLBACK_DISPLAY_STRIKE_STEP_USD * scale;
  const tickMultiple = Math.max(1, Math.ceil(minimumStepRaw / tickSizeRaw));

  return tickMultiple * tickSizeRaw;
}

function computeStrikeRawScale(
  market: Pick<MarketHeatAvailableMarket, "strike" | "strikeRaw">,
): number | null {
  if (
    !Number.isFinite(market.strike) ||
    market.strike <= 0 ||
    !Number.isFinite(market.strikeRaw) ||
    market.strikeRaw <= 0
  ) {
    return null;
  }

  return market.strikeRaw / market.strike;
}

function roundSyntheticStrike(strike: number): number {
  return Math.round(strike * 100) / 100;
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
    diversifyWallets = false,
    intervalLabel = null,
    limit = 8,
    nowMs = Date.now(),
    showExpired = false,
    sortMode,
  }: SelectVisibleMarketHeatRowsOptions,
): MarketHeatPreviewRow[] {
  const eligibleRows = showExpired
    ? rows
    : rows.filter((row) => row.expiryMs > nowMs);

  const durationRows = intervalLabel
    ? eligibleRows.filter((row) => row.intervalLabel === intervalLabel)
    : eligibleRows;

  const sortedRows = sortMarketHeatRows(durationRows, sortMode);

  return diversifyWallets
    ? diversifyMarketHeatRowsByWallet(sortedRows, limit)
    : sortedRows.slice(0, limit);
}

export function selectFeedMarketHeatRows(
  rows: MarketHeatPreviewRow[],
  {
    limit = Number.MAX_SAFE_INTEGER,
    nowMs = Date.now(),
    showExpired = false,
    sortMode,
  }: Pick<SelectVisibleMarketHeatRowsOptions, "nowMs" | "showExpired" | "sortMode"> & {
    limit?: number;
  },
): MarketHeatPreviewRow[] {
  return selectVisibleMarketHeatRows(rows, {
    diversifyWallets: false,
    intervalLabel: null,
    limit,
    nowMs,
    showExpired,
    sortMode,
  });
}

function diversifyMarketHeatRowsByWallet(
  rows: MarketHeatPreviewRow[],
  limit: number,
): MarketHeatPreviewRow[] {
  const selectedRows: MarketHeatPreviewRow[] = [];
  const selectedIds = new Set<string>();
  const selectedWallets = new Set<string>();
  const addRow = (row: MarketHeatPreviewRow) => {
    if (selectedIds.has(row.id) || selectedRows.length >= limit) {
      return;
    }

    selectedIds.add(row.id);
    selectedRows.push(row);
  };

  for (const row of rows) {
    const wallet = row.wallet.toLowerCase();
    if (selectedWallets.has(wallet)) {
      continue;
    }

    selectedWallets.add(wallet);
    addRow(row);
  }

  for (const row of rows) {
    addRow(row);
  }

  return selectedRows;
}

export function buildMarketDurationOptions(
  preview: Pick<MarketHeatPreview, "availableMarkets" | "rows">,
  { nowMs = Date.now() }: Pick<SelectVisibleMarketHeatRowsOptions, "nowMs"> = {},
): MarketDurationOption[] {
  const countsByLabel = new Map<string, number>();

  for (const row of preview.rows) {
    if (row.expiryMs <= nowMs) {
      continue;
    }

    countsByLabel.set(row.intervalLabel, (countsByLabel.get(row.intervalLabel) ?? 0) + 1);
  }

  for (const market of preview.availableMarkets ?? []) {
    if (market.expiryMs <= nowMs) {
      continue;
    }

    countsByLabel.set(market.intervalLabel, Math.max(1, countsByLabel.get(market.intervalLabel) ?? 0));
  }

  return [...countsByLabel.entries()]
    .map(([label, count]) => ({ count, label, value: label }))
    .sort(
      (left, right) =>
        durationMsFromIntervalLabel(left.value) - durationMsFromIntervalLabel(right.value) ||
        left.value.localeCompare(right.value),
    );
}

export function selectMarketHeatIntent(
  state: MarketHeatIntentState,
  rowId: string,
  rows: MarketHeatPreviewRow[],
  mode: MarketHeatIntentMode = "copy",
): MarketHeatIntentState {
  if (!findMarketHeatPreviewRow(rows, rowId)) {
    return state;
  }

  return {
    mode,
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
  mode: MarketHeatIntentMode = "copy",
): MarketHeatIntentPanel | null {
  if (!row) {
    return null;
  }

  const isCopyReady = row.status === "copy_ready";
  const isFade = mode === "fade";

  return {
    actionLabel: isFade ? "Fade now" : row.actionLabel,
    closeLabel: "Cancel",
    detailLabel: isCopyReady ? "Recent mint" : "Next observed mint",
    signatureLabel: isCopyReady
      ? "Ready for your wallet signature"
      : "We'll watch this wallet and prepare the next mint for your signature",
    statusLabel: row.statusLabel,
    title: `${isFade ? "Fade" : "Copy"} ${row.displayName}`,
  };
}

export async function loadMarketHeatPreview({
  apiBaseUrl,
  fetcher = fetch,
  includeExpired = false,
  nowMs = Date.now(),
  timeZone,
  useDemoDisplayNames = false,
  useHotHandsProfileNames = false,
  useMainnetSuinsNames = false,
}: LoadMarketHeatPreviewOptions = {}): Promise<MarketHeatPreview> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
    return buildCapturedMarketHeatPreview(nowMs, timeZone, useDemoDisplayNames);
  }

  try {
    const response = await fetcher(buildMarketHeatUrl(normalizedBaseUrl, includeExpired));

    if (!response.ok) {
      return buildCapturedMarketHeatPreview(nowMs, timeZone, useDemoDisplayNames);
    }

    const payload: unknown = await response.json();
    const rows = parseMarketHeatRows(payload);

    if (!rows) {
      return buildCapturedMarketHeatPreview(nowMs, timeZone, useDemoDisplayNames);
    }

    const sourceLabel = formatMarketHeatSource(payload);
    const previewRows =
      sourceLabel === "Captured" ? refreshCapturedRows(rows, nowMs) : rows;
    const marketPrice = parseMarketHeatPrice(payload) ?? CAPTURED_MARKET_PRICE;
    const availableMarkets = parseAvailableMarkets(payload, marketPrice, nowMs, timeZone);
    const rowWallets = previewRows.map((row) => row.wallet);
    const hotHandsProfileDisplayNames = useHotHandsProfileNames
      ? await loadHotHandsProfileNames({
          apiBaseUrl: normalizedBaseUrl,
          fetcher,
          wallets: rowWallets,
        }).catch(() => ({}))
      : {};
    const mainnetWalletDisplayNames = useMainnetSuinsNames
      ? await loadMainnetSuinsNames({
          apiBaseUrl: normalizedBaseUrl,
          fetcher,
          wallets: rowWallets,
        }).catch(() => ({}))
      : {};
    const liveWalletDisplayNames = {
      ...mainnetWalletDisplayNames,
      ...hotHandsProfileDisplayNames,
    };
    const walletDisplayNames = useDemoDisplayNames
      ? mergeDemoWalletDisplayNames(
          rowWallets,
          liveWalletDisplayNames,
        )
      : liveWalletDisplayNames;
    const preview = buildMarketHeatPreview(previewRows, MARKET_HEAT_CANDIDATE_LIMIT, {
      marketPrice,
      nowMs,
      timeZone,
      walletDisplayNames,
    });

    return {
      ...preview,
      availableMarkets,
      ...parseMarketHeatFeedCursor(payload),
      rows: annotateMarketHeatRowPrices(preview.rows, availableMarkets),
      sourceLabel,
    };
  } catch {
    return buildCapturedMarketHeatPreview(nowMs, timeZone, useDemoDisplayNames);
  }
}

export async function loadMarketHeatPriceSnapshot(
  currentPreview: MarketHeatPreview,
  {
    apiBaseUrl,
    fetcher = fetch,
    includeExpired = false,
    nowMs = Date.now(),
    timeZone,
    useHotHandsProfileNames = false,
    useMainnetSuinsNames = false,
  }: LoadMarketHeatPriceSnapshotOptions = {},
): Promise<MarketHeatPreview> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
      return loadMarketHeatPreview({
        apiBaseUrl,
        fetcher,
        includeExpired,
        nowMs,
        timeZone,
        useHotHandsProfileNames,
        useMainnetSuinsNames,
      });
  }

  try {
    const response = await fetcher(buildMarketHeatPriceSnapshotUrl(normalizedBaseUrl));

    if (!response.ok) {
      return loadMarketHeatPreview({
        apiBaseUrl: normalizedBaseUrl,
        fetcher,
        includeExpired,
        nowMs,
        timeZone,
        useHotHandsProfileNames,
        useMainnetSuinsNames,
      });
    }

    const payload: unknown = await response.json();
    const marketPrice = parseMarketHeatPrice(payload);

    if (!marketPrice) {
      return loadMarketHeatPreview({
        apiBaseUrl: normalizedBaseUrl,
        fetcher,
        includeExpired,
        nowMs,
        timeZone,
        useHotHandsProfileNames,
        useMainnetSuinsNames,
      });
    }

    const availableMarkets = preserveAvailableMarketStrikes(
      parseAvailableMarkets(payload, marketPrice, nowMs, timeZone),
      currentPreview.availableMarkets,
    ) ?? currentPreview.availableMarkets;

    return {
      ...currentPreview,
      marketPrice: buildMarketHeatPrice(marketPrice),
      availableMarkets,
      rows: annotateMarketHeatRowPrices(currentPreview.rows, availableMarkets),
    };
  } catch {
    return loadMarketHeatPreview({
      apiBaseUrl: normalizedBaseUrl,
      fetcher,
      includeExpired,
      nowMs,
      timeZone,
      useHotHandsProfileNames,
      useMainnetSuinsNames,
    });
  }
}

export async function loadMarketHeatFeedUpdates(
  currentPreview: MarketHeatPreview,
  {
    apiBaseUrl,
    fetcher = fetch,
    includeExpired = false,
    nowMs = Date.now(),
    timeZone,
    useHotHandsProfileNames = false,
    useMainnetSuinsNames = false,
  }: LoadMarketHeatFeedUpdatesOptions = {},
): Promise<MarketHeatPreview> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl || !currentPreview.feedCursor) {
    return currentPreview;
  }

  try {
    const response = await fetcher(
      buildMarketHeatFeedUpdatesUrl(
        normalizedBaseUrl,
        currentPreview.feedCursor,
        includeExpired,
      ),
    );

    if (!response.ok) {
      return currentPreview;
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.rows)) {
      return currentPreview;
    }

    const cursorPatch = parseMarketHeatFeedCursor(payload);
    const rowInputs = parseMarketHeatRows(payload) ?? [];
    if (rowInputs.length === 0) {
      return cursorPatch.feedCursor && cursorPatch.feedCursor !== currentPreview.feedCursor
        ? {
            ...currentPreview,
            ...cursorPatch,
          }
        : currentPreview;
    }

    const rowWallets = rowInputs.map((row) => row.wallet);
    const hotHandsProfileDisplayNames = useHotHandsProfileNames
      ? await loadHotHandsProfileNames({
          apiBaseUrl: normalizedBaseUrl,
          fetcher,
          nowMs: () => nowMs,
          wallets: rowWallets,
        }).catch(() => ({}))
      : {};
    const mainnetWalletDisplayNames = useMainnetSuinsNames
      ? await loadMainnetSuinsNames({
          apiBaseUrl: normalizedBaseUrl,
          fetcher,
          nowMs: () => nowMs,
          wallets: rowWallets,
        }).catch(() => ({}))
      : {};
    const walletDisplayNames = {
      ...mainnetWalletDisplayNames,
      ...hotHandsProfileDisplayNames,
    };
    const nextRows = buildMarketHeatPreview(rowInputs, MARKET_HEAT_CANDIDATE_LIMIT, {
      marketPrice: marketHeatPriceInputFromPreview(currentPreview),
      nowMs,
      timeZone,
      walletDisplayNames,
    }).rows;

    return {
      ...currentPreview,
      ...cursorPatch,
      rows: annotateMarketHeatRowPrices(
        mergeMarketHeatPreviewRows(currentPreview.rows, nextRows),
        currentPreview.availableMarkets,
      ),
    };
  } catch {
    return currentPreview;
  }
}

export function preserveMarketHeatAvailableMarketStrikes(
  nextPreview: MarketHeatPreview,
  currentPreview: Pick<MarketHeatPreview, "availableMarkets">,
): MarketHeatPreview {
  const availableMarkets = preserveAvailableMarketStrikes(
    nextPreview.availableMarkets,
    currentPreview.availableMarkets,
  );
  const rows = annotateMarketHeatRowPrices(nextPreview.rows, availableMarkets);

  return {
    ...nextPreview,
    availableMarkets,
    rows,
  };
}

export async function loadTradeQuote({
  apiBaseUrl,
  fetcher = fetch,
  market,
  side,
  spendUsd,
  timeoutMs = TRADE_QUOTE_TIMEOUT_MS,
}: LoadTradeQuoteOptions): Promise<TradeQuote | null> {
  const normalizedBaseUrl = apiBaseUrl?.trim();

  if (!normalizedBaseUrl) {
    return null;
  }

  const response = await fetchWithTimeout(
    fetcher,
    buildTradeQuoteUrl(normalizedBaseUrl, market, side, spendUsd),
    timeoutMs,
  );
  if (!response?.ok) {
    return null;
  }

  return parseTradeQuote(await response.json());
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildMarketHeatUrl(apiBaseUrl: string, includeExpired: boolean): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/testnet/market-heat`);
  if (includeExpired) {
    url.searchParams.set("includeExpired", "true");
  }

  return url.toString();
}

function buildMarketHeatPriceSnapshotUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/testnet/price-snapshot`;
}

function buildMarketHeatFeedUpdatesUrl(
  apiBaseUrl: string,
  cursor: string,
  includeExpired: boolean,
): string {
  const url = new URL(`${apiBaseUrl.replace(/\/+$/, "")}/testnet/feed-updates`);
  url.searchParams.set("cursor", cursor);
  if (includeExpired) {
    url.searchParams.set("includeExpired", "true");
  }

  return url.toString();
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
  useDemoDisplayNames = false,
): MarketHeatPreview {
  const rows = refreshCapturedRows(MARKET_HEAT_PREVIEW_ROWS, nowMs);
  const walletDisplayNames = useDemoDisplayNames
    ? mergeDemoWalletDisplayNames(rows.map((row) => row.wallet))
    : {};

  return buildMarketHeatPreview(
    rows,
    MARKET_HEAT_CANDIDATE_LIMIT,
    { marketPrice: CAPTURED_MARKET_PRICE, nowMs, timeZone, walletDisplayNames },
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
  const preciseVolumeUsd = sideRows.reduce(
    (total, row) => total + (preciseRowCostUsd(row) ?? 0),
    0,
  );
  const volumeUsd = roundUsd(preciseVolumeUsd);
  const payoutUsd = sideRows.reduce((total, row) => total + normalizeQuantityUsd(row), 0);
  const estimatedPrice =
    preciseVolumeUsd > 0 && payoutUsd > 0
      ? roundPrice(preciseVolumeUsd / payoutUsd)
      : undefined;

  return {
    walletCount: new Set(sideRows.map((row) => row.wallet)).size,
    tradeCount: countMarketHeatFills(sideRows),
    volumeUsd,
    volumeLabel: formatUsdAmount(volumeUsd),
    ...(estimatedPrice === undefined ? {} : { estimatedPrice }),
  };
}

function countMarketHeatFills(rows: Pick<MarketHeatPreviewRow, "fillCount">[]): number {
  return rows.reduce((total, row) => total + Math.max(1, Math.floor(row.fillCount ?? 1)), 0);
}

function normalizeQuantityUsd(row: MarketHeatPreviewRow): number {
  if (!isNonNegativeNumber(row.quantity) || row.quantity === 0) {
    return 0;
  }

  return row.quantity / 1_000_000;
}

function estimateMarketHeatRowPrice(row: MarketHeatPreviewRow): number | undefined {
  const costUsd = preciseRowCostUsd(row);
  const quantityUsd = normalizeQuantityUsd(row);

  return costUsd !== undefined && costUsd > 0 && quantityUsd > 0
    ? roundPrice(costUsd / quantityUsd)
    : undefined;
}

function annotateMarketHeatRowPrices(
  rows: MarketHeatPreviewRow[],
  availableMarkets?: MarketHeatAvailableMarket[],
): MarketHeatPreviewRow[] {
  return rows.map((row) => annotateMarketHeatRowPrice(row, availableMarkets));
}

function mergeMarketHeatPreviewRows(
  currentRows: MarketHeatPreviewRow[],
  nextRows: MarketHeatPreviewRow[],
): MarketHeatPreviewRow[] {
  const rowsById = new Map(currentRows.map((row) => [row.id, row]));

  for (const nextRow of nextRows) {
    const currentRow = rowsById.get(nextRow.id);
    rowsById.set(
      nextRow.id,
      currentRow
        ? {
            ...currentRow,
            ...nextRow,
            ...(nextRow.walletStats === undefined && currentRow.walletStats !== undefined
              ? {
                  walletStats: currentRow.walletStats,
                  walletStatsLabel: currentRow.walletStatsLabel,
                }
              : {}),
            ...(nextRow.copyAttribution === undefined &&
            currentRow.copyAttribution !== undefined
              ? {
                  copyAttribution: currentRow.copyAttribution,
                  copyAttributionLabel: currentRow.copyAttributionLabel,
                }
              : {}),
          }
        : nextRow,
    );
  }

  return sortMarketHeatRows([...rowsById.values()], "latest").slice(
    0,
    MARKET_HEAT_CANDIDATE_LIMIT,
  );
}

function marketHeatPriceInputFromPreview(
  preview: Pick<MarketHeatPreview, "marketPrice">,
): MarketHeatPriceInput {
  return {
    market: "BTC-USD",
    price: parseFormattedUsd(preview.marketPrice.priceLabel) ?? 0,
    source: "indexed_testnet",
  };
}

function annotateMarketHeatRowPrice(
  row: MarketHeatPreviewRow,
  availableMarkets?: MarketHeatAvailableMarket[],
): MarketHeatPreviewRow {
  const baseRow = { ...row };
  delete baseRow.entryPrice;
  delete baseRow.entryPriceLabel;
  delete baseRow.currentPrice;
  delete baseRow.currentPriceLabel;
  delete baseRow.entryNowTone;
  const entryPrice = estimateMarketHeatRowPrice(row);
  const currentPrice = estimateCurrentMarketHeatRowPrice(row, availableMarkets);
  const entryPriceLabel = formatMarketHeatPositionPrice(entryPrice);
  const currentPriceLabel = formatMarketHeatPositionPrice(currentPrice);
  const entryNowTone = resolveEntryNowTone(entryPrice, currentPrice);

  return {
    ...baseRow,
    ...(entryPrice === undefined ? {} : { entryPrice }),
    ...(entryPriceLabel === undefined ? {} : { entryPriceLabel }),
    ...(currentPrice === undefined ? {} : { currentPrice }),
    ...(currentPriceLabel === undefined ? {} : { currentPriceLabel }),
    ...(entryPrice === undefined && currentPrice === undefined ? {} : { entryNowTone }),
  };
}

function estimateCurrentMarketHeatRowPrice(
  row: MarketHeatPreviewRow,
  availableMarkets?: MarketHeatAvailableMarket[],
): number | undefined {
  const matchingMarket = findAvailableMarketForMarketHeatRowPrice(row, availableMarkets);

  if (!matchingMarket) {
    return undefined;
  }

  const strikeRaw = row.strikeRaw ?? Math.round(row.strike * 1_000_000);
  const up = computeOracleIndicativeUpPrice(matchingMarket.pricingModel, strikeRaw);

  if (up === undefined) {
    return undefined;
  }

  return row.side === "UP"
    ? up
    : roundPrice(Math.max(0, Math.min(1, 1 - up)));
}

function findAvailableMarketForMarketHeatRowPrice(
  row: MarketHeatPreviewRow,
  availableMarkets?: MarketHeatAvailableMarket[],
): MarketHeatAvailableMarket | null {
  if (!availableMarkets?.length) {
    return null;
  }

  if (row.oracleId) {
    const oracleMatch = availableMarkets.find(
      (market) => market.oracleId === row.oracleId && market.expiryMs === row.expiryMs,
    );

    if (oracleMatch) {
      return oracleMatch;
    }
  }

  return (
    availableMarkets.find(
      (market) =>
        market.pairLabel === row.pairLabel &&
        market.expiryMs === row.expiryMs &&
        market.intervalLabel === row.intervalLabel,
    ) ?? null
  );
}

function formatMarketHeatPositionPrice(price: number | undefined): string | undefined {
  if (price === undefined || !Number.isFinite(price)) {
    return undefined;
  }

  const clampedPrice = Math.max(0, Math.min(1, price));
  return `$${clampedPrice.toFixed(2)}`;
}

function resolveEntryNowTone(
  entryPrice: number | undefined,
  currentPrice: number | undefined,
): "up" | "down" | "flat" | "unknown" {
  if (entryPrice === undefined || currentPrice === undefined) {
    return "unknown";
  }

  const delta = roundPrice(currentPrice - entryPrice);

  if (delta > 0.005) {
    return "up";
  }

  if (delta < -0.005) {
    return "down";
  }

  return "flat";
}

function preciseRowCostUsd(row: Pick<MarketHeatPreviewRow, "cost" | "costUsd">): number | undefined {
  if (isNonNegativeNumber(row.costUsd) && row.costUsd > 0) {
    return row.costUsd;
  }

  if (isNonNegativeNumber(row.cost)) {
    return row.cost / 1_000_000;
  }

  return undefined;
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

const FLOAT_SCALING = 1_000_000_000;

export function computeOracleIndicativeUpPrice(
  pricingModel: MarketHeatPricingModel | undefined,
  strikeRaw: number,
): number | undefined {
  if (
    !pricingModel ||
    !Number.isFinite(strikeRaw) ||
    strikeRaw <= 0 ||
    !Number.isFinite(pricingModel.forward) ||
    pricingModel.forward <= 0
  ) {
    return undefined;
  }

  const a = pricingModel.a / FLOAT_SCALING;
  const b = pricingModel.b / FLOAT_SCALING;
  const rho = pricingModel.rho / FLOAT_SCALING;
  const m = pricingModel.m / FLOAT_SCALING;
  const sigma = pricingModel.sigma / FLOAT_SCALING;
  const k = Math.log(strikeRaw / pricingModel.forward);
  const kMinusM = k - m;
  const inner = rho * kMinusM + Math.sqrt(kMinusM * kMinusM + sigma * sigma);
  const totalVariance = a + b * inner;

  if (!Number.isFinite(totalVariance) || totalVariance <= 0) {
    return undefined;
  }

  const sqrtVariance = Math.sqrt(totalVariance);
  const d2 = -((k + totalVariance / 2) / sqrtVariance);

  return roundPrice(normalCdf(d2));
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const approximation =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));

  return sign * approximation;
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

function formatWalletStatsLabel(
  stats: MarketHeatWalletStats,
  observedAtMs: number,
  nowMs: number,
): string {
  return [
    formatSignedDusdc(stats.totalPnl),
    formatCurrentWalletStreak(stats.currentStreakType, stats.currentStreakLength),
    formatTradeTime(observedAtMs, nowMs),
  ].join(" · ");
}

function formatHeatScoreLabel(
  row: Pick<MarketHeatPreviewRowInput, "heatScore" | "walletStats">,
): string {
  return row.walletStats === undefined && row.heatScore <= 4
    ? "-"
    : String(Math.round(row.heatScore));
}

function formatSignedDusdc(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "$0";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatUsdAmount(Math.abs(value) / 1_000_000)}`;
}

function formatCurrentWalletStreak(
  type: MarketHeatWalletStreakType,
  length: number,
): string {
  const count = Math.max(0, Math.floor(length));

  if (type === "win" && count > 0) {
    return `${count} ${pluralize(count, "win")}`;
  }

  if (type === "loss" && count > 0) {
    return `${count} ${count === 1 ? "loss" : "losses"}`;
  }

  return "No streak";
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
  return wallet.startsWith("0x") ? `0x${wallet.slice(2, 7)}` : wallet.slice(0, 7);
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

    return `${month} ${day}, ${hour}:${minute} ${formatUtcTimeZoneLabel(timeZoneName)}`;
  } catch {
    return null;
  }
}

function sortMarketHeatInputs(rows: MarketHeatPreviewRowInput[]): MarketHeatPreviewRowInput[] {
  return [...rows].sort((left, right) => compareMarketHeatRows(left, right, "latest"));
}

function dedupeMarketHeatInputs(rows: MarketHeatPreviewRowInput[]): MarketHeatPreviewRowInput[] {
  const byPosition = new Map<string, MarketHeatPreviewRowInput>();

  for (const row of rows) {
    const key = marketHeatInputDedupeKey(row);
    const existing = byPosition.get(key);
    const normalizedRow = {
      ...row,
      fillCount: Math.max(1, Math.floor(row.fillCount ?? 1)),
    };

    if (!existing) {
      byPosition.set(key, normalizedRow);
      continue;
    }

    byPosition.set(key, mergeMarketHeatInputs(existing, normalizedRow));
  }

  return [...byPosition.values()];
}

function mergeMarketHeatInputs(
  left: MarketHeatPreviewRowInput,
  right: MarketHeatPreviewRowInput,
): MarketHeatPreviewRowInput {
  const copyReadyEntryMerge = mergeCopyReadyEntryWithWatchingRow(left, right);

  if (copyReadyEntryMerge) {
    return copyReadyEntryMerge;
  }

  const newest = right.observedAtMs >= left.observedAtMs ? right : left;
  const oldest = newest === right ? left : right;
  const quantity = sumOptionalNonNegative(left.quantity, right.quantity);
  const cost = sumOptionalNonNegative(left.cost, right.cost);
  const costUsd = sumOptionalNonNegative(normalizeCostUsd(left), normalizeCostUsd(right));
  const strikeRaw = optionalNonNegativeNumber(newest.strikeRaw ?? oldest.strikeRaw);
  const fillCount =
    Math.max(1, Math.floor(left.fillCount ?? 1)) +
    Math.max(1, Math.floor(right.fillCount ?? 1));
  const merged: MarketHeatPreviewRowInput = {
    ...newest,
    heatScore: Math.max(left.heatScore, right.heatScore),
    observedAtMs: Math.max(left.observedAtMs, right.observedAtMs),
    status:
      left.status === "copy_ready" || right.status === "copy_ready"
        ? "copy_ready"
        : "watching",
    fillCount,
  };
  const walletStats = newest.walletStats ?? oldest.walletStats;

  if (walletStats === undefined) {
    delete merged.walletStats;
  } else {
    merged.walletStats = walletStats;
  }

  if (quantity === undefined) {
    delete merged.quantity;
  } else {
    merged.quantity = quantity;
  }

  if (cost === undefined) {
    delete merged.cost;
  } else {
    merged.cost = cost;
  }

  if (costUsd === undefined) {
    delete merged.costUsd;
  } else {
    merged.costUsd = roundUsd(costUsd);
  }

  if (strikeRaw === undefined) {
    delete merged.strikeRaw;
  } else {
    merged.strikeRaw = strikeRaw;
  }

  return merged;
}

function mergeCopyReadyEntryWithWatchingRow(
  left: MarketHeatPreviewRowInput,
  right: MarketHeatPreviewRowInput,
): MarketHeatPreviewRowInput | null {
  if (left.status === right.status) {
    return null;
  }

  const entryRow =
    left.status === "copy_ready" ? left : right.status === "copy_ready" ? right : null;
  const activityRow = entryRow === left ? right : left;

  if (!entryRow || activityRow.status !== "watching") {
    return null;
  }

  const metadataRow = activityRow.observedAtMs >= entryRow.observedAtMs ? activityRow : entryRow;
  const costUsd = normalizeCostUsd(entryRow);
  const strikeRaw = optionalNonNegativeNumber(entryRow.strikeRaw ?? activityRow.strikeRaw);
  const fillCount = Math.max(1, Math.floor(entryRow.fillCount ?? 1));
  const merged: MarketHeatPreviewRowInput = {
    ...entryRow,
    heatScore: Math.max(left.heatScore, right.heatScore),
    observedAtMs: entryRow.observedAtMs,
    status: "copy_ready",
    fillCount,
  };
  const walletStats = metadataRow.walletStats ?? entryRow.walletStats ?? activityRow.walletStats;
  const copyAttribution =
    metadataRow.copyAttribution ?? entryRow.copyAttribution ?? activityRow.copyAttribution;

  if (walletStats === undefined) {
    delete merged.walletStats;
  } else {
    merged.walletStats = walletStats;
  }

  if (copyAttribution === undefined) {
    delete merged.copyAttribution;
  } else {
    merged.copyAttribution = copyAttribution;
  }

  if (costUsd === undefined) {
    delete merged.costUsd;
  } else {
    merged.costUsd = roundUsd(costUsd);
  }

  if (strikeRaw === undefined) {
    delete merged.strikeRaw;
  } else {
    merged.strikeRaw = strikeRaw;
  }

  return merged;
}

function marketHeatInputDedupeKey(row: MarketHeatPreviewRowInput): string {
  return [
    row.wallet.toLowerCase(),
    row.manager.toLowerCase(),
    row.market,
    row.side,
    row.intervalLabel,
    row.expiryMs,
    row.strikeRaw ?? row.strike,
    row.oracleId ?? "",
  ].join("|");
}

function sumOptionalNonNegative(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  const leftValue = optionalNonNegativeNumber(left);
  const rightValue = optionalNonNegativeNumber(right);

  if (leftValue === undefined && rightValue === undefined) {
    return undefined;
  }

  return (leftValue ?? 0) + (rightValue ?? 0);
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

  const rows = payload.rows
    .filter(isMarketHeatRowInput)
    .map((row) => {
      const walletStats = parseMarketHeatWalletStats(row.walletStats);
      const copyAttribution = parseMarketHeatCopyAttribution(row.copyAttribution);

      return {
        ...row,
        ...(walletStats === null ? { walletStats: undefined } : { walletStats }),
        ...(copyAttribution === null
          ? { copyAttribution: undefined }
          : { copyAttribution }),
        intervalLabel: normalizeMarketDurationLabel(row.intervalLabel),
      };
    });

  return rows.length > 0 ? rows : null;
}

function parseMarketHeatFeedCursor(payload: unknown): Pick<MarketHeatPreview, "feedCursor"> {
  if (!isRecord(payload) || !isNonEmptyString(payload.cursor)) {
    return {};
  }

  return { feedCursor: payload.cursor };
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
  nowMs: number,
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
    .filter((market) => isTradeableAvailableMarket(market, nowMs))
    .sort(
      (left, right) =>
        left.expiryMs - right.expiryMs ||
        left.strike - right.strike ||
        left.id.localeCompare(right.id),
    );

  return markets;
}

function isTradeableAvailableMarket(
  market: Pick<MarketHeatAvailableMarket, "expiryMs" | "status">,
  nowMs: number,
): boolean {
  return market.expiryMs > nowMs && market.status.toLowerCase() === "active";
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
    (value.strikeRaw === undefined || isNonNegativeNumber(value.strikeRaw)) &&
    isNonNegativeNumber(value.expiryMs) &&
    isNonEmptyString(value.intervalLabel) &&
    isNonNegativeNumber(value.observedAtMs) &&
    isNonNegativeNumber(value.heatScore) &&
    (value.walletStats === undefined || parseMarketHeatWalletStats(value.walletStats) !== null) &&
    (
      value.copyAttribution === undefined ||
      parseMarketHeatCopyAttribution(value.copyAttribution) !== null
    ) &&
    (value.status === "copy_ready" || value.status === "watching")
  );
}

function parseMarketHeatCopyAttribution(value: unknown): MarketHeatCopyAttribution | null {
  if (!isRecord(value)) {
    return null;
  }

  const count = optionalNonNegativeNumber(value.count);
  const amountUsd = optionalNonNegativeNumber(value.amountUsd);

  if (count === undefined || amountUsd === undefined || count <= 0) {
    return null;
  }

  return {
    amountUsd,
    count: Math.floor(count),
  };
}

function parseMarketHeatWalletStats(value: unknown): MarketHeatWalletStats | null {
  if (!isRecord(value)) {
    return null;
  }

  const totalPnl = optionalNumber(value.totalPnl);
  const currentStreakType = parseMarketHeatWalletStreakType(value.currentStreakType);
  const currentStreakLength = optionalNonNegativeNumber(value.currentStreakLength);
  const lastSeenMs = optionalNonNegativeNumber(value.lastSeenMs);

  if (
    totalPnl === undefined ||
    currentStreakType === null ||
    currentStreakLength === undefined ||
    lastSeenMs === undefined
  ) {
    return null;
  }

  return {
    totalPnl,
    currentStreakType,
    currentStreakLength,
    lastSeenMs,
  };
}

function parseMarketHeatWalletStreakType(value: unknown): MarketHeatWalletStreakType | null {
  return value === "win" || value === "loss" || value === "none" ? value : null;
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
  const intervalLabel = isNonEmptyString(value.intervalLabel)
    ? normalizeMarketDurationLabel(value.intervalLabel)
    : null;
  const expiry = firstNonNegativeNumber([value.expiry, value.expiryMs]);
  const expiryMs = expiry === null ? null : normalizeEpochMs(expiry);
  const status = isNonEmptyString(value.status) ? value.status : "active";
  const strike = firstNonNegativeNumber([
    value.strike,
    value.strikeCandidatePrice,
    value.latestPrice,
    marketPrice.price,
  ]);
  const strikeRaw = firstNonNegativeNumber([
    value.strikeRaw,
    value.strikeCandidate,
    value.strike,
    strike,
  ]);
  const minStrikeRaw = firstNonNegativeNumber([value.minStrike]);
  const tickSizeRaw = firstNonNegativeNumber([value.tickSize]);
  const latestPrice = firstNonNegativeNumber([value.latestPrice]);
  const latestPriceTimestampMs = firstNonNegativeNumber([value.latestPriceTimestampMs]);
  const latestPriceCheckpoint = firstNonNegativeNumber([value.latestPriceCheckpoint]);
  const pricingModel = parsePricingModel(value.pricingModel);

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
    ...(minStrikeRaw === null ? {} : { minStrikeRaw }),
    ...(tickSizeRaw === null ? {} : { tickSizeRaw }),
    ...(latestPrice === null ? {} : { latestPrice }),
    ...(latestPriceTimestampMs === null ? {} : { latestPriceTimestampMs }),
    ...(latestPriceCheckpoint === null ? {} : { latestPriceCheckpoint }),
    status,
    ...(pricingModel === undefined ? {} : { pricingModel }),
  };
}

function preserveAvailableMarketStrikes(
  nextMarkets: MarketHeatAvailableMarket[] | undefined,
  currentMarkets: MarketHeatAvailableMarket[] | undefined,
): MarketHeatAvailableMarket[] | undefined {
  if (!nextMarkets || !currentMarkets?.length) {
    return nextMarkets;
  }

  const currentByKey = new Map(
    currentMarkets.map((market) => [availableMarketStableKey(market), market]),
  );

  return nextMarkets.map((market) => {
    const currentMarket = currentByKey.get(availableMarketStableKey(market));
    if (!currentMarket) {
      return market;
    }

    return {
      ...market,
      strike: currentMarket.strike,
      strikeRaw: currentMarket.strikeRaw,
      strikeLabel: currentMarket.strikeLabel,
    };
  });
}

function availableMarketStableKey(
  market: Pick<MarketHeatAvailableMarket, "expiryMs" | "intervalLabel" | "oracleId">,
): string {
  return `${market.oracleId}:${market.expiryMs}:${market.intervalLabel}`;
}

function parsePricingModel(value: unknown): MarketHeatPricingModel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const forward = firstNonNegativeNumber([value.forward]);
  const forwardPrice = firstNonNegativeNumber([value.forwardPrice]);
  const a = firstNonNegativeNumber([value.a]);
  const b = firstNonNegativeNumber([value.b]);
  const rho = optionalNumber(value.rho);
  const m = optionalNumber(value.m);
  const sigma = firstNonNegativeNumber([value.sigma]);
  const timestampMs = firstNonNegativeNumber([value.timestampMs, value.timestamp_ms]);

  if (
    forward === null ||
    forwardPrice === null ||
    a === null ||
    b === null ||
    rho === undefined ||
    m === undefined ||
    sigma === null ||
    timestampMs === null
  ) {
    return undefined;
  }

  return { forward, forwardPrice, a, b, rho, m, sigma, timestampMs };
}

function normalizeMarketDurationLabel(intervalLabel: string): string {
  const trimmedLabel = intervalLabel.trim();
  const durationMs = parseDurationMsFromIntervalLabel(intervalLabel);

  if (durationMs === null) {
    return trimmedLabel || "1d";
  }

  if (durationMs <= 30 * 60_000) {
    return "15m";
  }

  if (durationMs <= 2 * 60 * 60_000) {
    return "1h";
  }

  return trimmedLabel || "1d";
}

function parseDurationMsFromIntervalLabel(intervalLabel: string): number | null {
  const match = /^(\d+)\s*([mhd])$/i.exec(intervalLabel.trim());

  if (!match) {
    return null;
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

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function firstNonNegativeNumber(values: unknown[]): number | null {
  for (const value of values) {
    if (isNonNegativeNumber(value)) {
      return value;
    }
  }

  return null;
}
