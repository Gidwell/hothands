import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  useCurrentClient,
  useCurrentAccount,
  useCurrentNetwork,
  useCurrentWallet,
  useDAppKit,
  useWalletConnection,
  useWallets,
  type UiWallet,
} from "@mysten/dapp-kit-react";
import {
  buildCreatePredictManagerTransaction,
  buildDepositQuoteTransaction,
} from "@hot-hands/contracts";
import {
  clampCopyAmount,
  COPY_AMOUNT_DEFAULT,
  COPY_AMOUNT_MAX,
  COPY_AMOUNT_MIN,
  formatCopyAmount,
  markCopySubmitted,
  selectHotTrader,
  setCopyAmount,
  stepCopyAmount,
  toggleCopyArmed,
} from "./copyModel";
import {
  appendCopyAttributionRecord,
  buildCopyAttributionSourcePositionId,
  formatCopyAttributionLabel,
  readCopyAttributionRecords,
  summarizeCopyAttribution,
  writeCopyAttributionRecords,
  type CopyAttributionRecord,
  type CopyAttributionTarget,
} from "./copyAttribution";
import { market, type Trader } from "./mockData";
import {
  advanceReplay,
  createReplayScenario,
  createInitialReplayState,
  getReplayAccountSummary,
  getReplayFrame,
  getReplayTraders,
  setReplayPlaying,
  updateReplayCopy,
} from "./replayModel";
import {
  buildMarketHeatIntentPanel,
  buildMarketHeatPreview,
  buildTradeMarketForMarketHeatRow,
  buildTradeMarketLadder,
  closeMarketHeatIntent,
  computeOracleIndicativeUpPrice,
  getCopyableMarketHeatRows,
  loadTradeQuote,
  loadMarketHeatPreview,
  loadMarketHeatPriceSnapshot,
  preserveMarketHeatAvailableMarketStrikes,
  selectMarketHeatIntent,
  selectVisibleMarketHeatRows,
  type MarketHeatIntentMode,
  type MarketHeatIntentState,
  type MarketHeatPreview as MarketHeatPreviewModel,
  type MarketHeatPreviewRow,
  type MarketHeatSortMode,
  type TradeQuote,
  type TradeMarketLadderRow,
  type TradeMarketSideSummary,
  type TradeStrikeOption,
} from "./marketHeatModel";
import {
  OraclePriceChartCard,
  OraclePriceChartModal,
  type OraclePriceChartMarketContext,
} from "./OraclePriceChart";
import {
  loadOraclePriceChart,
  loadOraclePriceChartTick,
  type OraclePriceChart,
} from "./oraclePriceChartModel";
import {
  buildHotHandsShareText,
  buildShareToXUrl,
  drawHotHandsShareCard,
  type HotHandsShareCardInput,
  type HotHandsShareStat,
} from "./shareCards";
import {
  buildWalletLeaderboards,
  loadWalletLeaderboards,
  selectWalletLeaderboardEntries,
  WALLET_LEADERBOARD_BOARDS,
  type WalletLeaderboardBoardKey,
  type WalletLeaderboardEntry,
  type WalletLeaderboardPanelBoardKey,
  type WalletLeaderboardRangeMode,
  type WalletLeaderboardSortDirection,
  type WalletLeaderboardTone,
  type WalletLeaderboardsSnapshot,
} from "./walletLeaderboards";
import { buildTradeMintTransaction } from "./walletTransactions";
import { buildPortfolioRedeemTransaction } from "./walletTransactions";
import {
  formatDusdcBalance,
  loadDusdcBalanceLabel,
  loadPredictManagerBankrollAtomic,
  selectDusdcDepositCoin,
  usdToDusdcAtomic,
} from "./walletBalance";
import { findPredictManagerForOwner } from "./predictManager";
import {
  createPredictPortfolioCloseQuoteClient,
  createPredictPortfolioIndexedEventClient,
  createPredictPortfolioSettlementClient,
  buildPredictPortfolioPositionId,
  formatPortfolioTimeRemaining,
  loadPredictPortfolioSnapshot,
  selectVisiblePortfolioPositions,
  type PredictPortfolioHistoryItem,
  type PredictPortfolioPnlSummary,
  type PredictPortfolioPosition,
} from "./predictPortfolio";
import {
  schedulePostWalletRefresh,
  waitForWalletTransactionFinality,
} from "./walletRefresh";

const quickAmounts = [10, 25, 50, COPY_AMOUNT_MAX];
const MARKET_HEAT_PRICE_REFRESH_MS = 1_000;
const MARKET_HEAT_ROWS_REFRESH_MS = 3_000;
const ORACLE_PRICE_CHART_TICK_REFRESH_MS = 1_000;
const ORACLE_PRICE_CHART_HISTORY_REFRESH_MS = 60_000;
const DEFAULT_SHARE_URL = "https://hothands.app/";
const LOCAL_SHARE_HOSTS = new Set(["127.0.0.1", "0.0.0.0", "::1", "localhost"]);
const MARKET_HEAT_PAGE_SIZE = 8;
const WALLET_LEADERBOARDS_REFRESH_MS = 15_000;
const PORTFOLIO_DATA_REFRESH_MS = 15_000;
const PORTFOLIO_TIME_REFRESH_MS = 15_000;
const TRADE_LADDER_VISIBLE_STRIKE_COUNT = 4;
const TRADE_LADDER_BELOW_TARGET_COUNT = 2;
const DEPOSIT_AMOUNT_DEFAULT = 25;
const DEPOSIT_AMOUNT_MIN = 0.01;
const TOAST_LIMIT = 3;
const TOAST_TIMEOUT_MS = 4_500;
const STAKE_AMOUNT_STORAGE_KEY = "hot-hands-default-stake-amount";
const THEME_STORAGE_KEY = "hot-hands-theme-mode";
const APP_VIEW_QUERY_PARAM = "view";
type PreviewMode = "replay" | "market";
export type AppView = "feed" | "trade" | "leaderboards" | "portfolio" | "profile";
export type AccountSummaryVariant = "default" | "portfolio";
type MarketHeatFeedMode = MarketHeatSortMode | "following";
type MarketHeatIdentityMode = "wallet" | "market";
type ThemeMode = "light" | "dark";
const APP_VIEW_VALUES: AppView[] = ["feed", "trade", "leaderboards", "portfolio", "profile"];
const MARKET_HEAT_DESCRIPTION =
  "Heat combines recency, copied volume, wallet streak, and trade activity.";
export type MarketHeatSwipeAction = "none" | "select" | "copy" | "fade";
type MarketHeatSwipePreview = {
  action: MarketHeatSwipeAction;
  deltaX: number;
  rowId: string;
};
export function shouldShowAccountSummary(view: AppView): boolean {
  return view === "trade" || view === "portfolio";
}

export function getAccountSummaryVariant(view: AppView): AccountSummaryVariant {
  return view === "trade" || view === "portfolio" ? "portfolio" : "default";
}

export function shouldAutoRefreshMarketHeatRows(view: AppView): boolean {
  return view === "feed" || view === "profile";
}

export function getMarketHeatRowsRefreshMs(view: AppView): number | null {
  return shouldAutoRefreshMarketHeatRows(view) ? MARKET_HEAT_ROWS_REFRESH_MS : null;
}

export function shouldAutoRefreshWalletLeaderboards(view: AppView): boolean {
  return view === "leaderboards" || view === "profile";
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function writeThemeMode(themeMode: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
}

export function parseStoredStakeAmount(storedAmount: string | null): number {
  if (!storedAmount) {
    return COPY_AMOUNT_DEFAULT;
  }

  const parsedAmount = Number(storedAmount);
  if (!Number.isFinite(parsedAmount)) {
    return COPY_AMOUNT_DEFAULT;
  }

  return clampCopyAmount(parsedAmount);
}

function readStoredStakeAmount(): number {
  if (typeof window === "undefined") {
    return COPY_AMOUNT_DEFAULT;
  }

  return parseStoredStakeAmount(window.localStorage.getItem(STAKE_AMOUNT_STORAGE_KEY));
}

function writeStoredStakeAmount(amount: number): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STAKE_AMOUNT_STORAGE_KEY, String(clampCopyAmount(amount)));
}

function readStoredCopyAttributions(): CopyAttributionRecord[] {
  return readCopyAttributionRecords(typeof window === "undefined" ? null : window.localStorage);
}

function writeStoredCopyAttributions(records: CopyAttributionRecord[]): void {
  writeCopyAttributionRecords(typeof window === "undefined" ? null : window.localStorage, records);
}

function copyAttributionTargetForMarketHeatRow(row: MarketHeatPreviewRow): CopyAttributionTarget {
  return {
    positionId: buildCopyAttributionSourcePositionId({
      expiryMs: row.expiryMs,
      oracleId: row.oracleId,
      rowId: row.id,
      side: row.side,
      sourceWallet: row.wallet,
      strikeRaw: row.strikeRaw ?? Math.round(row.strike * 1_000_000),
    }),
    sourceWallet: row.wallet,
  };
}

function buildCopyAttributionLabelsByRowId(
  rows: MarketHeatPreviewRow[],
  records: CopyAttributionRecord[],
): Record<string, string> {
  return getCopyableMarketHeatRows(rows).reduce<Record<string, string>>((labels, row) => {
    const summary = summarizeCopyAttribution(copyAttributionTargetForMarketHeatRow(row), records);
    if (summary.count > 0 || summary.amount > 0) {
      labels[row.id] = formatCopyAttributionLabel(summary);
    }
    return labels;
  }, {});
}

function buildCopyAttributionLabelForRows(
  rows: MarketHeatPreviewRow[],
  records: CopyAttributionRecord[],
): string | null {
  if (!rows.length) {
    return null;
  }

  const summary = getCopyableMarketHeatRows(rows)
    .map((row) => summarizeCopyAttribution(copyAttributionTargetForMarketHeatRow(row), records))
    .reduce(
      (total, item) => ({
        amount: total.amount + item.amount,
        count: total.count + item.count,
      }),
      { amount: 0, count: 0 },
    );

  if (summary.count <= 0 && summary.amount <= 0) {
    return null;
  }

  return formatCopyAttributionLabel(summary);
}

export type TradeSide = "UP" | "DOWN";
export type TradeMarketSelection = {
  marketId: string;
  strike: number;
  strikeLabel: string;
  strikeRaw: number;
};
type TradeQuoteStatus = "idle" | "loading" | "ready" | "error";
export type WalletTransactionStatus = "idle" | "pending" | "success" | "error";
export type WalletTransactionState = {
  status: WalletTransactionStatus;
  label: string;
  digest: string | null;
};
export type ToastKind = "success" | "error" | "warning" | "info";
export type AppToast = {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
  digest?: string | null;
  groupKey?: string;
};
export type AppToastInput = Omit<AppToast, "id">;
export type ShareCardState = {
  blob: Blob | null;
  imageUrl: string;
  input: HotHandsShareCardInput;
  text: string;
  xUrl: string;
};
type DusdcBalanceState = {
  accountAddress: string | null;
  refreshKey: number;
  status: "idle" | "loading" | "ready" | "error";
  label: string | null;
};
type PredictManagerBankrollState = {
  accountAddress: string | null;
  managerObjectId: string | null;
  refreshKey: number;
  status: "idle" | "loading" | "ready" | "error";
  atomicBalance: bigint | null;
  label: string | null;
};
type PredictManagerStatus = "idle" | "checking" | "ready" | "missing" | "error";
type PredictManagerState = {
  accountAddress: string | null;
  objectId: string | null;
  refreshKey: number;
  status: PredictManagerStatus;
};
type PredictPortfolioState = {
  history: PredictPortfolioHistoryItem[];
  managerObjectId: string | null;
  pnl: PredictPortfolioPnlSummary;
  refreshKey: number;
  status: "idle" | "loading" | "ready" | "error";
  positions: PredictPortfolioPosition[];
};
type WalletLeaderboardsStatus = "idle" | "loading" | "ready" | "error";
type WalletLeaderboardsState = {
  snapshot: WalletLeaderboardsSnapshot;
  status: WalletLeaderboardsStatus;
};
type ProfileHistoryStatus = "idle" | "loading" | "ready" | "error";
type ProfileHistoryState = {
  history: PredictPortfolioHistoryItem[];
  status: ProfileHistoryStatus;
  wallet: string | null;
};
type ProfileStatTone = "positive" | "negative" | "flat";
type ProfileStatItem = {
  label: string;
  tone?: ProfileStatTone;
  value: string;
};
type ProfileStatSummary = {
  items: ProfileStatItem[];
  sourceLabel: string;
};
type PortfolioTab = "positions" | "history";
type AttributedPortfolioPosition = PredictPortfolioPosition & {
  copiedFromLabel?: string;
};
export type FollowedWallet = {
  displayName: string;
  wallet: string;
};

export function resolveSelectedProfileWalletForNav(
  view: AppView,
  selectedWallet: FollowedWallet | null,
): FollowedWallet | null {
  return view === "profile" ? null : selectedWallet;
}

function isAppView(value: string | null): value is AppView {
  return APP_VIEW_VALUES.includes(value as AppView);
}

export function getInitialAppView(
  search: string | null | undefined,
  readOnlyWalletAddress: string | null,
): AppView {
  const params = new URLSearchParams(search ?? "");
  const view = params.get(APP_VIEW_QUERY_PARAM);

  if (isAppView(view)) {
    return view;
  }

  return readOnlyWalletAddress ? "portfolio" : "feed";
}

export function buildAppViewSearch(
  search: string | null | undefined,
  view: AppView,
): string {
  const params = new URLSearchParams(search ?? "");
  params.set(APP_VIEW_QUERY_PARAM, view);

  return `?${params.toString()}`;
}

function syncAppViewToUrl(view: AppView): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextSearch = buildAppViewSearch(window.location.search, view);
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
}

const idleWalletTransactionState: WalletTransactionState = {
  status: "idle",
  label: "Wallet ready",
  digest: null,
};
const idlePredictPortfolioPnl: PredictPortfolioPnlSummary = {
  costLabel: "$0",
  payoutLabel: "$0",
  pnlAtomic: "0",
  pnlLabel: "$0",
  pnlTone: "flat",
};
const PREDICT_MANAGER_STORAGE_KEY = "hot-hands-predict-manager-id";
const DISMISSED_PORTFOLIO_STORAGE_KEY = "hot-hands-dismissed-portfolio-position-ids";
const FOLLOWED_WALLETS_STORAGE_KEY = "hot-hands-followed-wallets";

export function getInitialPreviewMode(_apiBaseUrl: string | undefined): PreviewMode {
  return "market";
}

function getReadOnlyWalletAddress(): string | null {
  const envAddress = import.meta.env.VITE_HOT_HANDS_DEV_WALLET_ADDRESS;
  const urlAddress =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("devWallet");
  const address = (urlAddress ?? envAddress ?? "").trim();

  return /^0x[0-9a-fA-F]{64}$/.test(address) ? address : null;
}

function formatQuickAmount(amount: number): string {
  return amount === COPY_AMOUNT_MAX ? "MAX" : formatCopyAmount(amount);
}

type ReturnPreview = {
  payoutLabel: string;
  profitLabel: string;
};

function buildReturnPreview(spendUsd: number, estimatedPrice: number | undefined): ReturnPreview | null {
  if (
    !Number.isFinite(spendUsd) ||
    spendUsd <= 0 ||
    estimatedPrice === undefined ||
    !Number.isFinite(estimatedPrice) ||
    estimatedPrice <= 0
  ) {
    return null;
  }

  const payoutUsd = spendUsd / estimatedPrice;
  const profitUsd = payoutUsd - spendUsd;

  if (!Number.isFinite(payoutUsd) || !Number.isFinite(profitUsd)) {
    return null;
  }

  return {
    payoutLabel: formatUsdValue(payoutUsd),
    profitLabel: formatSignedUsdValue(profitUsd),
  };
}

function marketDurationTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const MARKET_HEAT_SWIPE_CONFIRM_THRESHOLD = 86;
const MARKET_HEAT_SWIPE_VERTICAL_TOLERANCE = 38;
const MARKET_HEAT_SWIPE_MAX_OFFSET = 118;

function oppositeTradeSide(side: TradeSide): TradeSide {
  return side === "UP" ? "DOWN" : "UP";
}

function marketHeatIntentModeLabel(mode: MarketHeatIntentMode): "Copy" | "Fade" {
  return mode === "fade" ? "Fade" : "Copy";
}

export function resolveMarketHeatIntentSide(
  rowSide: TradeSide,
  mode: MarketHeatIntentMode,
): TradeSide {
  return mode === "fade" ? oppositeTradeSide(rowSide) : rowSide;
}

export function resolveMarketHeatSwipeAction(
  deltaX: number,
  deltaY: number,
  rowStatus: MarketHeatPreviewRow["status"],
): MarketHeatSwipeAction {
  if (
    Math.abs(deltaX) < MARKET_HEAT_SWIPE_CONFIRM_THRESHOLD ||
    Math.abs(deltaY) > MARKET_HEAT_SWIPE_VERTICAL_TOLERANCE
  ) {
    return "none";
  }

  if (rowStatus !== "copy_ready") {
    return "select";
  }

  return deltaX < 0 ? "fade" : "copy";
}

const TRADE_EXPIRY_DAY_MS = 24 * 60 * 60_000;
const tradeExpiryDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});
const tradeExpiryWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
});

type TradeExpiryOption = {
  count: number;
  expiryMs: number;
  label: string;
  sublabel: string;
  value: string;
};

function tradeExpiryDateKey(expiryMs: number): string {
  const date = new Date(expiryMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function tradeExpiryDayStartMs(expiryMs: number): number {
  const date = new Date(expiryMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatTradeExpiryHorizon(expiryMs: number, nowMs: number): string {
  const dayDelta = Math.round(
    (tradeExpiryDayStartMs(expiryMs) - tradeExpiryDayStartMs(nowMs)) / TRADE_EXPIRY_DAY_MS,
  );

  if (dayDelta === 0) {
    return "Today";
  }

  if (dayDelta === 1) {
    return "Tomorrow";
  }

  if (dayDelta > 1 && dayDelta < 7) {
    return tradeExpiryWeekdayFormatter.format(expiryMs);
  }

  if (dayDelta > 0 && dayDelta % 7 === 0 && dayDelta <= 28) {
    const weeks = dayDelta / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }

  return "";
}

function formatTradeExpiryLabel(expiryMs: number, nowMs: number): string {
  const horizon = formatTradeExpiryHorizon(expiryMs, nowMs);
  return horizon === "Today"
    ? horizon
    : tradeExpiryDateFormatter.format(expiryMs);
}

function formatTradeExpirySublabel(
  expiryMs: number,
  count: number,
  nowMs: number,
): string {
  const horizon = formatTradeExpiryHorizon(expiryMs, nowMs);
  const countSummary = count === 1 ? "1 market" : `${count} markets`;
  const parts: string[] = [];

  if (horizon && horizon !== "Today" && horizon !== "Tomorrow") {
    parts.push(horizon);
  }

  parts.push(countSummary);

  return parts.join(" · ");
}

export function buildTradeExpiryOptions(
  marketRows: TradeMarketLadderRow[],
  nowMs: number,
): TradeExpiryOption[] {
  const expiriesByDate = new Map<
    string,
    {
      count: number;
      earliestExpiryMs: number;
    }
  >();

  for (const marketRow of marketRows) {
    if (marketRow.expiryMs <= nowMs) {
      continue;
    }

    const value = tradeExpiryDateKey(marketRow.expiryMs);
    const existing = expiriesByDate.get(value);

    if (existing) {
      existing.count += 1;
      existing.earliestExpiryMs = Math.min(existing.earliestExpiryMs, marketRow.expiryMs);
      continue;
    }

    expiriesByDate.set(value, {
      count: 1,
      earliestExpiryMs: marketRow.expiryMs,
    });
  }

  return [...expiriesByDate.entries()]
    .map(([value, expiry]) => ({
      count: expiry.count,
      expiryMs: expiry.earliestExpiryMs,
      label: formatTradeExpiryLabel(expiry.earliestExpiryMs, nowMs),
      sublabel: formatTradeExpirySublabel(expiry.earliestExpiryMs, expiry.count, nowMs),
      value,
    }))
    .sort((left, right) => left.expiryMs - right.expiryMs);
}

function selectTradeMarketsForExpiry(
  marketRows: TradeMarketLadderRow[],
  expiryDate: string | null,
): TradeMarketLadderRow[] {
  if (!expiryDate) {
    return marketRows;
  }

  return marketRows.filter((marketRow) => tradeExpiryDateKey(marketRow.expiryMs) === expiryDate);
}

function selectMarketHeatRowsForExpiry(
  rows: MarketHeatPreviewRow[],
  expiryDate: string | null,
): MarketHeatPreviewRow[] {
  if (!expiryDate) {
    return rows;
  }

  return rows.filter((row) => tradeExpiryDateKey(row.expiryMs) === expiryDate);
}

function formatUsdValue(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  })}`;
}

function formatSignedUsdValue(amount: number): string {
  const prefix = amount >= 0 ? "+" : "-";
  return `${prefix}${formatUsdValue(Math.abs(amount))}`;
}

function clampDepositAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return DEPOSIT_AMOUNT_DEFAULT;
  }

  return Math.max(DEPOSIT_AMOUNT_MIN, Math.round(amount * 100) / 100);
}

function buildReturnPreviewFromQuote(quote: TradeQuote): ReturnPreview {
  return {
    payoutLabel: formatUsdValue(quote.payoutUsd),
    profitLabel: formatSignedUsdValue(quote.maxProfitUsd),
  };
}

function parseTradeStrikeInputValue(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return null;
  }

  const strike = Number(normalized);
  return Number.isFinite(strike) && strike > 0 ? strike : null;
}

function buildTradeMarketSelection(marketId: string, option: TradeStrikeOption): TradeMarketSelection {
  return {
    marketId,
    strike: option.strike,
    strikeLabel: option.strikeLabel,
    strikeRaw: option.strikeRaw,
  };
}

function getTradeStrikeOptions(row: TradeMarketLadderRow): TradeStrikeOption[] {
  if (row.strikeOptions?.length) {
    return row.strikeOptions;
  }

  return [
    {
      strike: row.strike,
      strikeLabel: row.strikeLabel,
      strikeRaw: row.strikeRaw,
    },
  ];
}

function getTradeStrikeOptionsForSelection(
  row: TradeMarketLadderRow,
  selection: TradeMarketSelection | null,
): TradeStrikeOption[] {
  const options = getTradeStrikeOptions(row);
  if (
    !selection ||
    selection.marketId !== row.id ||
    options.some((option) => option.strikeRaw === selection.strikeRaw)
  ) {
    return options;
  }

  return [
    {
      strike: selection.strike,
      strikeLabel: selection.strikeLabel,
      strikeRaw: selection.strikeRaw,
    },
    ...options,
  ];
}

function buildTradeMarketSelectionFromRow(row: TradeMarketLadderRow): TradeMarketSelection {
  const selectedOption =
    getTradeStrikeOptions(row).find((option) => option.strikeRaw === row.strikeRaw) ??
    getTradeStrikeOptions(row)[0];

  return {
    marketId: row.id,
    strike: selectedOption.strike,
    strikeLabel: selectedOption.strikeLabel,
    strikeRaw: selectedOption.strikeRaw,
  };
}

export function buildTradeQuoteKey(
  market: TradeMarketLadderRow,
  side: TradeSide,
  spendUsd: number,
): string {
  return [
    market.id,
    market.oracleId,
    market.expiry,
    market.strikeRaw,
    side,
    spendUsd,
  ].join(":");
}

type TradeLadderDisplayRow = {
  key: string;
  market: TradeMarketLadderRow;
  selection: TradeMarketSelection;
};

function buildTradeLadderDisplayRows({
  customStrike,
  marketPriceLabel,
  marketRows,
  selectedMarketId,
}: {
  customStrike?: TradeMarketSelection | null;
  marketPriceLabel?: string | null;
  marketRows: TradeMarketLadderRow[];
  selectedMarketId: string;
}): {
  baseSelectedMarket: TradeMarketLadderRow | null;
  ladderRows: TradeLadderDisplayRow[];
  selectedCustomStrike: TradeMarketSelection | null;
  selectedLadderKey: string | null;
  selectedMarket: TradeMarketLadderRow | null;
} {
  const baseSelectedMarket =
    marketRows.find((market) => market.id === selectedMarketId) ??
    marketRows[0] ??
    null;
  const selectedMarket = baseSelectedMarket
    ? applyCustomStrikeToTradeMarket(baseSelectedMarket, customStrike, marketPriceLabel ?? "") ??
      baseSelectedMarket
    : null;
  const selectedCustomStrike =
    selectedMarket && customStrike?.marketId === selectedMarket.id
      ? customStrike
      : selectedMarket
        ? buildTradeMarketSelectionFromRow(selectedMarket)
        : null;
  const targetStrike =
    parseTradeStrikeInputValue(marketPriceLabel ?? "") ??
    selectedCustomStrike?.strike ??
    selectedMarket?.strike ??
    null;
  const selectedLadderKey =
    selectedMarket && selectedCustomStrike
      ? `${selectedMarket.pairLabel}:${selectedMarket.intervalLabel}:${selectedMarket.timeRemainingLabel}:${selectedCustomStrike.strikeLabel}`
      : null;
  const allLadderRows = marketRows.reduce<TradeLadderDisplayRow[]>((rows, baseMarket) => {
    const strikeOptions = getTradeStrikeOptionsForSelection(
      baseMarket,
      baseMarket.id === baseSelectedMarket?.id ? selectedCustomStrike : null,
    );

    for (const option of strikeOptions) {
      const selection = buildTradeMarketSelection(baseMarket.id, option);
      const market =
        applyCustomStrikeToTradeMarket(baseMarket, selection, marketPriceLabel ?? "") ??
        baseMarket;
      const key = `${market.pairLabel}:${market.intervalLabel}:${market.timeRemainingLabel}:${selection.strikeLabel}`;
      const candidate = { key, market, selection };
      const existingIndex = rows.findIndex((row) => row.key === key);

      if (existingIndex === -1) {
        rows.push(candidate);
      } else if (key === selectedLadderKey && baseMarket.id === baseSelectedMarket?.id) {
        rows[existingIndex] = candidate;
      }
    }

    return rows;
  }, []);
  const ladderRows = selectVisibleTradeLadderRows(
    allLadderRows,
    targetStrike,
    selectedLadderKey,
  );

  return {
    baseSelectedMarket,
    ladderRows,
    selectedCustomStrike,
    selectedLadderKey,
    selectedMarket,
  };
}

function buildOraclePriceChartMarketContext({
  marketRows,
  selectedMarket,
  selectedSide,
}: {
  marketRows: TradeMarketLadderRow[];
  selectedMarket: TradeMarketLadderRow | null;
  selectedSide: TradeSide;
}): OraclePriceChartMarketContext | null {
  if (!selectedMarket) {
    return null;
  }

  const selectedStrike: TradeMarketSelection = {
    marketId: selectedMarket.id,
    strike: selectedMarket.strike,
    strikeLabel: selectedMarket.strikeLabel,
    strikeRaw: selectedMarket.strikeRaw,
  };
  const strikeRows =
    marketRows.filter(
      (row) =>
        row.oracleId === selectedMarket.oracleId &&
        row.expiryMs === selectedMarket.expiryMs,
    );
  const strikeMap = new Map<string, OraclePriceChartMarketContext["strikes"][number]>();

  for (const row of strikeRows.length ? strikeRows : [selectedMarket]) {
    const options = getTradeStrikeOptionsForSelection(
      row,
      row.id === selectedMarket.id ? selectedStrike : null,
    );

    for (const option of options) {
      const selected =
        option.strikeRaw === selectedMarket.strikeRaw ||
        option.strike === selectedMarket.strike;
      const existing = strikeMap.get(String(option.strikeRaw));

      if (existing?.selected) {
        continue;
      }

      strikeMap.set(String(option.strikeRaw), {
        id: `${row.id}:${option.strikeRaw}`,
        label: option.strikeLabel,
        price: option.strike,
        selected,
      });
    }
  }

  return {
    expiryLabel: selectedMarket.expiryTimeLabel,
    expiryMs: selectedMarket.expiryMs,
    selectedSide,
    selectedStrikeLabel: selectedMarket.strikeLabel,
    selectedStrikePrice: selectedMarket.strike,
    strikes: [...strikeMap.values()]
      .filter((strike) => Number.isFinite(strike.price) && strike.price > 0)
      .sort(
        (left, right) =>
          left.price - right.price ||
          left.label.localeCompare(right.label),
      ),
    timeRemainingLabel: selectedMarket.timeRemainingLabel,
  };
}

function selectVisibleTradeLadderRows(
  rows: TradeLadderDisplayRow[],
  targetStrike: number | null,
  selectedLadderKey: string | null,
): TradeLadderDisplayRow[] {
  if (rows.length <= TRADE_LADDER_VISIBLE_STRIKE_COUNT) {
    return rows;
  }

  const sortedRows = [...rows].sort(compareTradeLadderDisplayRows);
  const fallbackTarget = sortedRows[Math.floor(sortedRows.length / 2)]?.selection.strike ?? null;
  const target =
    targetStrike !== null && Number.isFinite(targetStrike) ? targetStrike : fallbackTarget;
  const belowTarget = sortedRows.filter((row) => row.selection.strike < (target ?? 0));
  const atOrAboveTarget = sortedRows.filter((row) => row.selection.strike >= (target ?? 0));
  const selectedRows: TradeLadderDisplayRow[] = [
    ...belowTarget.slice(-TRADE_LADDER_BELOW_TARGET_COUNT),
    ...atOrAboveTarget.slice(
      0,
      TRADE_LADDER_VISIBLE_STRIKE_COUNT - TRADE_LADDER_BELOW_TARGET_COUNT,
    ),
  ];
  const selectedKeys = new Set(selectedRows.map((row) => row.key));
  const backfillRows = [
    ...belowTarget.slice(0, -TRADE_LADDER_BELOW_TARGET_COUNT).reverse(),
    ...atOrAboveTarget.slice(
      TRADE_LADDER_VISIBLE_STRIKE_COUNT - TRADE_LADDER_BELOW_TARGET_COUNT,
    ),
  ];

  for (const row of backfillRows) {
    if (selectedRows.length >= TRADE_LADDER_VISIBLE_STRIKE_COUNT) {
      break;
    }

    if (selectedKeys.has(row.key)) {
      continue;
    }

    selectedKeys.add(row.key);
    selectedRows.push(row);
  }

  const selectedRow = selectedLadderKey
    ? sortedRows.find((row) => row.key === selectedLadderKey)
    : undefined;
  if (selectedRow && !selectedKeys.has(selectedRow.key)) {
    const replaceIndex = selectedRows.reduce(
      (furthestIndex, row, index) => {
        const currentDistance = Math.abs(row.selection.strike - (target ?? row.selection.strike));
        const furthestDistance = Math.abs(
          selectedRows[furthestIndex].selection.strike -
            (target ?? selectedRows[furthestIndex].selection.strike),
        );

        return currentDistance >= furthestDistance ? index : furthestIndex;
      },
      0,
    );

    selectedRows[replaceIndex] = selectedRow;
  }

  return selectedRows.sort(compareTradeLadderDisplayRows);
}

function compareTradeLadderDisplayRows(
  left: TradeLadderDisplayRow,
  right: TradeLadderDisplayRow,
): number {
  return (
    left.selection.strike - right.selection.strike ||
    left.selection.strikeRaw - right.selection.strikeRaw ||
    left.key.localeCompare(right.key)
  );
}

function applyCustomStrikeToTradeMarket(
  market: TradeMarketLadderRow,
  customStrike: TradeMarketSelection | null | undefined,
  spotPriceLabel: string,
): TradeMarketLadderRow | null {
  if (!customStrike || customStrike.marketId !== market.id) {
    return market;
  }

  const spot = parseTradeStrikeInputValue(spotPriceLabel);
  const isBaseStrike = customStrike.strikeRaw === market.strikeRaw;

  return {
    ...market,
    strike: customStrike.strike,
    strikeLabel: customStrike.strikeLabel,
    strikeRaw: customStrike.strikeRaw,
    ...selectTradeMarketStrikePrices(market, customStrike.strikeRaw, isBaseStrike),
    moneynessLabel:
      spot === null
        ? market.moneynessLabel
        : formatTradeMoneyness(customStrike.strike - spot),
  };
}

function selectTradeMarketStrikePrices(
  market: TradeMarketLadderRow,
  strikeRaw: number,
  isBaseStrike: boolean,
): Pick<TradeMarketLadderRow, "up" | "down"> {
  const indicativeUp = computeOracleIndicativeUpPrice(market.pricingModel, strikeRaw);

  if (indicativeUp !== undefined) {
    return {
      up: withEstimatedPrice(market.up, indicativeUp),
      down: withEstimatedPrice(market.down, Math.max(0, Math.min(1, 1 - indicativeUp))),
    };
  }

  return {
    up: isBaseStrike ? market.up : withoutEstimatedPrice(market.up),
    down: isBaseStrike ? market.down : withoutEstimatedPrice(market.down),
  };
}

function withEstimatedPrice(
  summary: TradeMarketSideSummary,
  estimatedPrice: number,
): TradeMarketSideSummary {
  return {
    ...summary,
    estimatedPrice,
  };
}

function withoutEstimatedPrice(summary: TradeMarketSideSummary): TradeMarketSideSummary {
  const { estimatedPrice, ...summaryWithoutEstimate } = summary;
  void estimatedPrice;
  return summaryWithoutEstimate;
}

function formatTradeMoneyness(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) {
    return "At spot";
  }

  const prefix = delta > 0 ? "+" : "-";
  return `${prefix}${formatUsdValue(Math.abs(delta))} vs spot`;
}

function formatTradeSidePrice(sideSummary: TradeMarketLadderRow["up"] | null | undefined): string {
  if (
    sideSummary?.estimatedPrice === undefined ||
    !Number.isFinite(sideSummary.estimatedPrice)
  ) {
    return "Quote";
  }

  return `$${sideSummary.estimatedPrice.toFixed(2)}`;
}

function formatTradeQuotePrice(quote: TradeQuote): string {
  return `$${quote.effectivePrice.toFixed(2)}`;
}

function formatTradeOutcome(side: TradeSide, strikeLabel: string): string {
  return `Wins if BTC settles ${side === "UP" ? "above" : "below"} ${strikeLabel}`;
}

function CopyAmountControls({
  ariaLabel,
  copyAmount,
  onAmountSet,
  stopPropagation = false,
}: {
  ariaLabel: string;
  copyAmount: number;
  onAmountSet: (amount: number) => void;
  stopPropagation?: boolean;
}) {
  const stopEvent = (event: SyntheticEvent) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  return (
    <div className="copy-amount-controls">
      <div className="chip-row" aria-label={ariaLabel}>
        {quickAmounts.map((amount) => (
          <button
            type="button"
            className={copyAmount === amount ? "selected-chip" : ""}
            key={amount}
            onClick={(event) => {
              stopEvent(event);
              onAmountSet(amount);
            }}
          >
            {formatQuickAmount(amount)}
          </button>
        ))}
      </div>
      <label className="custom-copy-amount">
        <span>Custom</span>
        <span className="custom-copy-amount-field">
          <span aria-hidden="true">$</span>
          <input
            aria-label="Custom copy amount"
            data-testid="custom-copy-amount"
            inputMode="numeric"
            min={COPY_AMOUNT_MIN}
            max={COPY_AMOUNT_MAX}
            step="0.01"
            type="number"
            value={copyAmount}
            onClick={stopEvent}
            onChange={(event) => onAmountSet(Number(event.currentTarget.value))}
          />
        </span>
      </label>
    </div>
  );
}

function WalletIdenticon({
  compact = false,
  displayName,
  wallet,
}: {
  compact?: boolean;
  displayName: string;
  wallet: string;
}) {
  const seed = walletIdenticonSeed(wallet || displayName);
  const bars = [0, 1, 2, 3].map((index) => (seed >> (index * 3)) & 7);

  return (
    <span
      className={`wallet-identicon${compact ? " wallet-identicon-compact" : ""}`}
      style={walletIdenticonStyle(wallet || displayName)}
      aria-hidden="true"
    >
      {bars.map((value, index) => (
        <span
          className="wallet-identicon-mark"
          key={index}
          style={{
            height: `${34 + value * 7}%`,
            opacity: 0.46 + (value % 4) * 0.12,
          }}
        />
      ))}
    </span>
  );
}

function walletIdenticonSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function walletIdenticonStyle(value: string): CSSProperties & {
  "--hh-identicon-a": string;
  "--hh-identicon-b": string;
  "--hh-identicon-c": string;
} {
  const seed = walletIdenticonSeed(value);
  const hueA = seed % 360;
  const hueB = (hueA + 86 + ((seed >> 8) % 56)) % 360;
  const hueC = (hueA + 188 + ((seed >> 16) % 42)) % 360;

  return {
    "--hh-identicon-a": `hsl(${hueA} 82% 58%)`,
    "--hh-identicon-b": `hsl(${hueB} 78% 52%)`,
    "--hh-identicon-c": `hsl(${hueC} 84% 64%)`,
  };
}

function isLiveCountdownLabel(label: string | null | undefined): boolean {
  if (!label || label === "Expired") {
    return false;
  }

  const match = /^(\d+)([mh]) left$/i.exec(label);
  if (!match) {
    return false;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  return unit === "m" || value <= 24;
}

function parsePnlAtomicLabel(item: PredictPortfolioHistoryItem): number | null {
  if (!item.pnlAtomic) {
    return null;
  }

  try {
    return Number(BigInt(item.pnlAtomic)) / 1_000_000;
  } catch {
    return null;
  }
}

function formatSparklineUsd(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) {
    return "$0";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}$${Math.abs(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function buildProfilePnlSparkline(historyItems: PredictPortfolioHistoryItem[]): {
  latestLabel: string;
  path: string;
  tone: ProfileStatTone;
} | null {
  let cumulativePnl = 0;
  const values = [0];

  for (const item of [...historyItems].reverse()) {
    const pnl = parsePnlAtomicLabel(item);
    if (pnl === null || !Number.isFinite(pnl)) {
      continue;
    }

    cumulativePnl += pnl;
    values.push(cumulativePnl);
  }

  if (values.length < 2) {
    return null;
  }

  const width = 120;
  const height = 34;
  const padding = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const points = values.map((value, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * usableWidth;
    const y = height - padding - ((value - min) / range) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const latest = values[values.length - 1] ?? 0;

  return {
    latestLabel: formatSparklineUsd(latest),
    path: `M ${points.join(" L ")}`,
    tone: latest > 0 ? "positive" : latest < 0 ? "negative" : "flat",
  };
}

function ProfilePnlSparkline({
  historyItems,
}: {
  historyItems: PredictPortfolioHistoryItem[];
}) {
  const sparkline = buildProfilePnlSparkline(historyItems);

  if (!sparkline) {
    return null;
  }

  return (
    <div
      className={`profile-pnl-sparkline profile-pnl-sparkline-${sparkline.tone}`}
      data-testid="profile-pnl-sparkline"
    >
      <span>
        <small>PNL path</small>
        <strong>{sparkline.latestLabel}</strong>
      </span>
      <svg viewBox="0 0 120 34" role="img" aria-label={`Profile PNL path ${sparkline.latestLabel}`}>
        <path className="profile-pnl-sparkline-baseline" d="M 3,31 L 117,31" />
        <path className="profile-pnl-sparkline-line" d={sparkline.path} />
      </svg>
    </div>
  );
}

function formatWalletAddress(address: string | null | undefined): string {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function buildCopiedPositionSourceLabels(
  records: CopyAttributionRecord[],
  copierAddress: string | null,
): Map<string, string> {
  const labels = new Map<string, string>();
  const normalizedCopier = copierAddress?.toLowerCase() ?? null;

  if (!normalizedCopier) {
    return labels;
  }

  for (const record of records) {
    if (
      !record.copied_position_id ||
      record.copier.toLowerCase() !== normalizedCopier ||
      labels.has(record.copied_position_id)
    ) {
      continue;
    }

    labels.set(record.copied_position_id, `Copied from ${formatWalletAddress(record.source_wallet)}`);
  }

  return labels;
}

function addCopiedSourceLabelsToPortfolioPositions(
  positions: PredictPortfolioPosition[],
  labelsByPositionId: ReadonlyMap<string, string>,
): AttributedPortfolioPosition[] {
  return positions.map((position) => {
    const copiedFromLabel = labelsByPositionId.get(position.id);
    return copiedFromLabel ? { ...position, copiedFromLabel } : position;
  });
}

function profileStatValue(
  summary: ProfileStatSummary,
  label: string,
  fallback = "--",
): string {
  return summary.items.find((item) => item.label === label)?.value ?? fallback;
}

function buildProfileShareStats(summary: ProfileStatSummary): HotHandsShareStat[] {
  return [
    { label: "Win rate", value: profileStatValue(summary, "Win rate") },
    { label: "PnL", value: profileStatValue(summary, "All-time PNL") },
    { label: "Streak", value: profileStatValue(summary, "Current streak") },
    { label: "Calls", value: profileStatValue(summary, "Total calls") },
  ];
}

function buildCallShareStats(
  row: MarketHeatPreviewRow,
  copiedLabel: string | undefined,
): HotHandsShareStat[] {
  return [
    { label: "Heat", value: String(row.heatScore) },
    { label: "Copied", value: copiedLabel?.replace(/^Copied by\s+/i, "") ?? "On-chain" },
  ];
}

function currentShareUrl(): string {
  const configuredShareUrl = normalizeShareUrl(import.meta.env.VITE_HOT_HANDS_SHARE_URL);

  if (typeof window === "undefined") {
    return configuredShareUrl ?? DEFAULT_SHARE_URL;
  }

  const url = new URL(window.location.href);
  if (LOCAL_SHARE_HOSTS.has(url.hostname)) {
    return configuredShareUrl ?? DEFAULT_SHARE_URL;
  }

  return `${url.origin}${url.pathname}`;
}

function normalizeShareUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

async function renderShareCard(input: HotHandsShareCardInput): Promise<ShareCardState> {
  const canvas = document.createElement("canvas");
  drawHotHandsShareCard(canvas, input);
  const imageUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/png");
  });

  return {
    blob,
    imageUrl,
    input,
    text: buildHotHandsShareText(input),
    xUrl: buildShareToXUrl(input),
  };
}

async function copyShareCardToClipboard(card: ShareCardState): Promise<"image" | "text"> {
  const clipboard = navigator.clipboard;
  const clipboardItem =
    typeof window !== "undefined" && "ClipboardItem" in window
      ? (window as Window & { ClipboardItem: typeof ClipboardItem }).ClipboardItem
      : null;

  if (card.blob && clipboard?.write && clipboardItem) {
    try {
      await clipboard.write([new clipboardItem({ [card.blob.type]: card.blob })]);
      return "image";
    } catch {
      // Fall through to text when image clipboard support is unavailable.
    }
  }

  if (!clipboard?.writeText) {
    throw new Error("Clipboard is unavailable.");
  }

  await clipboard.writeText(card.text);
  return "text";
}

function walletErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Wallet request failed.";
}

export function buildWalletToast(txState: WalletTransactionState): AppToastInput | null {
  if (txState.status === "idle") {
    return null;
  }

  if (txState.status === "pending") {
    return {
      groupKey: "wallet-tx",
      kind: "info",
      title: "Wallet request",
      message: txState.label,
      digest: txState.digest,
    };
  }

  if (txState.status === "success") {
    return {
      groupKey: "wallet-tx",
      kind: "success",
      title: "Done",
      message: txState.label,
      digest: txState.digest,
    };
  }

  const isWarning = isWalletWarningLabel(txState.label);
  return {
    groupKey: "wallet-tx",
    kind: isWarning ? "warning" : "error",
    title: isWarning ? "Check bankroll" : "Action needed",
    message: txState.label,
    digest: txState.digest,
  };
}

function isWalletWarningLabel(label: string): boolean {
  return /deposit bankroll|wait for a live quote|create a predict account/i.test(label);
}

function walletResultDigest(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  if ("Transaction" in result) {
    const transaction = (result as { Transaction?: { digest?: unknown } }).Transaction;
    return typeof transaction?.digest === "string" ? transaction.digest : null;
  }

  return null;
}

function walletResultError(result: unknown): string | null {
  if (!result || typeof result !== "object" || !("FailedTransaction" in result)) {
    return null;
  }

  const failed = (result as {
    FailedTransaction?: { status?: { error?: { message?: unknown } | string | null } };
  }).FailedTransaction;
  const error = failed?.status?.error;
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && typeof error.message === "string") {
    return error.message;
  }

  return "Transaction failed.";
}

function parseAtomicQuoteCost(cost: string): bigint | null {
  return /^\d+$/.test(cost) ? BigInt(cost) : null;
}

function readStoredPredictManagerObjectId(accountAddress: string | null): string | null {
  if (typeof window === "undefined" || !accountAddress) {
    return null;
  }

  return window.localStorage.getItem(`${PREDICT_MANAGER_STORAGE_KEY}:${accountAddress}`) ?? null;
}

function writeStoredPredictManagerObjectId(accountAddress: string, objectId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${PREDICT_MANAGER_STORAGE_KEY}:${accountAddress}`, objectId);
}

function readDismissedPortfolioPositionIds(managerObjectId: string | null): Set<string> {
  if (typeof window === "undefined" || !managerObjectId) {
    return new Set();
  }

  const stored = window.localStorage.getItem(
    `${DISMISSED_PORTFOLIO_STORAGE_KEY}:${managerObjectId}`,
  );
  if (!stored) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeDismissedPortfolioPositionIds(
  managerObjectId: string,
  positionIds: ReadonlySet<string>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    `${DISMISSED_PORTFOLIO_STORAGE_KEY}:${managerObjectId}`,
    JSON.stringify([...positionIds]),
  );
}

function readFollowedWallets(): FollowedWallet[] {
  if (typeof window === "undefined") {
    return [];
  }

  const stored = window.localStorage.getItem(FOLLOWED_WALLETS_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item): FollowedWallet | null => {
        if (typeof item === "string") {
          const wallet = normalizeProfileWalletAddress(item);
          return wallet ? { displayName: formatWalletAddress(wallet), wallet } : null;
        }

        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        const wallet =
          typeof record.wallet === "string"
            ? normalizeProfileWalletAddress(record.wallet)
            : null;
        if (!wallet) {
          return null;
        }

        return {
          displayName:
            typeof record.displayName === "string" && record.displayName.trim()
              ? record.displayName.trim()
              : formatWalletAddress(wallet),
          wallet,
        };
      })
      .filter((wallet): wallet is FollowedWallet => wallet !== null);
  } catch {
    return [];
  }
}

function writeFollowedWallets(wallets: FollowedWallet[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FOLLOWED_WALLETS_STORAGE_KEY, JSON.stringify(wallets));
}

function normalizeProfileWalletAddress(wallet: string): string | null {
  const normalized = wallet.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(normalized) ? normalized : null;
}

function mergeFollowedWallet(
  wallets: FollowedWallet[],
  wallet: FollowedWallet,
): FollowedWallet[] {
  const normalizedWallet = normalizeProfileWalletAddress(wallet.wallet);
  if (!normalizedWallet) {
    return wallets;
  }

  const nextWallet = {
    displayName: wallet.displayName.trim() || formatWalletAddress(normalizedWallet),
    wallet: normalizedWallet,
  };
  const existingIndex = wallets.findIndex(
    (followedWallet) => followedWallet.wallet.toLowerCase() === normalizedWallet.toLowerCase(),
  );

  if (existingIndex === -1) {
    return [nextWallet, ...wallets];
  }

  return wallets.map((followedWallet, index) =>
    index === existingIndex ? nextWallet : followedWallet,
  );
}

export function filterMarketHeatRowsByFollowedWallets(
  rows: MarketHeatPreviewRow[],
  followedWallets: FollowedWallet[],
): MarketHeatPreviewRow[] {
  if (!followedWallets.length) {
    return [];
  }

  const followedWalletKeys = new Set(
    followedWallets.map((wallet) => wallet.wallet.toLowerCase()),
  );

  return rows.filter((row) => followedWalletKeys.has(row.wallet.toLowerCase()));
}

type WalletHeaderControlProps = {
  accountAddress: string | null;
  connectionStatus: string;
  readOnly?: boolean;
  walletChoices?: WalletChoice[];
  walletChooserOpen?: boolean;
  walletCount: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onWalletSelect?: (walletIndex: number) => void;
};

type WalletChoice = Pick<UiWallet, "name"> & Partial<Pick<UiWallet, "icon">>;

type WalletStatusBarProps = WalletHeaderControlProps & {
  networkLabel: string;
  predictManagerObjectId: string | null;
  predictManagerStatus: PredictManagerStatus;
  txState: WalletTransactionState;
  walletName: string | null;
  onCreatePredictManager: () => void;
};

export function WalletHeaderControl({
  accountAddress,
  connectionStatus,
  readOnly = false,
  walletChoices = [],
  walletChooserOpen = false,
  walletCount,
  onConnect,
  onDisconnect,
  onWalletSelect = () => undefined,
}: WalletHeaderControlProps) {
  const isConnected = Boolean(accountAddress);
  const canChooseWallet = walletChoices.length > 1;
  const connectLabel =
    walletCount === 0
      ? "Install wallet"
      : connectionStatus === "connecting" || connectionStatus === "reconnecting"
        ? "Connecting"
        : canChooseWallet
          ? "Choose wallet"
          : "Connect wallet";

  if (isConnected) {
    return (
      <button
        type="button"
        aria-label={readOnly ? "Read-only wallet" : "Disconnect wallet"}
        className="wallet-header-button wallet-header-button-connected"
        data-testid={readOnly ? "wallet-readonly" : "wallet-disconnect"}
        disabled={readOnly}
        onClick={readOnly ? undefined : onDisconnect}
      >
        <strong data-testid="wallet-address">{formatWalletAddress(accountAddress)}</strong>
        <span>{readOnly ? "Read-only" : "Connected"}</span>
      </button>
    );
  }

  return (
    <div className="wallet-connect-control">
      <button
        type="button"
        className="wallet-header-button"
        data-testid="wallet-connect"
        disabled={walletCount === 0 || connectionStatus === "connecting"}
        onClick={onConnect}
      >
        {connectLabel}
      </button>
      {walletChooserOpen && canChooseWallet ? (
        <div
          className="wallet-picker"
          aria-label="Choose wallet"
          data-testid="wallet-picker"
        >
          {walletChoices.map((wallet, index) => (
            <button
              type="button"
              className="wallet-picker-option"
              data-testid={`wallet-choice-${index}`}
              key={`${wallet.name}-${index}`}
              onClick={() => onWalletSelect(index)}
            >
              {wallet.icon ? (
                <img src={wallet.icon} alt="" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">{wallet.name.slice(0, 2).toUpperCase()}</span>
              )}
              <strong>Connect {wallet.name}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WalletStatusBar({
  accountAddress,
  predictManagerStatus,
  readOnly = false,
  txState,
  onCreatePredictManager,
}: WalletStatusBarProps) {
  const needsPredictManagerAction =
    accountAddress &&
    !readOnly &&
    (predictManagerStatus === "missing" || predictManagerStatus === "error");

  if (!needsPredictManagerAction) {
    return null;
  }

  return (
    <section className="wallet-status-bar" aria-label="Predict account" data-testid="wallet-status">
      <div
        className={`predict-manager-status predict-manager-status-${predictManagerStatus}`}
        aria-live="polite"
      >
        <span data-testid="predict-manager-status">
          {predictManagerStatus === "error"
            ? "Could not check Predict account"
            : "No Predict account yet"}
        </span>
        <button
          type="button"
          data-testid="create-predict-manager"
          disabled={txState.status === "pending"}
          onClick={onCreatePredictManager}
        >
          {txState.status === "pending" ? "Sending..." : "Create Predict account"}
        </button>
      </div>
    </section>
  );
}

export function ToastStack({
  onDismiss,
  toasts,
}: {
  onDismiss: (toastId: string) => void;
  toasts: AppToast[];
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <section
      className="toast-stack"
      aria-label="Notifications"
      aria-live="polite"
      data-testid="toast-stack"
    >
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          data-testid={`toast-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <div>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
            {toast.digest ? <small>Tx {formatWalletAddress(toast.digest)}</small> : null}
          </div>
          <button
            type="button"
            aria-label={`Dismiss ${toast.title}`}
            onClick={() => onDismiss(toast.id)}
          >
            x
          </button>
        </article>
      ))}
    </section>
  );
}

export function BottomNav({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}) {
  const items: Array<{ label: string; view: AppView }> = [
    { label: "Feed", view: "feed" },
    { label: "Leaders", view: "leaderboards" },
    { label: "Trade", view: "trade" },
    { label: "Portfolio", view: "portfolio" },
    { label: "Profile", view: "profile" },
  ];

  return (
    <nav className="bottom-nav" aria-label="Primary" data-testid="bottom-nav">
      {items.map((item) => (
        <button
          type="button"
          aria-pressed={activeView === item.view}
          key={item.view}
          onClick={() => onViewChange(item.view)}
        >
          <NavIcon view={item.view} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function NavIcon({ view }: { view: AppView }) {
  return (
    <svg
      aria-hidden="true"
      className="bottom-nav-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {view === "feed" ? (
        <>
          <path d="M13.2 2.6c.6 2.9-.8 4.6-2.1 6.1-1.2 1.3-2.3 2.6-1.8 4.7" />
          <path d="M17.8 8.1c2 2.1 2.8 5.3 1.3 8.2-1.4 2.8-4.1 4.5-7.1 4.5s-5.4-1.5-6.8-4.1c-1.4-2.7-.7-5.8 1.8-8.4" />
          <path d="M12.1 20.8c2.1-1 2.8-2.7 2.3-4.6-.4-1.5-1.5-2.4-2.8-3.3-.4 1.7-2.2 2.3-2.5 4.1-.3 1.7.8 3.1 3 3.8Z" />
        </>
      ) : view === "leaderboards" ? (
        <>
          <path d="M7 4h10v3.5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4.5a2.5 2.5 0 0 0 2.8 3.6" />
          <path d="M17 6h2.5a2.5 2.5 0 0 1-2.8 3.6" />
          <path d="M12 12.5V17" />
          <path d="M8.5 20h7" />
          <path d="M10 17h4" />
        </>
      ) : view === "trade" ? (
        <>
          <path d="M7 7h11" />
          <path d="m15 4 3 3-3 3" />
          <path d="M17 17H6" />
          <path d="m9 14-3 3 3 3" />
        </>
      ) : view === "portfolio" ? (
        <>
          <path d="M4.5 8.5h15a1.5 1.5 0 0 1 1.5 1.5v7.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12" />
          <path d="M16.5 13.5H21" />
          <path d="M17.8 13.5h.1" />
        </>
      ) : (
        <>
          <path d="M20 21a8 8 0 0 0-16 0" />
          <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
        </>
      )}
    </svg>
  );
}

function ThemeModeIcon({ mode }: { mode: ThemeMode }) {
  return (
    <svg
      aria-hidden="true"
      className="theme-mode-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {mode === "light" ? (
        <>
          <path d="M12 3v2" />
          <path d="M12 19v2" />
          <path d="M4.22 4.22l1.42 1.42" />
          <path d="M18.36 18.36l1.42 1.42" />
          <path d="M3 12h2" />
          <path d="M19 12h2" />
          <path d="M4.22 19.78l1.42-1.42" />
          <path d="M18.36 5.64l1.42-1.42" />
          <circle cx="12" cy="12" r="4" />
        </>
      ) : (
        <path d="M20.5 14.2A7.8 7.8 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2Z" />
      )}
    </svg>
  );
}

export function ShareCardModal({
  card,
  onClose,
  onCopy,
  onShareToX,
}: {
  card: ShareCardState;
  onClose: () => void;
  onCopy: () => void;
  onShareToX: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <section
      className="share-card-overlay"
      aria-label="Share card"
      data-testid="share-card-modal"
      role="dialog"
      onClick={onClose}
    >
      <article className="share-card-panel" onClick={(event) => event.stopPropagation()}>
        <div className="share-card-header">
          <div>
            <span>Share card</span>
            <strong>{card.input.kind === "call" ? "Call ready for X" : "Profile ready for X"}</strong>
          </div>
          <button
            type="button"
            aria-label="Close share card"
            className="share-card-close"
            onClick={onClose}
          >
            x
          </button>
        </div>
        <img src={card.imageUrl} alt="Generated Hot Hands share card" />
        <div className="share-card-actions">
          <button type="button" data-testid="share-card-x" onClick={onShareToX}>
            Share to X
          </button>
          <button type="button" data-testid="share-card-copy" onClick={onCopy}>
            Copy image/link
          </button>
        </div>
      </article>
    </section>
  );
}

function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

function TradeExpiryRail({
  allSelected = false,
  ariaLabel = "Trade expiration dates",
  includeAllOption = false,
  onAllSelect = () => undefined,
  onExpiryChange,
  options,
  selectedExpiryDate,
  testIdPrefix = "trade-expiry",
}: {
  allSelected?: boolean;
  ariaLabel?: string;
  includeAllOption?: boolean;
  onAllSelect?: () => void;
  onExpiryChange: (expiryDate: string) => void;
  options: TradeExpiryOption[];
  selectedExpiryDate: string | null;
  testIdPrefix?: string;
}) {
  if (!includeAllOption && !options.length) {
    return null;
  }

  return (
    <div className="trade-expiry-rail" aria-label={ariaLabel}>
      {includeAllOption ? (
        <button
          type="button"
          className="trade-expiry-option"
          aria-pressed={allSelected}
          data-testid={`${testIdPrefix}-all`}
          onClick={onAllSelect}
        >
          <strong>All</strong>
          <small>{options.length ? `${options.length} dates` : "No dates"}</small>
        </button>
      ) : null}
      {options.map((option) => (
        <button
          type="button"
          className="trade-expiry-option"
          aria-pressed={selectedExpiryDate === option.value}
          data-testid={`${testIdPrefix}-${marketDurationTestId(option.value)}`}
          key={option.value}
          onClick={() => onExpiryChange(option.value)}
        >
          <strong>{option.label}</strong>
          <small>{option.sublabel}</small>
        </button>
      ))}
    </div>
  );
}

function sortTradeMarketCards(
  left: TradeMarketLadderRow,
  right: TradeMarketLadderRow,
): number {
  return (
    left.expiryMs - right.expiryMs ||
    right.tradeCount - left.tradeCount ||
    left.strike - right.strike ||
    left.id.localeCompare(right.id)
  );
}

function TradeMarketCard({
  canSubmitTrade,
  copyAmount,
  customStrike = null,
  isSelectedMarket,
  marketPriceLabel = null,
  marketRow,
  quote = null,
  quoteStatus = "idle",
  returnPreview,
  selectedSide,
  tradeWalletButtonLabel,
  walletActionPending = false,
  onAmountSet,
  onMarketChange,
  onSideChange,
  onWalletSubmit,
}: {
  canSubmitTrade: boolean;
  copyAmount: number;
  customStrike?: TradeMarketSelection | null;
  isSelectedMarket: boolean;
  marketPriceLabel?: string | null;
  marketRow: TradeMarketLadderRow;
  quote?: TradeQuote | null;
  quoteStatus?: TradeQuoteStatus;
  returnPreview: ReturnPreview | null;
  selectedSide: TradeSide;
  tradeWalletButtonLabel: string;
  walletActionPending?: boolean;
  onAmountSet: (amount: number) => void;
  onMarketChange: (selection: TradeMarketSelection) => void;
  onSideChange: (side: TradeSide) => void;
  onWalletSubmit: () => void;
}) {
  const {
    ladderRows,
    selectedLadderKey,
    selectedMarket,
  } = buildTradeLadderDisplayRows({
    customStrike: isSelectedMarket ? customStrike : null,
    marketPriceLabel,
    marketRows: [marketRow],
    selectedMarketId: marketRow.id,
  });
  const cardMarket = selectedMarket ?? marketRow;
  const spotPrice = marketPriceLabel ? parseTradeStrikeInputValue(marketPriceLabel) : null;
  const spotLineIndex =
    spotPrice === null
      ? -1
      : ladderRows.findIndex((row) => row.selection.strike >= spotPrice);
  const normalizedSpotLineIndex =
    spotPrice === null || ladderRows.length === 0
      ? -1
      : spotLineIndex === -1
        ? ladderRows.length
        : spotLineIndex;
  const selectedQuoteStatus = isSelectedMarket ? quoteStatus : "idle";
  const selectedQuote = isSelectedMarket ? quote : null;

  return (
    <div className="trade-ticket-panel" data-testid="trade-market-card">
      <div className="trade-ticket-title-row">
        <div className="trade-ticket-title">
          <p>Up/Down</p>
          <strong>BTC strike ladder</strong>
        </div>
        <span className="trade-duration-pill">{cardMarket.intervalLabel}</span>
      </div>

      <div className="trade-ticket-stats">
        <span>
          <small>{cardMarket.pairLabel}</small>
          {marketPriceLabel ?? "Live market"}
        </span>
        <span>
          <small>Expiry</small>
          {cardMarket.expiryTimeLabel}
        </span>
      </div>

      <div className="trade-market-ladder" aria-label="Up Down strike ladder">
        <div className="trade-ladder-heading">
          <span>UP</span>
          <span>Strike</span>
          <span>DOWN</span>
        </div>
        {ladderRows.length ? (
          ladderRows.map(({ key, market, selection }, index) => {
            const isSelectedStrike = isSelectedMarket && key === selectedLadderKey;
            const isSelectedUp = isSelectedStrike && selectedSide === "UP";
            const isSelectedDown = isSelectedStrike && selectedSide === "DOWN";
            const upQuote =
              isSelectedUp && selectedQuoteStatus === "ready" && selectedQuote?.side === "UP"
                ? selectedQuote
                : null;
            const downQuote =
              isSelectedDown && selectedQuoteStatus === "ready" && selectedQuote?.side === "DOWN"
                ? selectedQuote
                : null;

            return (
              <div className="trade-ladder-row" key={key}>
                {index === normalizedSpotLineIndex ? (
                  <div className="trade-spot-line">Oracle price {marketPriceLabel}</div>
                ) : null}
                <button
                  type="button"
                  className={`trade-ladder-side trade-ladder-side-up ${
                    isSelectedUp ? "selected" : ""
                  }`}
                  aria-label={`Trade UP ${selection.strikeLabel}`}
                  aria-pressed={isSelectedUp}
                  onClick={() => {
                    onMarketChange(selection);
                    onSideChange("UP");
                  }}
                >
                  <strong>
                    {upQuote ? formatTradeQuotePrice(upQuote) : formatTradeSidePrice(market.up)}
                  </strong>
                </button>
                <span className="trade-ladder-strike">
                  <strong>{selection.strikeLabel}</strong>
                  <small>
                    {market.timeRemainingLabel} · {market.moneynessLabel}
                  </small>
                </span>
                <button
                  type="button"
                  className={`trade-ladder-side trade-ladder-side-down ${
                    isSelectedDown ? "selected" : ""
                  }`}
                  aria-label={`Trade DOWN ${selection.strikeLabel}`}
                  aria-pressed={isSelectedDown}
                  onClick={() => {
                    onMarketChange(selection);
                    onSideChange("DOWN");
                  }}
                >
                  <strong>
                    {downQuote
                      ? formatTradeQuotePrice(downQuote)
                      : formatTradeSidePrice(market.down)}
                  </strong>
                </button>
              </div>
            );
          })
        ) : (
          <div className="trade-ladder-empty">No active markets</div>
        )}
        {normalizedSpotLineIndex === ladderRows.length ? (
          <div className="trade-spot-line trade-spot-line-standalone">
            Oracle price {marketPriceLabel}
          </div>
        ) : null}
      </div>

      {isSelectedMarket ? (
        <section className="trade-order-panel" aria-label="Selected position">
          <div className="trade-row-ticket-heading">
            <div>
              <span>Selected</span>
              <strong>
                {selectedSide} {cardMarket.strikeLabel}
              </strong>
              <small>{formatTradeOutcome(selectedSide, cardMarket.strikeLabel)}</small>
            </div>
            <small>{cardMarket.expiryTimeLabel}</small>
          </div>
          <CopyAmountControls
            ariaLabel="Trade spend amounts"
            copyAmount={copyAmount}
            onAmountSet={onAmountSet}
          />
          <div className="trade-ticket-metrics" aria-label="Trade ticket summary">
            <span>
              <small>Spend</small>
              {formatCopyAmount(copyAmount)}
            </span>
            {selectedQuoteStatus === "loading" ? (
              <>
                <span className="metric-muted">
                  <small>Est. payout</small>
                  Quoting...
                </span>
                <span className="metric-muted">
                  <small>Max profit</small>
                  Quoting...
                </span>
              </>
            ) : selectedQuoteStatus === "error" ? (
              <>
                <span className="metric-muted">
                  <small>Est. payout</small>
                  Quote unavailable
                </span>
                <span className="metric-muted">
                  <small>Max profit</small>
                  Quote unavailable
                </span>
              </>
            ) : returnPreview ? (
              <>
                <span>
                  <small>Est. payout</small>
                  {returnPreview.payoutLabel}
                </span>
                <span>
                  <small>Max profit</small>
                  {returnPreview.profitLabel}
                </span>
              </>
            ) : (
              <>
                <span className="metric-muted">
                  <small>Est. payout</small>
                  Quote needed
                </span>
                <span className="metric-muted">
                  <small>Max profit</small>
                  Quote needed
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            className="trade-wallet-button"
            data-testid="trade-wallet-submit"
            disabled={!canSubmitTrade}
            onClick={onWalletSubmit}
          >
            {walletActionPending ? "Sending..." : tradeWalletButtonLabel}
          </button>
        </section>
      ) : null}
    </div>
  );
}

export function TradeTicket({
  customStrike = null,
  copyAmount,
  expiryOptions = [],
  marketPriceLabel = null,
  marketRows,
  selectedExpiryDate = null,
  selectedMarketId,
  selectedSide,
  quote = null,
  quoteStatus = "idle",
  predictManagerObjectId = "",
  testId = "trade-view",
  walletActionPending = false,
  walletConnected = false,
  onAmountSet,
  onExpiryChange = () => undefined,
  onMarketChange,
  onSideChange,
  onWalletSubmit,
}: {
  customStrike?: TradeMarketSelection | null;
  copyAmount: number;
  expiryOptions?: TradeExpiryOption[];
  marketPriceLabel?: string | null;
  marketRows: TradeMarketLadderRow[];
  selectedExpiryDate?: string | null;
  selectedMarketId: string;
  selectedSide: TradeSide;
  quote?: TradeQuote | null;
  quoteStatus?: TradeQuoteStatus;
  predictManagerObjectId?: string;
  testId?: string;
  walletActionPending?: boolean;
  walletConnected?: boolean;
  onAmountSet: (amount: number) => void;
  onExpiryChange?: (expiryDate: string) => void;
  onMarketChange: (selection: TradeMarketSelection) => void;
  onSideChange: (side: TradeSide) => void;
  onWalletSubmit: () => void;
}) {
  const {
    selectedMarket,
  } = buildTradeLadderDisplayRows({
    customStrike,
    marketPriceLabel,
    marketRows,
    selectedMarketId,
  });
  const selectedSideSummary = selectedMarket
    ? selectedSide === "UP"
      ? selectedMarket.up
      : selectedMarket.down
    : null;
  const returnPreview = quote
    ? buildReturnPreviewFromQuote(quote)
    : buildReturnPreview(copyAmount, selectedSideSummary?.estimatedPrice);
  const displayedMarketRows = [...marketRows].sort(sortTradeMarketCards);
  const hasPredictManagerObjectId = predictManagerObjectId.trim().length > 0;
  const canSubmitTrade =
    walletConnected &&
    hasPredictManagerObjectId &&
    quoteStatus === "ready" &&
    Boolean(quote) &&
    !walletActionPending;
  const tradeWalletButtonLabel = !selectedMarket
    ? "No active market"
    : !walletConnected
      ? "Connect wallet first"
      : !hasPredictManagerObjectId
        ? "Create Predict account first"
        : quoteStatus === "loading"
          ? "Wait for quote"
          : quoteStatus === "error"
            ? "Quote unavailable"
            : quoteStatus !== "ready"
              ? "Select a price"
              : walletActionPending
                ? "Sending..."
                : "Confirm transaction";

  return (
    <section className="trade-ticket" aria-label="Trade" data-testid={testId}>
      <div className="section-heading">
        <p>Trade</p>
        <span>{selectedMarket?.pairLabel ?? "BTC/USD"}</span>
      </div>
      <TradeExpiryRail
        options={expiryOptions}
        selectedExpiryDate={selectedExpiryDate}
        onExpiryChange={onExpiryChange}
      />
      {displayedMarketRows.length ? (
        displayedMarketRows.map((marketRow) => {
          const isSelectedMarket = selectedMarket?.id === marketRow.id;

          return (
            <TradeMarketCard
              canSubmitTrade={isSelectedMarket && canSubmitTrade}
              copyAmount={copyAmount}
              customStrike={isSelectedMarket ? customStrike : null}
              isSelectedMarket={isSelectedMarket}
              key={marketRow.id}
              marketPriceLabel={marketPriceLabel}
              marketRow={marketRow}
              quote={isSelectedMarket ? quote : null}
              quoteStatus={isSelectedMarket ? quoteStatus : "idle"}
              returnPreview={isSelectedMarket ? returnPreview : null}
              selectedSide={selectedSide}
              tradeWalletButtonLabel={tradeWalletButtonLabel}
              walletActionPending={walletActionPending}
              onAmountSet={onAmountSet}
              onMarketChange={onMarketChange}
              onSideChange={onSideChange}
              onWalletSubmit={onWalletSubmit}
            />
          );
        })
      ) : (
        <div className="trade-ticket-panel" data-testid="trade-market-card">
          <div className="trade-ticket-title-row">
            <div className="trade-ticket-title">
              <p>Up/Down</p>
              <strong>BTC strike ladder</strong>
            </div>
            <span className="trade-duration-pill">No markets</span>
          </div>
          <div className="trade-ladder-empty">No active markets</div>
          <button
            type="button"
            className="trade-wallet-button"
            data-testid="trade-wallet-submit"
            disabled
          >
            {tradeWalletButtonLabel}
          </button>
        </div>
        )}
    </section>
  );
}

function traderCopyStatus(
  isSelected: boolean,
  isExpanded: boolean,
  receiptState: string,
): string {
  if (!isSelected) {
    return "Live";
  }

  if (receiptState === "Disarmed") {
    return isExpanded ? "Selected" : "Live";
  }

  if (receiptState === "Waiting") {
    return "Armed";
  }

  if (receiptState === "Signal landed") {
    return "Confirm";
  }

  if (receiptState === "Copied once") {
    return "Copied";
  }

  return receiptState;
}

function TraderRow({
  trader,
  isSelected,
  isExpanded,
  isHotTrader,
  receiptState,
  copyAmount,
  onCopy,
  onAmountStep,
  onAmountSet,
  onArmToggle,
  onConfirmCopy,
  onClose,
}: {
  trader: Trader;
  isSelected: boolean;
  isExpanded: boolean;
  isHotTrader: boolean;
  receiptState: string;
  copyAmount: number;
  onCopy: (traderId: string) => void;
  onAmountStep: (direction: -1 | 1) => void;
  onAmountSet: (amount: number) => void;
  onArmToggle: () => void;
  onConfirmCopy: () => void;
  onClose: () => void;
}) {
  const status = traderCopyStatus(isSelected, isExpanded, receiptState);
  const copyCta =
    receiptState === "Signal landed"
      ? "Confirm"
      : receiptState === "Copied once"
        ? "Re-arm"
        : receiptState === "Waiting"
          ? "Cancel arm"
          : "Arm copy";
  const copyStatus =
    receiptState === "Signal landed"
      ? "Confirm signal"
      : receiptState === "Copied once"
        ? "Copied once"
        : receiptState === "Waiting"
          ? "No trade yet"
          : "Set amount";

  return (
    <article
      className={`trader-row trader-row-${trader.tone} ${
        isSelected ? "trader-row-selected" : ""
      } ${isHotTrader ? "trader-row-hot" : ""}`}
      data-testid="hot-trader-row"
    >
      <div className="trader-row-main">
        <div className="trader-identity">
          <div className="trader-title-row">
            <h2>{trader.name}</h2>
            <span>{status}</span>
          </div>
          <p>{trader.signal}</p>
        </div>
        <div className="trader-row-score">
          <strong>{trader.hotScore}</strong>
          <span>Hot</span>
        </div>
        <button
          type="button"
          data-testid="copy-trigger"
          aria-expanded={isExpanded}
          onClick={() => onCopy(trader.id)}
        >
          Copy
        </button>
      </div>

      <div className="trader-row-metrics" aria-label={`${trader.name} trading stats`}>
        <span>{trader.roi} ROI</span>
        <span>{trader.streak} streak</span>
        <span>{trader.copied.toLocaleString()} copied</span>
      </div>

      {isExpanded ? (
        <div className="inline-copy-panel" data-testid="inline-copy-panel">
          <div className="inline-copy-header">
            <div className="inline-copy-summary">
              <p>Copy {trader.name}</p>
              <strong>{formatCopyAmount(copyAmount)} / BTC-USD</strong>
              <span>{copyStatus}</span>
            </div>
            <button
              type="button"
              aria-label="Close copy panel"
              className="close-copy-button"
              data-testid="close-copy-panel"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <CopyAmountControls
            ariaLabel="Quick copy amounts"
            copyAmount={copyAmount}
            onAmountSet={onAmountSet}
          />
          <button
            type="button"
            className={`arm-button ${receiptState !== "Disarmed" ? "armed" : ""}`}
            data-testid="arm-copy-button"
            onClick={receiptState === "Signal landed" ? onConfirmCopy : onArmToggle}
          >
            {copyCta}
          </button>
          <details className="custom-copy-adjust">
            <summary>Adjust amount</summary>
            <div className="amount-stepper">
              <button
                type="button"
                aria-label="Decrease copy amount"
                onClick={() => onAmountStep(-1)}
              >
                -
              </button>
              <strong>{formatCopyAmount(copyAmount)}</strong>
              <button
                type="button"
                aria-label="Increase copy amount"
                onClick={() => onAmountStep(1)}
              >
                +
              </button>
            </div>
            <input
              aria-label="Copy amount"
              min={COPY_AMOUNT_MIN}
              max={COPY_AMOUNT_MAX}
              step="25"
              type="range"
              value={copyAmount}
              onChange={(event) => onAmountSet(Number(event.currentTarget.value))}
            />
          </details>
        </div>
      ) : null}
    </article>
  );
}

function PortfolioHistoryList({
  emptyLabel,
  items,
  testId = "portfolio-history",
  title = "Trade history",
}: {
  emptyLabel: string;
  items: PredictPortfolioHistoryItem[];
  testId?: string;
  title?: string;
}) {
  if (!items.length) {
    return <div className="portfolio-empty">{emptyLabel}</div>;
  }

  return (
    <div className="portfolio-history" data-testid={testId}>
      <p className="portfolio-history-title">{title}</p>
      <div className="portfolio-table-head portfolio-history-table-head" aria-hidden="true">
        <span>Market / side</span>
        <span>Closed</span>
        <span>Cost</span>
        <span>Payout</span>
        <span>PNL</span>
      </div>
      {items.map((item) => {
        const isOpen = item.statusLabel === "Open";
        const timeLabel = isOpen && item.timeLabel ? item.timeLabel : item.expiryTimeLabel;
        const isLiveCountdown = isOpen && isLiveCountdownLabel(timeLabel);

        return (
          <article
            className={`portfolio-history-row portfolio-history-row-${item.pnlTone}`}
            key={item.id}
          >
            <div className="portfolio-market-cell">
              <span className={item.direction === "UP" ? "portfolio-side-up" : "portfolio-side-down"}>
                {item.direction}
              </span>
              <div>
                <strong>BTC/USD</strong>
                <small>{item.strikeLabel}</small>
              </div>
            </div>
            <div
              className={`portfolio-expiry-cell${
                isLiveCountdown ? " portfolio-countdown-live" : ""
              }`}
            >
              <strong>{timeLabel}</strong>
              <small>{item.statusLabel}</small>
            </div>
            <span className="portfolio-table-cell">{item.costLabel}</span>
            <span className="portfolio-table-cell">{item.payoutLabel}</span>
            <div className={`portfolio-history-pnl portfolio-history-pnl-${item.pnlTone}`}>
              <small>PNL</small>
              <strong>{item.pnlLabel}</strong>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function PortfolioPanel({
  emptyLabel: emptyLabelOverride,
  historyItems = [],
  initialTab = "positions",
  nowMs,
  positions,
  status = "ready",
  walletActionPending = false,
  walletSubmittedPositionId = null,
  onDismissPosition,
  onPositionAction,
}: {
  emptyLabel?: string;
  historyItems?: PredictPortfolioHistoryItem[];
  initialTab?: PortfolioTab;
  nowMs?: number;
  positions: AttributedPortfolioPosition[];
  status?: PredictPortfolioState["status"];
  walletActionPending?: boolean;
  walletSubmittedPositionId?: string | null;
  onDismissPosition?: (positionId: string) => void;
  onPositionAction: (position: PredictPortfolioPosition) => void;
}) {
  const [activeTab, setActiveTab] = useState<PortfolioTab>(initialTab);
  const emptyLabel =
    emptyLabelOverride ??
    (status === "loading"
      ? "Loading positions..."
      : status === "error"
        ? "Could not load positions"
        : "No open positions");
  const historyEmptyLabel =
    status === "loading"
      ? "Loading history..."
      : status === "error"
        ? "Could not load history"
        : "No trade history yet";

  return (
    <section className="portfolio-panel" aria-label="Portfolio" data-testid="portfolio-view">
      <div className="section-heading">
        <p>Portfolio</p>
        <span>
          {activeTab === "positions"
            ? positions.length
              ? `${positions.length} positions`
              : "Positions"
            : historyItems.length
              ? `${historyItems.length} trades`
              : "History"}
        </span>
      </div>
      <div className="portfolio-tabs" aria-label="Portfolio tabs">
        <button
          type="button"
          aria-pressed={activeTab === "positions"}
          data-testid="portfolio-positions-tab"
          onClick={() => setActiveTab("positions")}
        >
          Positions
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "history"}
          data-testid="portfolio-history-tab"
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>
      {activeTab === "positions" && positions.length ? (
        <div className="portfolio-list">
          <div className="portfolio-table-head" aria-hidden="true">
            <span>Market / side</span>
            <span>Exp</span>
            <span>Cost</span>
            <span>Est. close</span>
            <span>Max payout</span>
            <span />
          </div>
          {positions.map((position) => {
            const isExpired =
              typeof nowMs === "number" ? position.expiryMs <= nowMs : position.isExpired;
            const statusLabel = isExpired ? "Expired" : position.statusLabel;
            const timeLabel =
              typeof nowMs === "number"
                ? formatPortfolioTimeRemaining(position.expiryMs, nowMs)
                : position.timeLabel;
            const isLiveCountdown = !isExpired && isLiveCountdownLabel(timeLabel);
            const primaryTimeLabel = isExpired ? position.expiryTimeLabel : timeLabel;
            const statusSummary = [
              statusLabel,
              !isExpired && position.closeValueStatusLabel ? position.closeValueStatusLabel : null,
              isExpired && position.outcomeLabel ? position.outcomeLabel : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const isDismissible = isExpired && position.dismissible;
            const actionLabel = isExpired
              ? isDismissible
                ? "Dismiss"
                : "Claim"
              : position.actionLabel;
            const actionPosition = isExpired
              ? {
                  ...position,
                  actionLabel,
                  isExpired,
                  statusLabel,
                  timeLabel,
                }
              : position;

            return (
              <article className="portfolio-row" key={position.id}>
                <div className="portfolio-market-cell">
                  <span className={position.direction === "UP" ? "portfolio-side-up" : "portfolio-side-down"}>
                    {position.direction}
                  </span>
                  <div>
                    <strong>BTC/USD</strong>
                    <small>Strike {position.strikeLabel}</small>
                    {position.copiedFromLabel ? (
                      <small className="portfolio-copy-source-badge">
                        {position.copiedFromLabel}
                      </small>
                    ) : null}
                  </div>
                </div>
                <div
                  className={`portfolio-expiry-cell${
                    isLiveCountdown ? " portfolio-countdown-live" : ""
                  }`}
                >
                  <strong>{primaryTimeLabel}</strong>
                  <small>{statusSummary}</small>
                </div>
                <span className="portfolio-table-cell">{position.costBasisLabel}</span>
                <span className="portfolio-table-cell">
                  {isExpired
                    ? position.claimValueLabel ?? (status === "loading" ? "Checking" : "Pending")
                    : position.closeValueLabel ?? (status === "loading" ? "Checking" : "Unavailable")}
                </span>
                <span className="portfolio-table-cell">
                  {isExpired ? position.settlementPriceLabel ?? "Pending" : position.maxPayoutLabel}
                </span>
                <div className="portfolio-action-cell">
                  <button
                    type="button"
                    className="portfolio-action-button portfolio-row-action"
                    disabled={!isDismissible && walletActionPending}
                    onClick={() => {
                      if (isDismissible) {
                        onDismissPosition?.(position.id);
                        return;
                      }

                      onPositionAction(actionPosition);
                    }}
                  >
                    {!isDismissible && walletActionPending && walletSubmittedPositionId === position.id
                      ? "Sending..."
                      : actionLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : activeTab === "positions" ? (
        <div className="portfolio-empty">
          <strong>{emptyLabel}</strong>
        </div>
      ) : (
        <PortfolioHistoryList emptyLabel={historyEmptyLabel} items={historyItems} />
      )}
    </section>
  );
}

export function ProfilePanel({
  currentWalletAddress = null,
  copyAmount = COPY_AMOUNT_DEFAULT,
  copyAttributionLabels = {},
  followedWallets,
  profileCopyAttributionLabel = null,
  profileHistoryItems = [],
  profileHistoryStatus = "idle",
  profileStats = buildProfileStatSummary(null),
  profileWallet,
  profilePositionRows = [],
  profilePositionsCanShowMore = false,
  profilePositionsShowMoreLabel = "Show more",
  quote = null,
  quoteStatus = "idle",
  selectedProfilePositionMode = "copy",
  selectedProfilePositionRowId = null,
  walletConnected = false,
  onAmountSet = () => undefined,
  onFollowWallet,
  onProfilePositionSelect = () => undefined,
  onProfilePositionsShowMore = () => undefined,
  onProfilePositionWalletSubmit = () => undefined,
  onProfileQuoteRetry,
  onShareProfile,
  onShareRow,
  onSelectWallet,
  onUnfollowWallet,
}: {
  currentWalletAddress?: string | null;
  copyAmount?: number;
  copyAttributionLabels?: Record<string, string>;
  followedWallets: FollowedWallet[];
  profileCopyAttributionLabel?: string | null;
  profileHistoryItems?: PredictPortfolioHistoryItem[];
  profileHistoryStatus?: ProfileHistoryStatus;
  profileStats?: ProfileStatSummary;
  profileWallet: FollowedWallet | null;
  profilePositionRows?: MarketHeatPreviewRow[];
  profilePositionsCanShowMore?: boolean;
  profilePositionsShowMoreLabel?: string;
  quote?: TradeQuote | null;
  quoteStatus?: TradeQuoteStatus;
  selectedProfilePositionMode?: MarketHeatIntentMode;
  selectedProfilePositionRowId?: string | null;
  walletConnected?: boolean;
  onAmountSet?: (amount: number) => void;
  onFollowWallet: (wallet: FollowedWallet) => void;
  onProfilePositionSelect?: (rowId: string, mode?: MarketHeatIntentMode) => void;
  onProfilePositionsShowMore?: () => void;
  onProfilePositionWalletSubmit?: (rowId: string, mode?: MarketHeatIntentMode) => void;
  onProfileQuoteRetry?: () => void;
  onShareProfile?: () => void;
  onShareRow?: (rowId: string) => void;
  onSelectWallet: (wallet: FollowedWallet) => void;
  onUnfollowWallet: (wallet: string) => void;
}) {
  const [walletInput, setWalletInput] = useState("");
  const activeWallet =
    profileWallet ??
    (currentWalletAddress
      ? { displayName: "Your wallet", wallet: currentWalletAddress }
      : null);
  const isOwnActiveWallet =
    Boolean(activeWallet && currentWalletAddress) &&
    activeWallet?.wallet.toLowerCase() === currentWalletAddress?.toLowerCase();
  const isFollowingActiveWallet = activeWallet
    ? followedWallets.some(
        (followedWallet) =>
          followedWallet.wallet.toLowerCase() === activeWallet.wallet.toLowerCase(),
      )
    : false;
  const normalizedInputWallet = normalizeProfileWalletAddress(walletInput);
  const profileHistoryEmptyLabel =
    profileHistoryStatus === "loading"
      ? "Loading trade history..."
      : profileHistoryStatus === "error"
        ? "Could not load trade history"
        : "No trade history yet";

  return (
    <section className="profile-panel" aria-label="Profile" data-testid="profile-view">
      <div className="section-heading">
        <p>Profile</p>
        <span>{followedWallets.length} following</span>
      </div>
      <div className="profile-card">
        <span className="profile-card-label">Wallet</span>
        {activeWallet ? (
          <>
            <div className="profile-wallet-identity">
              <WalletIdenticon
                displayName={activeWallet.displayName}
                wallet={activeWallet.wallet}
              />
              <div>
                <strong>{activeWallet.displayName}</strong>
                <small>{activeWallet.wallet}</small>
              </div>
            </div>
            {profileCopyAttributionLabel ? (
              <small className="profile-copy-summary">{profileCopyAttributionLabel}</small>
            ) : null}
            <div className="profile-card-actions">
              {onShareProfile ? (
                <button
                  type="button"
                  className="profile-share-button"
                  data-testid="profile-share"
                  onClick={onShareProfile}
                >
                  <ShareIcon />
                  <span>Share</span>
                </button>
              ) : null}
              {!isOwnActiveWallet ? (
                <button
                  type="button"
                  className="profile-follow-button"
                  data-testid="profile-follow-toggle"
                  onClick={() =>
                    isFollowingActiveWallet
                      ? onUnfollowWallet(activeWallet.wallet)
                      : onFollowWallet(activeWallet)
                  }
                >
                  {isFollowingActiveWallet ? "Following" : "Follow wallet"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <strong>No wallet selected</strong>
            <small>Open a wallet from Leaders or paste one below.</small>
          </>
        )}
      </div>
      <div className="profile-stat-header" data-testid="profile-stat-header">
        <div className="profile-stat-header-top">
          <span className="profile-card-label">Track record</span>
        </div>
        <div className="profile-stat-grid">
          {profileStats.items.map((item) => (
            <span
              className={`profile-stat-item${
                item.tone ? ` profile-stat-item-${item.tone}` : ""
              }`}
              key={item.label}
            >
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          ))}
        </div>
        <ProfilePnlSparkline historyItems={profileHistoryItems} />
      </div>
      {activeWallet ? (
        <MarketHeatPreview
          ariaLabel={`${activeWallet.displayName} positions`}
          canShowMore={profilePositionsCanShowMore}
          copyAmount={copyAmount}
          emptyDetail="This wallet has no active positions to copy right now."
          emptyTitle="No open positions"
          rows={profilePositionRows}
          selectedMode={selectedProfilePositionMode}
          selectedRowId={selectedProfilePositionRowId}
          showControls={false}
          showEmptyAction={false}
          showExpired={false}
          showMoreLabel={profilePositionsShowMoreLabel}
          sortMode="latest"
          sourceLabel=""
          testId="profile-positions"
          title="Positions"
          identityMode="market"
          walletConnected={walletConnected}
          copyAttributionLabels={copyAttributionLabels}
          quote={quote}
          quoteStatus={quoteStatus}
          onAmountSet={onAmountSet}
          onSelectRow={onProfilePositionSelect}
          onShowExpiredChange={() => undefined}
          onShowMore={onProfilePositionsShowMore}
          onSortModeChange={() => undefined}
          onWalletSubmit={onProfilePositionWalletSubmit}
          onRetryQuote={onProfileQuoteRetry}
          onShareRow={onShareRow}
        />
      ) : null}
      {activeWallet ? (
        <PortfolioHistoryList
          emptyLabel={profileHistoryEmptyLabel}
          items={profileHistoryItems}
          testId="profile-trade-history"
          title="Trade history"
        />
      ) : null}
      <form
        className="profile-follow-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!normalizedInputWallet) {
            return;
          }

          const wallet = {
            displayName: formatWalletAddress(normalizedInputWallet),
            wallet: normalizedInputWallet,
          };
          onFollowWallet(wallet);
          onSelectWallet(wallet);
          setWalletInput("");
        }}
      >
        <label>
          <span>Add wallet</span>
          <input
            aria-label="Wallet address to follow"
            data-testid="profile-follow-wallet-input"
            placeholder="0x..."
            value={walletInput}
            onChange={(event) => setWalletInput(event.currentTarget.value)}
          />
        </label>
        <button
          type="submit"
          disabled={!normalizedInputWallet}
          data-testid="profile-follow-wallet-submit"
        >
          Add
        </button>
      </form>
      <div className="profile-following-list">
        <span className="profile-card-label">Following</span>
        {followedWallets.length ? (
          followedWallets.map((wallet) => (
            <article className="profile-following-row" key={wallet.wallet}>
              <button type="button" onClick={() => onSelectWallet(wallet)}>
                <strong>{wallet.displayName}</strong>
                <small>{wallet.wallet}</small>
              </button>
              <button type="button" onClick={() => onUnfollowWallet(wallet.wallet)}>
                Unfollow
              </button>
            </article>
          ))
        ) : (
          <div className="profile-empty">No followed wallets yet</div>
        )}
      </div>
    </section>
  );
}

function walletLeaderboardMetricValue(
  entry: WalletLeaderboardEntry,
  board: WalletLeaderboardBoardKey,
): string {
  switch (board) {
    case "longestWinningStreak":
      return entry.longestWinningStreakLabel;
    case "longestLosingStreak":
      return entry.longestLosingStreakLabel;
    case "currentWinningStreak":
    case "currentLosingStreak":
      return entry.currentStreakLabel;
    case "highestPnl":
    case "worstPnl":
      return entry.totalPnlLabel;
  }
}

function walletLeaderboardEffectiveBoard(
  board: WalletLeaderboardPanelBoardKey,
  sortDirection: WalletLeaderboardSortDirection,
  rangeMode: WalletLeaderboardRangeMode,
): WalletLeaderboardBoardKey {
  if (board === "pnl") {
    return sortDirection === "best" ? "highestPnl" : "worstPnl";
  }

  if (rangeMode === "current") {
    return sortDirection === "best"
      ? "currentWinningStreak"
      : "currentLosingStreak";
  }

  return sortDirection === "best"
    ? "longestWinningStreak"
    : "longestLosingStreak";
}

function walletLeaderboardMetricLabel(board: WalletLeaderboardBoardKey): string {
  switch (board) {
    case "longestWinningStreak":
      return "Win Streak";
    case "longestLosingStreak":
      return "Lose Streak";
    case "currentWinningStreak":
      return "Current Wins";
    case "currentLosingStreak":
      return "Current Losses";
    case "highestPnl":
    case "worstPnl":
      return "PNL";
  }
}

function walletLeaderboardMetricTone(
  entry: WalletLeaderboardEntry,
  board: WalletLeaderboardBoardKey,
): WalletLeaderboardTone {
  switch (board) {
    case "longestWinningStreak":
    case "currentWinningStreak":
      return "positive";
    case "longestLosingStreak":
    case "currentLosingStreak":
      return "negative";
    case "highestPnl":
    case "worstPnl":
      return entry.totalPnlTone;
  }
}

function compactWalletLeaderboardLastLabel(label: string): string {
  const withoutZone = label.replace(/\s(?:UTC|GMT|PDT|PST|EDT|EST|CDT|CST|MDT|MST).*/, "");
  const [datePart] = withoutZone.split(",");
  return datePart.trim() || label;
}

function formatWalletLeaderboardWinRate(entry: WalletLeaderboardEntry): string {
  const settledCount = entry.winCount + entry.lossCount;
  if (settledCount <= 0) {
    return "--";
  }

  return `${Math.round((entry.winCount / settledCount) * 100)}%`;
}

const PROFILE_LEADERBOARD_SEARCH_ORDER: WalletLeaderboardBoardKey[] = [
  "highestPnl",
  "currentWinningStreak",
  "longestWinningStreak",
  "worstPnl",
  "currentLosingStreak",
  "longestLosingStreak",
];

const profileLastActiveFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
});

function findWalletLeaderboardEntry(
  snapshot: WalletLeaderboardsSnapshot,
  wallet: string | null,
): WalletLeaderboardEntry | null {
  const normalizedWallet = wallet?.toLowerCase();
  if (!normalizedWallet) {
    return null;
  }

  for (const board of PROFILE_LEADERBOARD_SEARCH_ORDER) {
    const entry = selectWalletLeaderboardEntries(snapshot, board).find(
      (candidate) => candidate.wallet.toLowerCase() === normalizedWallet,
    );
    if (entry) {
      return entry;
    }
  }

  return null;
}

function formatProfileLastActive(entry: WalletLeaderboardEntry): string {
  const timestampMs = entry.lastSeenMs ?? entry.lastSettledAtMs;
  if (!timestampMs) {
    return "--";
  }

  return profileLastActiveFormatter.format(new Date(timestampMs));
}

function buildProfileStatSummary(entry: WalletLeaderboardEntry | null): ProfileStatSummary {
  if (!entry) {
    return {
      sourceLabel: "Waiting for settled leaderboard data",
      items: [
        { label: "Win rate", value: "--" },
        { label: "All-time PNL", value: "--" },
        { label: "Current streak", value: "--" },
        { label: "Best streak", value: "--" },
        { label: "Total calls", value: "--" },
        { label: "Last active", value: "--" },
      ],
    };
  }

  const totalCalls = entry.openCount + entry.closedCount;

  return {
    sourceLabel: "Indexed DeepBook Predict record",
    items: [
      { label: "Win rate", value: formatWalletLeaderboardWinRate(entry) },
      { label: "All-time PNL", value: entry.totalPnlLabel, tone: entry.totalPnlTone },
      {
        label: "Current streak",
        value: entry.currentStreakLabel,
        tone:
          entry.currentStreakType === "win"
            ? "positive"
            : entry.currentStreakType === "loss"
              ? "negative"
              : "flat",
      },
      {
        label: "Best streak",
        value: entry.longestWinningStreakLabel,
        tone: entry.longestWinningStreak > 0 ? "positive" : "flat",
      },
      { label: "Total calls", value: totalCalls.toLocaleString() },
      { label: "Last active", value: formatProfileLastActive(entry) },
    ],
  };
}

function parseProfilePnlAtomic(value: string | undefined): bigint | null {
  if (!value || !/^-?\d+$/.test(value)) {
    return null;
  }

  return BigInt(value);
}

function formatSignedProfileDusdc(value: bigint): string {
  if (value === 0n) {
    return "$0";
  }

  const prefix = value > 0n ? "+" : "-";
  return `${prefix}${formatDusdcBalance(value > 0n ? value : -value)}`;
}

function buildProfileStatSummaryFromHistory(
  historyItems: PredictPortfolioHistoryItem[],
  status: ProfileHistoryStatus,
): ProfileStatSummary {
  const settledResults = historyItems
    .map((item) => parseProfilePnlAtomic(item.pnlAtomic))
    .filter((value): value is bigint => value !== null && value !== 0n);

  if (!historyItems.length) {
    return {
      sourceLabel:
        status === "loading"
          ? "Loading indexed profile record"
          : status === "error"
            ? "Profile record unavailable"
            : "Waiting for settled leaderboard data",
      items: [
        { label: "Win rate", value: "--" },
        { label: "All-time PNL", value: "--" },
        { label: "Current streak", value: "--" },
        { label: "Best streak", value: "--" },
        { label: "Total calls", value: "--" },
        { label: "Last active", value: "--" },
      ],
    };
  }

  const wins = settledResults.filter((value) => value > 0n).length;
  const losses = settledResults.filter((value) => value < 0n).length;
  const settledCount = wins + losses;
  const totalPnl = settledResults.reduce((sum, value) => sum + value, 0n);
  let currentStreakType: "win" | "loss" | "none" = "none";
  let currentStreakLength = 0;
  let bestWinningStreak = 0;
  let runningWinningStreak = 0;

  for (const result of settledResults) {
    const resultType = result > 0n ? "win" : "loss";
    if (currentStreakType === "none" || currentStreakType === resultType) {
      currentStreakType = resultType;
      currentStreakLength += 1;
    } else if (currentStreakLength > 0) {
      break;
    }
  }

  for (const result of [...settledResults].reverse()) {
    if (result > 0n) {
      runningWinningStreak += 1;
      bestWinningStreak = Math.max(bestWinningStreak, runningWinningStreak);
    } else {
      runningWinningStreak = 0;
    }
  }

  return {
    sourceLabel: "",
    items: [
      {
        label: "Win rate",
        value: settledCount > 0 ? `${Math.round((wins / settledCount) * 100)}%` : "--",
      },
      {
        label: "All-time PNL",
        value: formatSignedProfileDusdc(totalPnl),
        tone: totalPnl > 0n ? "positive" : totalPnl < 0n ? "negative" : "flat",
      },
      {
        label: "Current streak",
        value:
          currentStreakType === "none"
            ? "No streak"
            : `${currentStreakLength} ${currentStreakType}`,
        tone:
          currentStreakType === "win"
            ? "positive"
            : currentStreakType === "loss"
              ? "negative"
              : "flat",
      },
      {
        label: "Best streak",
        value: bestWinningStreak > 0 ? `${bestWinningStreak} win` : "No wins",
        tone: bestWinningStreak > 0 ? "positive" : "flat",
      },
      { label: "Total calls", value: historyItems.length.toLocaleString() },
      { label: "Last active", value: historyItems[0]?.updatedAtLabel ?? "--" },
    ],
  };
}

function walletLeaderboardListLabel(
  board: WalletLeaderboardPanelBoardKey,
  sortDirection: WalletLeaderboardSortDirection,
  rangeMode: WalletLeaderboardRangeMode,
): string {
  if (board === "pnl") {
    return sortDirection === "best" ? "Top PnL" : "Worst PnL";
  }

  const streakType = sortDirection === "best" ? "Win" : "Lose";
  return rangeMode === "current"
    ? `Current ${streakType} Streaks`
    : `${streakType} Streaks`;
}

export function WalletLeaderboardsPanel({
  activeBoard,
  rangeMode = "allTime",
  sortDirection = "best",
  snapshot,
  status = "ready",
  onBoardChange,
  onWalletOpen,
  onRangeModeChange,
  onSortDirectionChange,
}: {
  activeBoard: WalletLeaderboardPanelBoardKey;
  rangeMode?: WalletLeaderboardRangeMode;
  sortDirection?: WalletLeaderboardSortDirection;
  snapshot: WalletLeaderboardsSnapshot;
  status?: WalletLeaderboardsStatus;
  onBoardChange: (board: WalletLeaderboardPanelBoardKey) => void;
  onWalletOpen?: (wallet: FollowedWallet) => void;
  onRangeModeChange?: (mode: WalletLeaderboardRangeMode) => void;
  onSortDirectionChange?: (direction: WalletLeaderboardSortDirection) => void;
}) {
  const activeBoardDefinition =
    WALLET_LEADERBOARD_BOARDS.find((board) => board.key === activeBoard) ??
    WALLET_LEADERBOARD_BOARDS[0];
  const hasCurrentRange = activeBoardDefinition.key === "streaks";
  const effectiveRangeMode = hasCurrentRange ? rangeMode : "allTime";
  const effectiveBoard = walletLeaderboardEffectiveBoard(
    activeBoardDefinition.key,
    sortDirection,
    effectiveRangeMode,
  );
  const coreMetricLabel = walletLeaderboardMetricLabel(effectiveBoard);
  const entries = selectWalletLeaderboardEntries(snapshot, effectiveBoard);
  const listLabel = walletLeaderboardListLabel(
    activeBoardDefinition.key,
    sortDirection,
    effectiveRangeMode,
  );
  const emptyLabel =
    status === "loading"
      ? "Loading wallet leaderboards..."
      : status === "error"
        ? "Could not load wallet leaderboards"
        : "No settled wallet results yet";
  return (
    <section
      className="wallet-leaderboards-panel"
      aria-label="Wallet Leaderboards"
      data-testid="wallet-leaderboards-view"
    >
      <div className="section-heading">
        <p>Wallet Leaders</p>
      </div>
      <div className="wallet-leaderboard-toolbar">
        <div className="wallet-leaderboard-tabs" aria-label="Wallet leaderboard boards">
          {WALLET_LEADERBOARD_BOARDS.map((board) => (
            <button
              type="button"
              aria-pressed={activeBoardDefinition.key === board.key}
              data-testid={`wallet-leaderboard-tab-${board.key}`}
              key={board.key}
              onClick={() => onBoardChange(board.key)}
            >
              {board.label}
            </button>
          ))}
        </div>
        <button
          className={`wallet-leaderboard-sort-toggle wallet-leaderboard-sort-toggle-${sortDirection}`}
          type="button"
          aria-label={
            sortDirection === "best"
              ? "Sort worst first"
              : "Sort best first"
          }
          data-testid="wallet-leaderboard-sort-toggle"
          onClick={() =>
            onSortDirectionChange?.(sortDirection === "best" ? "worst" : "best")
          }
        >
          <span aria-hidden="true">{sortDirection === "best" ? "↑" : "↓"}</span>
        </button>
      </div>
      <div className="wallet-leaderboard-range-modes" aria-label="Leaderboard range">
        <button
          type="button"
          aria-pressed={effectiveRangeMode === "allTime"}
          data-testid="wallet-leaderboard-range-mode-allTime"
          onClick={() => onRangeModeChange?.("allTime")}
        >
          All Time
        </button>
        <button
          type="button"
          aria-pressed={effectiveRangeMode === "current"}
          data-testid="wallet-leaderboard-range-mode-current"
          disabled={!hasCurrentRange}
          title={
            hasCurrentRange
              ? undefined
              : "Current PnL needs open-position PnL from the indexer"
          }
          onClick={() => onRangeModeChange?.("current")}
        >
          Current
        </button>
      </div>
      {entries.length ? (
        <div className="wallet-leaderboard-list">
          <div
            className={`wallet-leaderboard-table-head wallet-leaderboard-table-head-${activeBoardDefinition.key}`}
            aria-hidden="true"
          >
            <span>Rank</span>
            <span>Wallet</span>
            <span>{coreMetricLabel}</span>
            {activeBoardDefinition.key === "streaks" ? <span>PNL</span> : null}
            <span>Win Rate</span>
            <span>Open</span>
            <span>{activeBoardDefinition.key === "streaks" ? "Current" : "Streak"}</span>
            <span>Last</span>
          </div>
          {entries.map((entry) => {
            const coreMetricValue = walletLeaderboardMetricValue(entry, effectiveBoard);
            const coreMetricTone = walletLeaderboardMetricTone(entry, effectiveBoard);

            return (
              <article
                className={`wallet-leaderboard-row wallet-leaderboard-row-${activeBoardDefinition.key} wallet-leaderboard-row-${entry.totalPnlTone}`}
                data-testid="wallet-leaderboard-row"
                key={`${effectiveBoard}-${entry.wallet}-${entry.rank}`}
              >
                <div className="wallet-leaderboard-main">
                  <span className="wallet-leaderboard-rank">#{entry.rank}</span>
                  <button
                    type="button"
                    className="wallet-leaderboard-profile-button"
                    data-testid="wallet-leaderboard-profile"
                    onClick={() =>
                      onWalletOpen?.({
                        displayName: entry.displayName,
                        wallet: entry.wallet,
                      })
                    }
                  >
                    <strong>{entry.displayName}</strong>
                    <small>{listLabel}</small>
                  </button>
                  <div
                    className={`wallet-leaderboard-core wallet-leaderboard-core-${coreMetricTone}`}
                    data-testid="wallet-leaderboard-core-metric"
                  >
                    <small>{coreMetricLabel}</small>
                    <strong>{coreMetricValue}</strong>
                  </div>
                </div>
                <div className="wallet-leaderboard-metrics">
                  {activeBoardDefinition.key === "pnl" ? null : (
                    <span>
                      <small>PNL</small>
                      {entry.totalPnlLabel}
                    </span>
                  )}
                  <span>
                    <small>Win Rate</small>
                    {formatWalletLeaderboardWinRate(entry)}
                  </span>
                  <span>
                    <small>Open</small>
                    {entry.openCount}
                  </span>
                  <span>
                    <small>Current</small>
                    {entry.currentStreakLabel}
                  </span>
                  <span>
                    <small>Last</small>
                    <span title={entry.lastSettledLabel}>
                      {compactWalletLeaderboardLastLabel(entry.lastSettledLabel)}
                    </span>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="wallet-leaderboard-empty" data-testid="wallet-leaderboard-empty">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

export function MarketHeatPreview({
  rows,
  sourceLabel,
  sortMode,
  title = "Alpha Feed",
  subtitle = null,
  ariaLabel = title,
  identityMode = "wallet",
  selectedExpiryDate = null,
  showControls = true,
  showExpired,
  showEmptyAction = true,
  emptyTitle,
  emptyDetail,
  emptyActionLabel,
  canShowMore,
  selectedRowId,
  selectedMode = "copy",
  copyAmount,
  copyAttributionLabels = {},
  expiryOptions = [],
  quote = null,
  quoteStatus = "idle",
  showMoreLabel,
  testId = "market-heat-preview",
  walletConnected = false,
  onAmountSet,
  onAllExpiriesSelect = () => undefined,
  onEmptyAction,
  onExpiryChange = () => undefined,
  onShowExpiredChange,
  onShowMore,
  onSortModeChange,
  onWalletSubmit,
  onRetryQuote,
  onShareRow,
  onSelectRow,
  onWalletOpen,
}: {
  rows: MarketHeatPreviewRow[];
  sourceLabel: string;
  sortMode: MarketHeatFeedMode;
  title?: string;
  subtitle?: string | null;
  ariaLabel?: string;
  identityMode?: MarketHeatIdentityMode;
  selectedExpiryDate?: string | null;
  showControls?: boolean;
  showExpired: boolean;
  showEmptyAction?: boolean;
  emptyTitle?: string;
  emptyDetail?: string;
  emptyActionLabel?: string;
  canShowMore: boolean;
  selectedRowId: string | null;
  selectedMode?: MarketHeatIntentMode;
  copyAmount: number;
  copyAttributionLabels?: Record<string, string>;
  expiryOptions?: TradeExpiryOption[];
  quote?: TradeQuote | null;
  quoteStatus?: TradeQuoteStatus;
  showMoreLabel: string;
  testId?: string;
  walletConnected?: boolean;
  onAmountSet: (amount: number) => void;
  onAllExpiriesSelect?: () => void;
  onEmptyAction?: () => void;
  onExpiryChange?: (expiryDate: string) => void;
  onShowExpiredChange: (showExpired: boolean) => void;
  onShowMore: () => void;
  onSortModeChange: (sortMode: MarketHeatFeedMode) => void;
  onWalletSubmit: (rowId: string, mode?: MarketHeatIntentMode) => void;
  onRetryQuote?: () => void;
  onShareRow?: (rowId: string) => void;
  onSelectRow: (rowId: string, mode?: MarketHeatIntentMode) => void;
  onWalletOpen?: (wallet: FollowedWallet) => void;
}) {
  const swipeStartRef = useRef<{ rowId: string; x: number; y: number } | null>(null);
  const swipedRowRef = useRef<string | null>(null);
  const heatDescriptionId = `${testId}-heat-description`;
  const [isHeatDescriptionOpen, setIsHeatDescriptionOpen] = useState(false);
  const [swipePreview, setSwipePreview] = useState<MarketHeatSwipePreview | null>(null);
  const startMarketHeatSwipe = (
    rowId: string,
    event: PointerEvent<HTMLElement>,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    swipeStartRef.current = {
      rowId,
      x: event.clientX,
      y: event.clientY,
    };
    setSwipePreview(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const updateMarketHeatSwipe = (
    row: MarketHeatPreviewRow,
    event: PointerEvent<HTMLElement>,
  ) => {
    const swipeStart = swipeStartRef.current;

    if (!swipeStart || swipeStart.rowId !== row.id) {
      return;
    }

    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;

    if (Math.abs(deltaX) <= 8 || Math.abs(deltaY) > MARKET_HEAT_SWIPE_VERTICAL_TOLERANCE) {
      setSwipePreview((current) => (current?.rowId === row.id ? null : current));
      return;
    }

    setSwipePreview({
      action: resolveMarketHeatSwipeAction(deltaX, deltaY, row.status),
      deltaX: Math.max(
        -MARKET_HEAT_SWIPE_MAX_OFFSET,
        Math.min(deltaX, MARKET_HEAT_SWIPE_MAX_OFFSET),
      ),
      rowId: row.id,
    });
  };
  const finishMarketHeatSwipe = (
    row: MarketHeatPreviewRow,
    event: PointerEvent<HTMLElement>,
  ) => {
    const swipeStart = swipeStartRef.current;
    swipeStartRef.current = null;
    setSwipePreview(null);

    if (!swipeStart || swipeStart.rowId !== row.id) {
      return;
    }

    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    const action = resolveMarketHeatSwipeAction(deltaX, deltaY, row.status);

    if (action === "none") {
      return;
    }

    swipedRowRef.current = row.id;

    if (action === "copy" || action === "fade") {
      const rowQuoteStatus =
        row.id === selectedRowId && selectedMode === action ? quoteStatus : "idle";
      if (!walletConnected || rowQuoteStatus !== "ready") {
        onSelectRow(row.id, action);
        return;
      }

      onWalletSubmit(row.id, action);
      return;
    }

    onSelectRow(row.id, "copy");
  };

  const resolvedEmptyTitle =
    emptyTitle ?? (showExpired ? "No positions for this filter" : "No live positions right now");
  const resolvedEmptyDetail =
    emptyDetail ??
    (showExpired ? "Try another expiration." : "Show expired to review recent testnet activity.");
  const headingAriaLabel = sourceLabel ? `${title}, ${sourceLabel} BTC markets` : title;
  const headingTitle = sourceLabel ? `${sourceLabel} BTC markets` : title;
  const renderMarketHeatTradeRow = (row: MarketHeatPreviewRow) => {
    const isSelected = row.id === selectedRowId;
    const rowIntentMode = isSelected ? selectedMode : "copy";
    const rowIntentLabel = marketHeatIntentModeLabel(rowIntentMode);
    const rowIntentSide = resolveMarketHeatIntentSide(row.side, rowIntentMode);
    const intentPanel = isSelected ? buildMarketHeatIntentPanel(row, rowIntentMode) : null;
    const sideClass = row.side.toLowerCase();
    const isWalletSubmitReady = row.status === "copy_ready";
    const rowQuote = isSelected ? quote : null;
    const rowQuoteStatus = isSelected ? quoteStatus : "idle";
    const isQuoteReady = Boolean(rowQuoteStatus === "ready" && rowQuote);
    const isQuoteError = rowQuoteStatus === "error";
    const quoteFallbackLabel = isQuoteError
      ? "Quote unavailable — retry"
      : rowQuoteStatus === "loading"
        ? "Loading quote..."
        : "Live quote needed";
    const walletSubmitCta = !walletConnected
      ? "Connect wallet first"
      : isQuoteError
        ? "Quote unavailable — retry"
        : isQuoteReady
          ? rowIntentLabel
          : `Loading ${rowIntentLabel.toLowerCase()} quote...`;
    const copyAttributionLabel = copyAttributionLabels[row.id];
    const swipePreviewForRow = swipePreview?.rowId === row.id ? swipePreview : null;
    const swipeDirectionMode =
      swipePreviewForRow && row.status === "copy_ready"
        ? swipePreviewForRow.deltaX < 0
          ? "fade"
          : "copy"
        : null;
    const swipeMode =
      swipePreviewForRow?.action === "fade" || swipePreviewForRow?.action === "copy"
        ? swipePreviewForRow.action
        : swipeDirectionMode;
    const swipeLabel = swipeMode ? marketHeatIntentModeLabel(swipeMode) : "Open";
    const returnPreview = rowQuote ? buildReturnPreviewFromQuote(rowQuote) : null;
    const rowIdentityTitle = identityMode === "market" ? row.pairLabel : row.displayName;
    const rowIdentityDetail =
      identityMode === "market" ? row.statusLabel : row.walletStatsLabel ?? row.statusLabel;
    const rowActionLabel =
      identityMode === "market"
        ? `${row.pairLabel} ${row.side} call`
        : `${row.displayName} call`;
    const walletProfileLabel = `Open ${row.displayName} profile`;
    const walletProfileContent = (
      <>
        {identityMode === "wallet" ? (
          <WalletIdenticon compact displayName={row.displayName} wallet={row.wallet} />
        ) : null}
        <div className="market-heat-compact-identity">
          <strong>{rowIdentityTitle}</strong>
          <span>{rowIdentityDetail}</span>
          {copyAttributionLabel ? (
            <span className="market-heat-copy-attribution">{copyAttributionLabel}</span>
          ) : null}
        </div>
      </>
    );
    const durationLabel = row.timeRemainingLabel ?? row.expiryTimeLabel;
    const isLiveCountdown = isLiveCountdownLabel(row.timeRemainingLabel);
    const intentPanelElement = intentPanel ? (
      <div
        className={`inline-watch-panel inline-watch-panel-${row.status}`}
        data-testid="market-heat-intent-panel"
      >
        <div className={`market-heat-intent-mode market-heat-intent-mode-${rowIntentMode}`}>
          <strong>{rowIntentLabel}</strong>
          <span>{rowIntentMode === "fade" ? "Opposite side" : "Same side"}</span>
        </div>
        <div className="market-heat-intent-targets" aria-label={`${rowIdentityTitle} intent`}>
          <span>
            <small>{rowIntentMode === "fade" ? "Fade target" : "Target"}</small>
            <strong>
              {rowIntentSide === "UP" ? "Above" : "Below"}{" "}
              {row.strikeLabel.replace(/^Strike\s+/, "")}
            </strong>
            <em>at expiry</em>
          </span>
          <span>
            <small>Expiry</small>
            <strong>{row.expiryTimeLabel}</strong>
          </span>
          <span>
            <small>Potential payout</small>
            <strong>
              {isWalletSubmitReady
                ? returnPreview?.profitLabel ?? quoteFallbackLabel
                : intentPanel.detailLabel}
            </strong>
          </span>
        </div>
        <div className="market-heat-stake-label">Stake amount</div>
        <CopyAmountControls
          ariaLabel="Quick spend amounts"
          copyAmount={copyAmount}
          onAmountSet={onAmountSet}
          stopPropagation={true}
        />
        <div className="market-heat-intent-footer">
          <span>
            <small>Est. payout</small>
            <strong>{returnPreview?.payoutLabel ?? quoteFallbackLabel}</strong>
          </span>
          <span>
            <small>Max profit</small>
            <strong>{returnPreview?.profitLabel ?? quoteFallbackLabel}</strong>
          </span>
          <span>
            <small>Cost</small>
            <strong>{formatCopyAmount(copyAmount)}</strong>
          </span>
          <span>
            <small>Heat</small>
            <strong>{row.heatScore}</strong>
          </span>
          {isWalletSubmitReady ? (
            <button
              type="button"
              className="wallet-submit-button"
              data-testid="market-heat-wallet-submit"
              disabled={!walletConnected || (!isQuoteReady && !isQuoteError)}
              onClick={(event) => {
                event.stopPropagation();
                if (!walletConnected) {
                  return;
                }

                if (isQuoteError) {
                  onRetryQuote?.();
                  return;
                }

                if (!isQuoteReady) {
                  return;
                }

                onWalletSubmit(row.id);
              }}
            >
              {walletSubmitCta}
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

    return (
      <article
        aria-current={isSelected ? "true" : undefined}
        className={`market-heat-row market-heat-row-compact market-heat-row-${row.status} market-heat-row-${sideClass} ${
          isSelected ? "market-heat-row-selected" : ""
        } ${swipePreviewForRow ? "market-heat-row-swiping" : ""} ${
          swipeMode === "copy" ? "market-heat-row-swipe-copying" : ""
        } ${swipeMode === "fade" ? "market-heat-row-swipe-fading" : ""} ${
          isSelected ? `market-heat-row-intent-${rowIntentMode}` : ""
        }`}
        data-testid="market-heat-row"
        key={row.id}
        onClick={() => {
          if (swipedRowRef.current === row.id) {
            swipedRowRef.current = null;
            return;
          }

          onSelectRow(row.id, rowIntentMode);
        }}
        onPointerCancel={() => {
          swipeStartRef.current = null;
        }}
        onPointerDown={(event) => startMarketHeatSwipe(row.id, event)}
        onPointerMove={(event) => updateMarketHeatSwipe(row, event)}
        onPointerUp={(event) => finishMarketHeatSwipe(row, event)}
      >
        {swipePreviewForRow ? (
          <div
            className={`market-heat-swipe-action market-heat-swipe-action-${
              swipePreviewForRow.deltaX < 0 ? "fade" : "copy"
            }`}
            aria-hidden="true"
          >
            {swipeLabel}
          </div>
        ) : null}
        <div
          className="market-heat-compact-row"
          style={
            swipePreviewForRow
              ? { transform: `translateX(${swipePreviewForRow.deltaX}px)` }
              : undefined
          }
        >
          <div
            className={`market-heat-compact-wallet${
              identityMode === "market" ? " market-heat-compact-wallet-market" : ""
            }`}
          >
            {identityMode === "wallet" && onWalletOpen ? (
              <button
                type="button"
                aria-label={walletProfileLabel}
                className="market-heat-wallet-profile"
                data-testid="market-heat-wallet-profile"
                onClick={(event) => {
                  event.stopPropagation();
                  onWalletOpen({
                    displayName: row.displayName,
                    wallet: row.wallet,
                  });
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onPointerMove={(event) => {
                  event.stopPropagation();
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                }}
              >
                {walletProfileContent}
              </button>
            ) : (
              walletProfileContent
            )}
          </div>
          <strong className={`direction-pill direction-pill-${sideClass}`}>
            {row.side}
          </strong>
          <div className="market-heat-compact-strike">
            <strong>{row.strikeLabel.replace(/^Strike\s+/, "")}</strong>
          </div>
          <div
            className={`market-heat-compact-duration${
              isLiveCountdown ? " market-heat-countdown-live" : ""
            }`}
          >
            <strong>{durationLabel}</strong>
          </div>
          <div
            className="market-heat-compact-heat"
            aria-label={`Heat ${row.heatScore}. ${MARKET_HEAT_DESCRIPTION}`}
            title={MARKET_HEAT_DESCRIPTION}
          >
            <strong>{row.heatScore}</strong>
          </div>
          {onShareRow ? (
            <button
              type="button"
              className="market-heat-share-button"
              aria-label={`Share ${rowActionLabel}`}
              title="Share call"
              data-testid="market-heat-share"
              onClick={(event) => {
                event.stopPropagation();
                onShareRow(row.id);
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
              }}
            >
              <ShareIcon />
            </button>
          ) : null}
          <ChevronIcon
            className={`market-heat-compact-chevron ${
              isSelected ? "market-heat-compact-chevron-open" : ""
            }`}
          />
        </div>
        {intentPanelElement}
      </article>
    );
  };
  return (
    <section
      className="market-heat-list market-heat-list-compact"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="section-heading market-heat-heading">
        <div className="market-heat-heading-title">
          <p
            aria-label={headingAriaLabel}
            title={headingTitle}
          >
            {title}
          </p>
          {subtitle ? <small className="market-heat-subtitle">{subtitle}</small> : null}
        </div>
        {showControls ? (
          <div className="market-heat-controls">
            <TradeExpiryRail
              allSelected={!selectedExpiryDate}
              ariaLabel="Feed expiration dates"
              includeAllOption
              onAllSelect={onAllExpiriesSelect}
              options={expiryOptions}
              selectedExpiryDate={selectedExpiryDate}
              testIdPrefix="feed-expiry"
              onExpiryChange={onExpiryChange}
            />
            <div className="market-heat-secondary-controls">
              <div className="market-heat-sort" aria-label="Market heat sort">
                <button
                  type="button"
                  aria-pressed={sortMode === "latest"}
                  data-testid="market-heat-sort-latest"
                  onClick={() => onSortModeChange("latest")}
                >
                  Latest
                </button>
                <button
                  type="button"
                  aria-pressed={sortMode === "heat"}
                  data-testid="market-heat-sort-heat"
                  onClick={() => onSortModeChange("heat")}
                >
                  Heat
                </button>
                <button
                  type="button"
                  aria-pressed={sortMode === "following"}
                  data-testid="market-heat-sort-following"
                  onClick={() => onSortModeChange("following")}
                >
                  Following
                </button>
              </div>
              <button
                type="button"
                className="market-heat-expired-toggle"
                aria-label={showExpired ? "Hide expired positions" : "Show expired positions"}
                aria-pressed={showExpired}
                data-testid="market-heat-show-expired"
                onClick={() => onShowExpiredChange(!showExpired)}
              >
                Expired
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="market-heat-empty" data-testid="market-heat-empty">
          <strong>{resolvedEmptyTitle}</strong>
          <span>{resolvedEmptyDetail}</span>
          {!showExpired && showEmptyAction ? (
            <button
              type="button"
              onClick={() => {
                if (onEmptyAction) {
                  onEmptyAction();
                  return;
                }

                onShowExpiredChange(true);
              }}
            >
              {emptyActionLabel ?? "Show expired"}
            </button>
          ) : null}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="market-heat-table-head">
          <span aria-hidden="true">{identityMode === "market" ? "Market" : "Wallet"}</span>
          <span aria-hidden="true">Direction</span>
          <span aria-hidden="true">Strike</span>
          <span aria-hidden="true">Expiration</span>
          <span className="market-heat-head-heat">
            <button
              type="button"
              aria-describedby={isHeatDescriptionOpen ? heatDescriptionId : undefined}
              aria-expanded={isHeatDescriptionOpen}
              aria-label="What does Heat mean?"
              className="market-heat-info-trigger"
              data-testid="market-heat-info-trigger"
              title={MARKET_HEAT_DESCRIPTION}
              onClick={(event) => {
                event.stopPropagation();
                setIsHeatDescriptionOpen((isOpen) => !isOpen);
              }}
            >
              Heat <span className="market-heat-info" aria-hidden="true">i</span>
            </button>
            {isHeatDescriptionOpen ? (
              <span
                className="market-heat-info-tooltip"
                data-testid="market-heat-info-tooltip"
                id={heatDescriptionId}
                role="tooltip"
              >
                {MARKET_HEAT_DESCRIPTION}
              </span>
            ) : null}
          </span>
          <span aria-hidden="true" />
        </div>
      ) : null}
      {rows.map((row) => renderMarketHeatTradeRow(row))}
      {canShowMore ? (
        <button
          type="button"
          className="market-heat-show-more"
          data-testid="market-heat-show-more"
          onClick={onShowMore}
        >
          {showMoreLabel}
        </button>
      ) : null}
    </section>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function MarketHeader({
  themeControl = null,
  walletControl,
}: {
  themeControl?: ReactNode;
  walletControl: ReactNode;
}) {
  return (
    <header className="market-strip" data-testid="market-header">
      <div className="market-live">
        <span aria-hidden="true" />
        <div>
          <h1>Hot Hands</h1>
        </div>
      </div>
      {themeControl ? (
        <div className="market-header-actions" data-testid="market-header-actions">
          {themeControl}
        </div>
      ) : null}
      <div className="market-header-wallet" data-testid="market-header-wallet">
        {walletControl}
      </div>
    </header>
  );
}

export function AccountSummary({
  availableLabel = null,
  bankrollLabel = null,
  depositAmount = DEPOSIT_AMOUNT_DEFAULT,
  onDeposit,
  onDepositAmountChange,
  onStakeAmountChange,
  pnlLabel,
  pnlTitle = "All-time PNL",
  pnlTone,
  stakeAmount,
  summary,
  variant = "default",
}: {
  availableLabel?: string | null;
  bankrollLabel?: string | null;
  depositAmount?: number;
  onDeposit?: () => void;
  onDepositAmountChange?: (amount: number) => void;
  onStakeAmountChange?: (amount: number) => void;
  pnlLabel?: string;
  pnlTitle?: string;
  pnlTone?: "positive" | "negative" | "flat";
  stakeAmount?: number;
  summary: ReturnType<typeof getReplayAccountSummary>;
  variant?: AccountSummaryVariant;
}) {
  const visiblePnlLabel = pnlLabel ?? summary.pnl;
  const visiblePnlTone = pnlTone ?? summary.pnlTone;
  const visibleStakeAmount =
    typeof stakeAmount === "number" && Number.isFinite(stakeAmount)
      ? stakeAmount
      : COPY_AMOUNT_DEFAULT;
  const isPortfolioSummary = variant === "portfolio";

  return (
    <section
      className={`account-summary account-summary-${visiblePnlTone}`}
      aria-label="Account summary"
      data-testid="session-pnl"
    >
      <div className="account-summary-main">
        <div className="account-pnl" data-testid="account-pnl">
          <p>{pnlTitle}</p>
          <strong>{visiblePnlLabel}</strong>
        </div>
        <div className="account-value">
          <span title="Funds deposited into the Predict manager">Deposited</span>
          <strong data-testid="predict-bankroll-balance">
            {bankrollLabel ?? summary.accountValue}
          </strong>
          {onDeposit ? (
            <div className="account-deposit-control">
              <label className="account-deposit-amount">
                <span aria-hidden="true">$</span>
                <input
                  aria-label="Deposit amount"
                  data-testid="deposit-bankroll-amount"
                  inputMode="decimal"
                  min={DEPOSIT_AMOUNT_MIN}
                  step="0.01"
                  type="number"
                  value={depositAmount}
                  onChange={(event) => onDepositAmountChange?.(Number(event.currentTarget.value))}
                />
              </label>
              <button
                type="button"
                className="account-deposit-button"
                data-testid="deposit-bankroll"
                onClick={onDeposit}
              >
                Deposit
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="account-summary-stats">
        <div>
          <span title="dUSDC available in the connected wallet">Wallet balance</span>
          <strong data-testid="available-wallet-balance">
            {availableLabel ?? summary.available}
          </strong>
        </div>
        {isPortfolioSummary ? (
          <>
            <div className="account-stake-cell">
              <span>Stake</span>
              <label className="account-stake-amount">
                <span aria-hidden="true">$</span>
                <input
                  aria-label="Default stake amount"
                  data-testid="default-stake-amount"
                  inputMode="decimal"
                  min={COPY_AMOUNT_MIN}
                  max={COPY_AMOUNT_MAX}
                  step="0.01"
                  type="number"
                  value={visibleStakeAmount}
                  onChange={(event) => onStakeAmountChange?.(Number(event.currentTarget.value))}
                />
              </label>
            </div>
            <div className="account-deposit-cell">
              <button
                type="button"
                className="account-summary-deposit-button"
                data-testid="portfolio-deposit-bankroll"
                onClick={onDeposit}
              >
                Deposit
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Copy</span>
              <strong>{summary.copyValue}</strong>
            </div>
            <div>
              <span>Position</span>
              <strong>{summary.status}</strong>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function HotTraderList({
  traders,
  selectedTraderId,
  expandedTraderId,
  receiptState,
  copyAmount,
  hotTraderId,
  onCopy,
  onAmountStep,
  onAmountSet,
  onArmToggle,
  onConfirmCopy,
  onClose,
}: {
  traders: Trader[];
  selectedTraderId: string;
  expandedTraderId: string | null;
  receiptState: string;
  copyAmount: number;
  hotTraderId: string;
  onCopy: (traderId: string) => void;
  onAmountStep: (direction: -1 | 1) => void;
  onAmountSet: (amount: number) => void;
  onArmToggle: () => void;
  onConfirmCopy: () => void;
  onClose: () => void;
}) {
  const hasArmedSelection = receiptState !== "Disarmed";

  return (
    <section className="trader-list" aria-label="Hot leaderboard" data-testid="hot-leaderboard">
      <div className="section-heading">
        <p>Hot Right Now</p>
        <span>Copy hand</span>
      </div>
      {traders.map((trader) => (
        <TraderRow
          trader={trader}
          key={trader.id}
          isSelected={
            trader.id === selectedTraderId &&
            (hasArmedSelection || trader.id === expandedTraderId)
          }
          isExpanded={trader.id === expandedTraderId}
          isHotTrader={trader.id === hotTraderId}
          receiptState={receiptState}
          copyAmount={copyAmount}
          onCopy={onCopy}
          onAmountStep={onAmountStep}
          onAmountSet={onAmountSet}
          onArmToggle={onArmToggle}
          onConfirmCopy={onConfirmCopy}
          onClose={onClose}
        />
      ))}
    </section>
  );
}

export function App() {
  const dAppKit = useDAppKit();
  const currentAccount = useCurrentAccount();
  const currentClient = useCurrentClient();
  const currentWallet = useCurrentWallet();
  const currentNetwork = useCurrentNetwork();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();
  const readOnlyWalletAddress = useMemo(() => getReadOnlyWalletAddress(), []);
  const [scenario, setScenario] = useState(() => createReplayScenario("opening-night"));
  const [replayState, setReplayState] = useState(() =>
    updateReplayCopy(createInitialReplayState(scenario), (copy) =>
      setCopyAmount(copy, readStoredStakeAmount()),
    ),
  );
  const realtimeApiBaseUrl = import.meta.env.VITE_HOT_HANDS_API_URL;
  const [activeView, setActiveView] = useState<AppView>(() =>
    getInitialAppView(
      typeof window === "undefined" ? "" : window.location.search,
      readOnlyWalletAddress,
    ),
  );
  const [followedWallets, setFollowedWallets] = useState<FollowedWallet[]>(() =>
    readFollowedWallets(),
  );
  const [selectedProfileWallet, setSelectedProfileWallet] =
    useState<FollowedWallet | null>(null);
  const appScrollRef = useRef<HTMLDivElement | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode());
  const [tradeSide, setTradeSide] = useState<TradeSide>("UP");
  const [selectedTradeMarketId, setSelectedTradeMarketId] = useState<string | null>(null);
  const [customTradeStrikes, setCustomTradeStrikes] = useState<
    Record<string, TradeMarketSelection>
  >({});
  const [portfolioWalletSubmitPositionId, setPortfolioWalletSubmitPositionId] =
    useState<string | null>(null);
  const [walletTxState, setWalletTxState] = useState<WalletTransactionState>(
    idleWalletTransactionState,
  );
  const [isWalletChooserOpen, setIsWalletChooserOpen] = useState(false);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const toastCounterRef = useRef(0);
  const toastTimeoutsRef = useRef<number[]>([]);
  const [shareCard, setShareCard] = useState<ShareCardState | null>(null);
  const [copyAttributions, setCopyAttributions] = useState<CopyAttributionRecord[]>(() =>
    readStoredCopyAttributions(),
  );
  const [dusdcBalanceRefreshKey, setDusdcBalanceRefreshKey] = useState(0);
  const [dusdcBalanceState, setDusdcBalanceState] = useState<DusdcBalanceState>({
    accountAddress: null,
    refreshKey: 0,
    status: "idle",
    label: null,
  });
  const [predictManagerBankrollRefreshKey, setPredictManagerBankrollRefreshKey] =
    useState(0);
  const [predictManagerBankrollState, setPredictManagerBankrollState] =
    useState<PredictManagerBankrollState>({
      accountAddress: null,
      managerObjectId: null,
      refreshKey: 0,
      status: "idle",
      atomicBalance: null,
      label: null,
    });
  const [predictManagerRefreshKey, setPredictManagerRefreshKey] = useState(0);
  const [predictManagerState, setPredictManagerState] = useState<PredictManagerState>({
    accountAddress: null,
    objectId: null,
    refreshKey: 0,
    status: "idle",
  });
  const [predictPortfolioRefreshKey, setPredictPortfolioRefreshKey] = useState(0);
  const [predictPortfolioState, setPredictPortfolioState] = useState<PredictPortfolioState>({
    history: [],
    managerObjectId: null,
    pnl: idlePredictPortfolioPnl,
    refreshKey: 0,
    status: "idle",
    positions: [],
  });
  const [profileHistoryState, setProfileHistoryState] = useState<ProfileHistoryState>({
    history: [],
    status: "idle",
    wallet: null,
  });
  const [walletLeaderboardsState, setWalletLeaderboardsState] =
    useState<WalletLeaderboardsState>(() => ({
      snapshot: buildWalletLeaderboards(),
      status: "idle",
    }));
  const [activeWalletLeaderboard, setActiveWalletLeaderboard] =
    useState<WalletLeaderboardPanelBoardKey>("pnl");
  const [walletLeaderboardSortDirection, setWalletLeaderboardSortDirection] =
    useState<WalletLeaderboardSortDirection>("best");
  const [walletLeaderboardRangeMode, setWalletLeaderboardRangeMode] =
    useState<WalletLeaderboardRangeMode>("allTime");
  const [portfolioNowMs, setPortfolioNowMs] = useState(() => Date.now());
  const [dismissedPortfolioPositionIds, setDismissedPortfolioPositionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [depositAmount, setDepositAmount] = useState(DEPOSIT_AMOUNT_DEFAULT);
  const [tradeQuoteState, setTradeQuoteState] = useState<{
    key: string | null;
    status: TradeQuoteStatus;
    quote: TradeQuote | null;
  }>({
    key: null,
    status: "idle",
    quote: null,
  });
  const [marketHeatQuoteState, setMarketHeatQuoteState] = useState<{
    key: string | null;
    status: TradeQuoteStatus;
    quote: TradeQuote | null;
  }>({
    key: null,
    status: "idle",
    quote: null,
  });
  const [marketHeatQuoteRefreshKey, setMarketHeatQuoteRefreshKey] = useState(0);
  const [tradeQuoteRequested, setTradeQuoteRequested] = useState(false);
  const previewMode = getInitialPreviewMode(realtimeApiBaseUrl);
  const [marketHeatPreview, setMarketHeatPreview] = useState<MarketHeatPreviewModel>(() =>
    buildMarketHeatPreview(),
  );
  const marketHeatPreviewRef = useRef(marketHeatPreview);
  const [oraclePriceChart, setOraclePriceChart] =
    useState<OraclePriceChart | null>(null);
  const oraclePriceChartRef = useRef<OraclePriceChart | null>(null);
  const [isOracleChartOpen, setIsOracleChartOpen] = useState(false);
  const [marketHeatSortMode, setMarketHeatSortMode] =
    useState<MarketHeatFeedMode>("latest");
  const [marketHeatShowExpired, setMarketHeatShowExpired] = useState(false);
  const [selectedFeedExpiryDate, setSelectedFeedExpiryDate] = useState<string | null>(null);
  const [selectedTradeExpiryDate, setSelectedTradeExpiryDate] = useState<string | null>(null);
  const [marketHeatVisibleLimit, setMarketHeatVisibleLimit] =
    useState(MARKET_HEAT_PAGE_SIZE);
  const [profilePositionVisibleLimit, setProfilePositionVisibleLimit] =
    useState(MARKET_HEAT_PAGE_SIZE);
  const [marketHeatIntent, setMarketHeatIntent] = useState<MarketHeatIntentState>({
    selectedRowId: null,
  });
  const [expandedTraderId, setExpandedTraderId] = useState<string | null>(null);
  const [frozenTraderOrder, setFrozenTraderOrder] = useState<string[] | null>(null);
  const dismissToast = (toastId: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  };
  const pushToast = (toast: AppToastInput) => {
    toastCounterRef.current += 1;
    const id = `toast-${Date.now()}-${toastCounterRef.current}`;
    const nextToast: AppToast = { ...toast, id };

    setToasts((currentToasts) => {
      const filteredToasts = toast.groupKey
        ? currentToasts.filter((currentToast) => currentToast.groupKey !== toast.groupKey)
        : currentToasts;

      return [nextToast, ...filteredToasts].slice(0, TOAST_LIMIT);
    });

    if (typeof window !== "undefined") {
      const timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, TOAST_TIMEOUT_MS);
      toastTimeoutsRef.current.push(timeoutId);
    }
  };
  const recordCopyAttribution = (input: Omit<CopyAttributionRecord, "id">) => {
    setCopyAttributions((currentRecords) => {
      const nextRecords = appendCopyAttributionRecord(currentRecords, input);
      writeStoredCopyAttributions(nextRecords);
      return nextRecords;
    });
  };
  const openShareCard = async (input: HotHandsShareCardInput) => {
    try {
      const card = await renderShareCard(input);
      setShareCard(card);
      pushToast({
        kind: "success",
        title: "Share card ready",
        message: input.kind === "call" ? "Call card generated." : "Profile card generated.",
        groupKey: "share-card",
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Share failed",
        message: walletErrorMessage(error),
        groupKey: "share-card",
      });
    }
  };
  const handleCopyShareCard = async () => {
    if (!shareCard) {
      return;
    }

    try {
      const copied = await copyShareCardToClipboard(shareCard);
      pushToast({
        kind: "success",
        title: copied === "image" ? "Image copied" : "Link copied",
        message:
          copied === "image"
            ? "Paste the card into X or a message."
            : "Image copy was unavailable, so the share text was copied.",
        groupKey: "share-card",
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Copy failed",
        message: walletErrorMessage(error),
        groupKey: "share-card",
      });
    }
  };
  const handleShareCardToX = () => {
    if (!shareCard) {
      return;
    }

    window.open(shareCard.xUrl, "_blank", "noopener,noreferrer");
    pushToast({
      kind: "success",
      title: "X composer opened",
      message: "Share text is prefilled.",
      groupKey: "share-card",
    });
  };
  const copyState = replayState.copy;
  useEffect(() => {
    writeStoredStakeAmount(copyState.copyAmount);
  }, [copyState.copyAmount]);
  const replayTraders = useMemo(
    () => getReplayTraders(replayState, scenario),
    [replayState, scenario],
  );
  const displayedTraders = useMemo(() => {
    if (!frozenTraderOrder) {
      return replayTraders;
    }

    const tradersById = new Map(replayTraders.map((trader) => [trader.id, trader]));
    const frozenIds = new Set(frozenTraderOrder);
    const frozenTraders = frozenTraderOrder
      .map((traderId) => tradersById.get(traderId))
      .filter((trader): trader is Trader => Boolean(trader));
    const newTraders = replayTraders.filter((trader) => !frozenIds.has(trader.id));

    return [...frozenTraders, ...newTraders];
  }, [frozenTraderOrder, replayTraders]);
  const marketHeatNowMs = Date.now();
  const copyAttributionLabelsByRowId = useMemo(
    () => buildCopyAttributionLabelsByRowId(marketHeatPreview.rows, copyAttributions),
    [copyAttributions, marketHeatPreview.rows],
  );
  const effectiveMarketHeatSortMode: MarketHeatSortMode =
    marketHeatSortMode === "following" ? "latest" : marketHeatSortMode;
  const allVisibleMarketHeatRows = selectVisibleMarketHeatRows(marketHeatPreview.rows, {
    diversifyWallets: true,
    intervalLabel: null,
    limit: Number.MAX_SAFE_INTEGER,
    nowMs: marketHeatNowMs,
    showExpired: marketHeatShowExpired,
    sortMode: effectiveMarketHeatSortMode,
  });
  const feedModeMarketHeatRows =
    marketHeatSortMode === "following"
      ? filterMarketHeatRowsByFollowedWallets(allVisibleMarketHeatRows, followedWallets)
      : allVisibleMarketHeatRows;
  const liveOraclePriceLabel =
    oraclePriceChart?.status === "ready" ? oraclePriceChart.latestPriceLabel : null;
  const tradeMarketPriceLabel = liveOraclePriceLabel ?? marketHeatPreview.marketPrice.priceLabel;
  const allTradeMarketRows = buildTradeMarketLadder(marketHeatPreview, {
    intervalLabel: null,
    nowMs: marketHeatNowMs,
    spotPriceLabel: tradeMarketPriceLabel,
  });
  const tradeExpiryOptions = buildTradeExpiryOptions(allTradeMarketRows, marketHeatNowMs);
  const activeFeedExpiryDate =
    selectedFeedExpiryDate &&
    tradeExpiryOptions.some((option) => option.value === selectedFeedExpiryDate)
      ? selectedFeedExpiryDate
      : null;
  const expiryFilteredMarketHeatRows = selectMarketHeatRowsForExpiry(
    feedModeMarketHeatRows,
    activeFeedExpiryDate,
  );
  const sortedMarketHeatRows = expiryFilteredMarketHeatRows.slice(0, marketHeatVisibleLimit);
  const activeTradeExpiryDate =
    selectedTradeExpiryDate &&
    tradeExpiryOptions.some((option) => option.value === selectedTradeExpiryDate)
      ? selectedTradeExpiryDate
      : tradeExpiryOptions[0]?.value ?? null;
  const tradeMarketRows = selectTradeMarketsForExpiry(
    allTradeMarketRows,
    activeTradeExpiryDate,
  );
  const baseSelectedTradeMarket =
    tradeMarketRows.find((marketRow) => marketRow.id === selectedTradeMarketId) ??
    tradeMarketRows[0] ??
    null;
  const selectedTradeCustomStrike = baseSelectedTradeMarket
    ? customTradeStrikes[baseSelectedTradeMarket.id] ??
      buildTradeMarketSelectionFromRow(baseSelectedTradeMarket)
    : null;
  const selectedTradeMarket = baseSelectedTradeMarket
    ? applyCustomStrikeToTradeMarket(
        baseSelectedTradeMarket,
        selectedTradeCustomStrike,
        tradeMarketPriceLabel,
      )
    : null;
  const activeChartOracleId =
    activeView === "trade" && selectedTradeMarket
      ? selectedTradeMarket.oracleId
      : tradeMarketRows[0]?.oracleId ??
        sortedMarketHeatRows.find((row) => row.oracleId)?.oracleId ??
        null;
  const displayedTradeMarketRows = tradeMarketRows.map((marketRow) => {
    if (marketRow.id !== baseSelectedTradeMarket?.id) {
      return marketRow;
    }

    return selectedTradeMarket ?? marketRow;
  });
  const oracleChartMarketContext = buildOraclePriceChartMarketContext({
    marketRows: displayedTradeMarketRows,
    selectedMarket: selectedTradeMarket,
    selectedSide: tradeSide,
  });
  const tradeQuoteKey = selectedTradeMarket
    ? buildTradeQuoteKey(selectedTradeMarket, tradeSide, copyState.copyAmount)
    : null;
  const activeTradeQuote =
    tradeQuoteState.key === tradeQuoteKey ? tradeQuoteState.quote : null;
  const activeTradeQuoteStatus =
    activeTradeQuote
      ? "ready"
      : tradeQuoteState.key === tradeQuoteKey
        ? tradeQuoteState.status
        : "idle";
  const activeMarketHeatCopyTrade = marketHeatIntent.selectedRowId
    ? buildTradeMarketForMarketHeatRow(marketHeatPreview, marketHeatIntent.selectedRowId, {
        nowMs: marketHeatNowMs,
        spotPriceLabel: tradeMarketPriceLabel,
      })
    : null;
  const activeMarketHeatIntentMode = marketHeatIntent.mode ?? "copy";
  const activeMarketHeatQuoteSide = activeMarketHeatCopyTrade
    ? resolveMarketHeatIntentSide(activeMarketHeatCopyTrade.row.side, activeMarketHeatIntentMode)
    : null;
  const marketHeatQuoteKey = activeMarketHeatCopyTrade
    ? buildTradeQuoteKey(
        activeMarketHeatCopyTrade.market,
        activeMarketHeatQuoteSide ?? activeMarketHeatCopyTrade.row.side,
        copyState.copyAmount,
      )
    : null;
  const activeMarketHeatQuote =
    marketHeatQuoteState.key === marketHeatQuoteKey ? marketHeatQuoteState.quote : null;
  const activeMarketHeatQuoteStatus =
    activeMarketHeatQuote
      ? "ready"
      : marketHeatQuoteState.key === marketHeatQuoteKey
        ? marketHeatQuoteState.status
        : "idle";

  useEffect(() => {
    marketHeatPreviewRef.current = marketHeatPreview;
  }, [marketHeatPreview]);

  useEffect(() => {
    oraclePriceChartRef.current = oraclePriceChart;
  }, [oraclePriceChart]);

  useEffect(() => {
    if (activeView !== "trade" || !baseSelectedTradeMarket) {
      return;
    }

    setSelectedTradeMarketId((marketId) => marketId ?? baseSelectedTradeMarket.id);
    setCustomTradeStrikes((state) => {
      if (state[baseSelectedTradeMarket.id]) {
        return state;
      }

      return {
        ...state,
        [baseSelectedTradeMarket.id]: buildTradeMarketSelectionFromRow(baseSelectedTradeMarket),
      };
    });
  }, [activeView, baseSelectedTradeMarket?.id]);

  const marketHeatVisibleTotal = expiryFilteredMarketHeatRows.length;
  const marketHeatRemainingCount = Math.max(
    0,
    marketHeatVisibleTotal - sortedMarketHeatRows.length,
  );
  const marketHeatShowMoreCount = Math.min(
    MARKET_HEAT_PAGE_SIZE,
    marketHeatRemainingCount,
  );
  const marketHeatShowMoreLabel =
    marketHeatShowMoreCount === 1 ? "Show 1 more" : `Show ${marketHeatShowMoreCount} more`;
  const frame = useMemo(
    () => getReplayFrame(replayState, scenario, market),
    [replayState, scenario],
  );
  const hotTrader = replayTraders.find((trader) => trader.name === frame.hotHand.leader);
  const accountSummary = getReplayAccountSummary(replayState, frame);
  const receipt = frame.copyReceipt;
  const isWalletActionPending = walletTxState.status === "pending";
  const isReadOnlyWalletView = !currentAccount && Boolean(readOnlyWalletAddress);
  const connectedAccountAddress = currentAccount?.address ?? readOnlyWalletAddress;
  const activeProfileWalletAddress =
    selectedProfileWallet?.wallet ?? connectedAccountAddress ?? null;
  const isOwnActiveProfileWallet =
    Boolean(activeProfileWalletAddress && connectedAccountAddress) &&
    activeProfileWalletAddress?.toLowerCase() === connectedAccountAddress?.toLowerCase();
  const activeProfileLeaderboardEntry = findWalletLeaderboardEntry(
    walletLeaderboardsState.snapshot,
    activeProfileWalletAddress,
  );
  const allProfilePositionRows = activeProfileWalletAddress
    ? selectVisibleMarketHeatRows(marketHeatPreview.rows, {
        intervalLabel: null,
        limit: Number.MAX_SAFE_INTEGER,
        nowMs: marketHeatNowMs,
        showExpired: false,
        sortMode: "latest",
      }).filter(
        (row) =>
          row.wallet.toLowerCase() === activeProfileWalletAddress.toLowerCase(),
      )
    : [];
  const activeProfileCopyAttributionLabel = activeProfileWalletAddress
    ? buildCopyAttributionLabelForRows(allProfilePositionRows, copyAttributions)
    : null;
  const profilePositionRows = allProfilePositionRows.slice(0, profilePositionVisibleLimit);
  const profilePositionRemainingCount = Math.max(
    0,
    allProfilePositionRows.length - profilePositionRows.length,
  );
  const profilePositionShowMoreCount = Math.min(
    MARKET_HEAT_PAGE_SIZE,
    profilePositionRemainingCount,
  );
  const profilePositionShowMoreLabel =
    profilePositionShowMoreCount === 1
      ? "Show 1 more"
      : `Show ${profilePositionShowMoreCount} more`;

  useEffect(() => {
    if (connectedAccountAddress || wallets.length <= 1) {
      setIsWalletChooserOpen(false);
    }
  }, [connectedAccountAddress, wallets.length]);

  useEffect(() => {
    syncAppViewToUrl(activeView);
  }, [activeView]);

  useEffect(() => {
    setProfilePositionVisibleLimit(MARKET_HEAT_PAGE_SIZE);
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
  }, [activeProfileWalletAddress]);

  useEffect(() => {
    if (activeView !== "profile" || !activeProfileWalletAddress || isOwnActiveProfileWallet) {
      return undefined;
    }

    const client = createPredictPortfolioIndexedEventClient({
      apiBaseUrl: realtimeApiBaseUrl,
      walletAddress: activeProfileWalletAddress,
    });

    if (!client) {
      setProfileHistoryState({
        history: [],
        status: "idle",
        wallet: activeProfileWalletAddress,
      });
      return undefined;
    }

    let isCurrent = true;
    setProfileHistoryState({
      history: [],
      status: "loading",
      wallet: activeProfileWalletAddress,
    });

    void loadPredictPortfolioSnapshot({
      client,
      limit: 80,
      managerObjectId: null,
      maxPages: 1,
      nowMs: Date.now(),
      settlementClient: createPredictPortfolioSettlementClient({
        apiBaseUrl: realtimeApiBaseUrl,
      }),
    })
      .then((snapshot) => {
        if (!isCurrent) {
          return;
        }

        setProfileHistoryState({
          history: snapshot.history.slice(0, 8),
          status: "ready",
          wallet: activeProfileWalletAddress,
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setProfileHistoryState({
          history: [],
          status: "error",
          wallet: activeProfileWalletAddress,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [activeProfileWalletAddress, activeView, isOwnActiveProfileWallet, realtimeApiBaseUrl]);

  const liveDusdcBalanceLabel =
    connectedAccountAddress &&
    dusdcBalanceState.accountAddress === connectedAccountAddress &&
    dusdcBalanceState.refreshKey === dusdcBalanceRefreshKey
      ? dusdcBalanceState.status === "ready"
        ? dusdcBalanceState.label
        : dusdcBalanceState.status === "loading"
          ? "Loading..."
          : dusdcBalanceState.status === "error"
            ? "$--"
            : null
      : connectedAccountAddress
        ? "Loading..."
        : null;
  const isPredictManagerStateCurrent =
    connectedAccountAddress &&
    predictManagerState.accountAddress === connectedAccountAddress &&
    predictManagerState.refreshKey === predictManagerRefreshKey;
  const activePredictManagerObjectId =
    isPredictManagerStateCurrent && predictManagerState.status === "ready"
      ? predictManagerState.objectId ?? ""
      : "";
  const visiblePredictManagerObjectId = isPredictManagerStateCurrent
    ? predictManagerState.objectId
    : null;
  const visiblePredictManagerStatus: PredictManagerStatus = connectedAccountAddress
    ? isPredictManagerStateCurrent
      ? predictManagerState.status
      : "checking"
    : "idle";
  const isPredictManagerBankrollStateCurrent =
    connectedAccountAddress &&
    activePredictManagerObjectId &&
    predictManagerBankrollState.accountAddress === connectedAccountAddress &&
    predictManagerBankrollState.managerObjectId === activePredictManagerObjectId &&
    predictManagerBankrollState.refreshKey === predictManagerBankrollRefreshKey;
  const livePredictManagerBankrollLabel =
    connectedAccountAddress && activePredictManagerObjectId
      ? isPredictManagerBankrollStateCurrent
        ? predictManagerBankrollState.status === "ready"
          ? predictManagerBankrollState.label
          : predictManagerBankrollState.status === "loading"
            ? "Loading..."
            : predictManagerBankrollState.status === "error"
              ? "$--"
              : null
        : "Loading..."
      : connectedAccountAddress && visiblePredictManagerStatus === "missing"
        ? "$0"
        : null;
  const livePredictManagerBankrollAtomic =
    isPredictManagerBankrollStateCurrent &&
    predictManagerBankrollState.status === "ready"
      ? predictManagerBankrollState.atomicBalance
      : null;
  const isPredictPortfolioStateCurrent =
    activePredictManagerObjectId &&
    predictPortfolioState.managerObjectId === activePredictManagerObjectId &&
    predictPortfolioState.refreshKey === predictPortfolioRefreshKey;
  const visiblePortfolioStatus: PredictPortfolioState["status"] = activePredictManagerObjectId
    ? isPredictPortfolioStateCurrent
      ? predictPortfolioState.status
      : "loading"
    : "idle";
  const visiblePortfolioPositions = isPredictPortfolioStateCurrent
    ? selectVisiblePortfolioPositions(predictPortfolioState.positions, {
        dismissedPositionIds: dismissedPortfolioPositionIds,
        nowMs: portfolioNowMs,
      })
    : [];
  const copiedPositionSourceLabels = useMemo(
    () => buildCopiedPositionSourceLabels(copyAttributions, connectedAccountAddress),
    [connectedAccountAddress, copyAttributions],
  );
  const visiblePortfolioPositionsWithAttribution = useMemo(
    () =>
      addCopiedSourceLabelsToPortfolioPositions(
        visiblePortfolioPositions,
        copiedPositionSourceLabels,
      ),
    [copiedPositionSourceLabels, visiblePortfolioPositions],
  );
  const visiblePortfolioHistory = isPredictPortfolioStateCurrent
    ? predictPortfolioState.history
    : [];
  const isProfileHistoryStateCurrent =
    activeProfileWalletAddress &&
    profileHistoryState.wallet?.toLowerCase() === activeProfileWalletAddress.toLowerCase();
  const activeProfileHistoryItems = isOwnActiveProfileWallet
    ? visiblePortfolioHistory
    : isProfileHistoryStateCurrent
      ? profileHistoryState.history
      : [];
  const activeProfileHistoryStatus: ProfileHistoryStatus = isOwnActiveProfileWallet
    ? visiblePortfolioStatus
    : isProfileHistoryStateCurrent
      ? profileHistoryState.status
      : activeProfileWalletAddress
        ? "loading"
        : "idle";
  const activeProfileStats = activeProfileLeaderboardEntry
    ? buildProfileStatSummary(activeProfileLeaderboardEntry)
    : buildProfileStatSummaryFromHistory(
        activeProfileHistoryItems,
        activeProfileHistoryStatus,
      );
  const visiblePortfolioPnl =
    activePredictManagerObjectId && isPredictPortfolioStateCurrent
      ? predictPortfolioState.status === "ready"
        ? predictPortfolioState.pnl
        : predictPortfolioState.status === "loading"
          ? {
              ...idlePredictPortfolioPnl,
              pnlLabel: "Loading...",
            }
          : predictPortfolioState.status === "error"
            ? {
                ...idlePredictPortfolioPnl,
                pnlLabel: "$--",
              }
            : idlePredictPortfolioPnl
      : idlePredictPortfolioPnl;

  useEffect(() => {
    return () => {
      for (const timeoutId of toastTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    writeThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (appScrollRef.current) {
      appScrollRef.current.scrollTop = 0;
    }
  }, [activeView]);

  useEffect(() => {
    const toast = buildWalletToast(walletTxState);
    if (toast) {
      pushToast(toast);
    }
  }, [walletTxState.digest, walletTxState.label, walletTxState.status]);

  useEffect(() => {
    if (!connectedAccountAddress) {
      setPredictManagerState({
        accountAddress: null,
        objectId: null,
        refreshKey: predictManagerRefreshKey,
        status: "idle",
      });
      return undefined;
    }

    let isCurrent = true;
    const storedObjectId = readStoredPredictManagerObjectId(connectedAccountAddress);
    setPredictManagerState({
      accountAddress: connectedAccountAddress,
      objectId: storedObjectId,
      refreshKey: predictManagerRefreshKey,
      status: "checking",
    });

    void findPredictManagerForOwner({
      owner: connectedAccountAddress,
      maxPages: 10,
    })
      .then((objectId) => {
        if (!isCurrent) {
          return;
        }

        if (objectId) {
          writeStoredPredictManagerObjectId(connectedAccountAddress, objectId);
          setPredictManagerState({
            accountAddress: connectedAccountAddress,
            objectId,
            refreshKey: predictManagerRefreshKey,
            status: "ready",
          });
          return;
        }

        setPredictManagerState({
          accountAddress: connectedAccountAddress,
          objectId: storedObjectId,
          refreshKey: predictManagerRefreshKey,
          status: storedObjectId ? "ready" : "missing",
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setPredictManagerState({
          accountAddress: connectedAccountAddress,
          objectId: storedObjectId,
          refreshKey: predictManagerRefreshKey,
          status: storedObjectId ? "ready" : "error",
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [connectedAccountAddress, predictManagerRefreshKey]);

  useEffect(() => {
    setDismissedPortfolioPositionIds(
      readDismissedPortfolioPositionIds(activePredictManagerObjectId || null),
    );
  }, [activePredictManagerObjectId]);

  useEffect(() => {
    if (!connectedAccountAddress) {
      setDusdcBalanceState({
        accountAddress: null,
        refreshKey: dusdcBalanceRefreshKey,
        status: "idle",
        label: null,
      });
      return undefined;
    }

    let isCurrent = true;
    setDusdcBalanceState({
      accountAddress: connectedAccountAddress,
      refreshKey: dusdcBalanceRefreshKey,
      status: "loading",
      label: null,
    });

    void loadDusdcBalanceLabel({
      client: currentClient,
      owner: connectedAccountAddress,
    })
      .then((label) => {
        if (!isCurrent) {
          return;
        }

        setDusdcBalanceState({
          accountAddress: connectedAccountAddress,
          refreshKey: dusdcBalanceRefreshKey,
          status: "ready",
          label,
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setDusdcBalanceState({
          accountAddress: connectedAccountAddress,
          refreshKey: dusdcBalanceRefreshKey,
          status: "error",
          label: null,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [connectedAccountAddress, currentClient, dusdcBalanceRefreshKey]);

  useEffect(() => {
    if (!connectedAccountAddress || !activePredictManagerObjectId) {
      setPredictManagerBankrollState({
        accountAddress: connectedAccountAddress,
        managerObjectId: activePredictManagerObjectId || null,
        refreshKey: predictManagerBankrollRefreshKey,
        status: "idle",
        atomicBalance: null,
        label: null,
      });
      return undefined;
    }

    let isCurrent = true;
    setPredictManagerBankrollState({
      accountAddress: connectedAccountAddress,
      managerObjectId: activePredictManagerObjectId,
      refreshKey: predictManagerBankrollRefreshKey,
      status: "loading",
      atomicBalance: null,
      label: null,
    });

    void loadPredictManagerBankrollAtomic({
      client: currentClient,
      predictManagerObjectId: activePredictManagerObjectId,
      sender: connectedAccountAddress,
    })
      .then((atomicBalance) => {
        if (!isCurrent) {
          return;
        }

        setPredictManagerBankrollState({
          accountAddress: connectedAccountAddress,
          managerObjectId: activePredictManagerObjectId,
          refreshKey: predictManagerBankrollRefreshKey,
          status: "ready",
          atomicBalance,
          label: formatDusdcBalance(atomicBalance),
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setPredictManagerBankrollState({
          accountAddress: connectedAccountAddress,
          managerObjectId: activePredictManagerObjectId,
          refreshKey: predictManagerBankrollRefreshKey,
          status: "error",
          atomicBalance: null,
          label: null,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [
    activePredictManagerObjectId,
    connectedAccountAddress,
    currentClient,
    predictManagerBankrollRefreshKey,
  ]);

  useEffect(() => {
    if (!activePredictManagerObjectId) {
      setPredictPortfolioState({
        managerObjectId: null,
        history: [],
        pnl: idlePredictPortfolioPnl,
        refreshKey: predictPortfolioRefreshKey,
        status: "idle",
        positions: [],
      });
      return undefined;
    }

    let isCurrent = true;
    setPredictPortfolioState((state) => ({
      history:
        state.managerObjectId === activePredictManagerObjectId
          ? state.history
          : [],
      managerObjectId: activePredictManagerObjectId,
      pnl:
        state.managerObjectId === activePredictManagerObjectId
          ? state.pnl
          : idlePredictPortfolioPnl,
      refreshKey: predictPortfolioRefreshKey,
      status: "loading",
      positions:
        state.managerObjectId === activePredictManagerObjectId
          ? state.positions
          : [],
    }));

    void loadPredictPortfolioSnapshot({
      client: createPredictPortfolioIndexedEventClient({
        apiBaseUrl: realtimeApiBaseUrl,
        managerObjectId: activePredictManagerObjectId,
      }),
      closeQuoteClient: createPredictPortfolioCloseQuoteClient({
        apiBaseUrl: realtimeApiBaseUrl,
      }),
      managerObjectId: activePredictManagerObjectId,
      maxPages: 12,
      settlementClient: createPredictPortfolioSettlementClient({
        apiBaseUrl: realtimeApiBaseUrl,
      }),
    })
      .then((snapshot) => {
        if (!isCurrent) {
          return;
        }

        setPredictPortfolioState({
          history: snapshot.history,
          managerObjectId: activePredictManagerObjectId,
          pnl: snapshot.pnl,
          refreshKey: predictPortfolioRefreshKey,
          status: "ready",
          positions: snapshot.positions,
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setPredictPortfolioState({
          history: [],
          managerObjectId: activePredictManagerObjectId,
          pnl: idlePredictPortfolioPnl,
          refreshKey: predictPortfolioRefreshKey,
          status: "error",
          positions: [],
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [activePredictManagerObjectId, predictPortfolioRefreshKey, realtimeApiBaseUrl]);

  useEffect(() => {
    let isCurrent = true;
    let isRefreshing = false;

    const refreshMarketHeat = async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      try {
        const preview = await loadMarketHeatPreview({
          apiBaseUrl: realtimeApiBaseUrl,
          includeExpired: marketHeatShowExpired,
          useMainnetSuinsNames: true,
        });
        if (isCurrent) {
          const stablePreview = preserveMarketHeatAvailableMarketStrikes(
            preview,
            marketHeatPreviewRef.current,
          );
          marketHeatPreviewRef.current = stablePreview;
          setMarketHeatPreview(stablePreview);
        }
      } finally {
        isRefreshing = false;
      }
    };

    const refreshMarketHeatPrice = async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      try {
        const preview = await loadMarketHeatPriceSnapshot(marketHeatPreviewRef.current, {
          apiBaseUrl: realtimeApiBaseUrl,
          includeExpired: marketHeatShowExpired,
          useMainnetSuinsNames: true,
        });
        if (isCurrent) {
          marketHeatPreviewRef.current = preview;
          setMarketHeatPreview(preview);
        }
      } finally {
        isRefreshing = false;
      }
    };

    void refreshMarketHeat();

    if (previewMode !== "market" || !realtimeApiBaseUrl) {
      return () => {
        isCurrent = false;
      };
    }

    const priceRefreshTimer = window.setInterval(
      refreshMarketHeatPrice,
      MARKET_HEAT_PRICE_REFRESH_MS,
    );
    const rowsRefreshMs = getMarketHeatRowsRefreshMs(activeView);
    const rowsRefreshTimer = rowsRefreshMs === null
      ? null
      : window.setInterval(refreshMarketHeat, rowsRefreshMs);

    return () => {
      isCurrent = false;
      window.clearInterval(priceRefreshTimer);
      if (rowsRefreshTimer !== null) {
        window.clearInterval(rowsRefreshTimer);
      }
    };
  }, [activeView, marketHeatShowExpired, previewMode, realtimeApiBaseUrl]);

  useEffect(() => {
    if (!shouldAutoRefreshWalletLeaderboards(activeView)) {
      return undefined;
    }

    let isCurrent = true;
    let isRefreshing = false;

    const refreshWalletLeaderboards = async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      setWalletLeaderboardsState((state) => ({
        ...state,
        status: state.status === "ready" ? "ready" : "loading",
      }));

      try {
        const snapshot = await loadWalletLeaderboards({
          apiBaseUrl: realtimeApiBaseUrl,
          useMainnetSuinsNames: true,
        });

        if (isCurrent) {
          setWalletLeaderboardsState({
            snapshot,
            status: "ready",
          });
        }
      } catch {
        if (isCurrent) {
          setWalletLeaderboardsState((state) => ({
            ...state,
            status: "error",
          }));
        }
      } finally {
        isRefreshing = false;
      }
    };

    void refreshWalletLeaderboards();

    if (!realtimeApiBaseUrl) {
      return () => {
        isCurrent = false;
      };
    }

    const refreshTimer = window.setInterval(
      refreshWalletLeaderboards,
      WALLET_LEADERBOARDS_REFRESH_MS,
    );

    return () => {
      isCurrent = false;
      window.clearInterval(refreshTimer);
    };
  }, [activeView, realtimeApiBaseUrl]);

  useEffect(() => {
    if (!realtimeApiBaseUrl || !activeChartOracleId) {
      oraclePriceChartRef.current = null;
      setOraclePriceChart(null);
      return undefined;
    }

    let isCurrent = true;
    let isHistoryRefreshing = false;
    let isTickRefreshing = false;
    setOraclePriceChart((chart) => {
      const nextChart = chart?.oracleId === activeChartOracleId ? chart : null;
      oraclePriceChartRef.current = nextChart;
      return nextChart;
    });

    const updateOraclePriceChart = (chart: OraclePriceChart | null) => {
      oraclePriceChartRef.current = chart;
      setOraclePriceChart(chart);
    };

    const refreshOraclePriceChartHistory = async () => {
      if (isHistoryRefreshing) {
        return;
      }

      isHistoryRefreshing = true;
      try {
        const chart = await loadOraclePriceChart({
          apiBaseUrl: realtimeApiBaseUrl,
          oracleId: activeChartOracleId,
        });
        if (isCurrent) {
          updateOraclePriceChart(chart);
        }
      } finally {
        isHistoryRefreshing = false;
      }
    };

    const refreshOraclePriceChartTick = async () => {
      if (isTickRefreshing) {
        return;
      }

      const currentChart = oraclePriceChartRef.current;
      if (
        !currentChart ||
        currentChart.status !== "ready" ||
        currentChart.oracleId !== activeChartOracleId
      ) {
        return;
      }

      isTickRefreshing = true;
      try {
        const chart = await loadOraclePriceChartTick({
          chart: currentChart,
          apiBaseUrl: realtimeApiBaseUrl,
          oracleId: activeChartOracleId,
        });
        if (isCurrent && chart !== currentChart) {
          updateOraclePriceChart(chart);
        }
      } finally {
        isTickRefreshing = false;
      }
    };

    void refreshOraclePriceChartHistory();
    const tickRefreshTimer = window.setInterval(
      refreshOraclePriceChartTick,
      ORACLE_PRICE_CHART_TICK_REFRESH_MS,
    );
    const historyRefreshTimer = window.setInterval(
      refreshOraclePriceChartHistory,
      ORACLE_PRICE_CHART_HISTORY_REFRESH_MS,
    );

    return () => {
      isCurrent = false;
      window.clearInterval(tickRefreshTimer);
      window.clearInterval(historyRefreshTimer);
    };
  }, [activeChartOracleId, realtimeApiBaseUrl]);

  useEffect(() => {
    if (
      activeView !== "trade" ||
      previewMode !== "market" ||
      !realtimeApiBaseUrl ||
      !tradeQuoteRequested ||
      !selectedTradeMarket ||
      !tradeQuoteKey
    ) {
      setTradeQuoteState({
        key: null,
        status: "idle",
        quote: null,
      });
      return undefined;
    }

    let isCurrent = true;
    setTradeQuoteState({
      key: tradeQuoteKey,
      status: "loading",
      quote: null,
    });

    void loadTradeQuote({
      apiBaseUrl: realtimeApiBaseUrl,
      market: selectedTradeMarket,
      side: tradeSide,
      spendUsd: copyState.copyAmount,
    })
      .then((quote) => {
        if (!isCurrent) {
          return;
        }

        setTradeQuoteState({
          key: tradeQuoteKey,
          status: quote ? "ready" : "error",
          quote,
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setTradeQuoteState({
          key: tradeQuoteKey,
          status: "error",
          quote: null,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [
    copyState.copyAmount,
    activeView,
    previewMode,
    realtimeApiBaseUrl,
    selectedTradeMarket?.expiry,
    selectedTradeMarket?.id,
    selectedTradeMarket?.oracleId,
    selectedTradeMarket?.strikeRaw,
    tradeQuoteKey,
    tradeQuoteRequested,
    tradeSide,
  ]);

  useEffect(() => {
    if (
      (activeView !== "feed" && activeView !== "profile") ||
      previewMode !== "market" ||
      !realtimeApiBaseUrl ||
      !activeMarketHeatCopyTrade ||
      !marketHeatQuoteKey
    ) {
      setMarketHeatQuoteState({
        key: null,
        status: "idle",
        quote: null,
      });
      return undefined;
    }

    let isCurrent = true;
    setMarketHeatQuoteState({
      key: marketHeatQuoteKey,
      status: "loading",
      quote: null,
    });

    void loadTradeQuote({
      apiBaseUrl: realtimeApiBaseUrl,
      market: activeMarketHeatCopyTrade.market,
      side: activeMarketHeatQuoteSide ?? activeMarketHeatCopyTrade.row.side,
      spendUsd: copyState.copyAmount,
    })
      .then((quote) => {
        if (!isCurrent) {
          return;
        }

        setMarketHeatQuoteState({
          key: marketHeatQuoteKey,
          status: quote ? "ready" : "error",
          quote,
        });
      })
      .catch(() => {
        if (!isCurrent) {
          return;
        }

        setMarketHeatQuoteState({
          key: marketHeatQuoteKey,
          status: "error",
          quote: null,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [
    activeMarketHeatCopyTrade?.market.expiry,
    activeMarketHeatCopyTrade?.market.id,
    activeMarketHeatCopyTrade?.market.oracleId,
    activeMarketHeatCopyTrade?.market.strikeRaw,
    activeMarketHeatQuoteSide,
    activeView,
    copyState.copyAmount,
    marketHeatQuoteKey,
    marketHeatQuoteRefreshKey,
    previewMode,
    realtimeApiBaseUrl,
  ]);

  useEffect(() => {
    if (!replayState.isPlaying) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setReplayState((state) => advanceReplay(state, scenario));
    }, 1800);

    return () => window.clearInterval(timer);
  }, [replayState.isPlaying, scenario]);

  useEffect(() => {
    if (activeView !== "portfolio") {
      return undefined;
    }

    setPortfolioNowMs(Date.now());
    const timer = window.setInterval(() => {
      setPortfolioNowMs(Date.now());
    }, PORTFOLIO_TIME_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "portfolio" || !activePredictManagerObjectId) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setPredictPortfolioRefreshKey((key) => key + 1);
    }, PORTFOLIO_DATA_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [activePredictManagerObjectId, activeView]);

  const handleTraderSelect = (traderId: string) => {
    setReplayState((state) =>
      setReplayPlaying(
        updateReplayCopy(state, (copy) => selectHotTrader(copy, traderId, scenario.traders)),
        false,
      ),
    );
    setExpandedTraderId(traderId);
    setFrozenTraderOrder(replayTraders.map((trader) => trader.id));
  };

  const handleAmountStep = (direction: -1 | 1) => {
    setReplayState((state) => updateReplayCopy(state, (copy) => stepCopyAmount(copy, direction)));
  };

  const handleAmountSet = (amount: number) => {
    if (activeView === "trade") {
      setTradeQuoteRequested(true);
    }

    setReplayState((state) => updateReplayCopy(state, (copy) => setCopyAmount(copy, amount)));
  };

  const handleArmToggle = () => {
    setReplayState((state) =>
      setReplayPlaying(updateReplayCopy(state, (copy) => toggleCopyArmed(copy)), false),
    );
  };

  const handleConfirmCopy = () => {
    setReplayState((state) =>
      advanceReplay(
        updateReplayCopy(state, (copy) => markCopySubmitted(copy)),
        scenario,
      ),
    );
  };

  const handleCloseCopyPanel = () => {
    setExpandedTraderId(null);
    setFrozenTraderOrder(null);
  };

  const handleDismissPortfolioPosition = (positionId: string) => {
    if (!activePredictManagerObjectId) {
      return;
    }

    setDismissedPortfolioPositionIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.add(positionId);
      writeDismissedPortfolioPositionIds(activePredictManagerObjectId, nextIds);
      return nextIds;
    });
  };

  const handleMarketHeatSelect = (rowId: string, mode: MarketHeatIntentMode = "copy") => {
    setMarketHeatIntent((state) =>
      state.selectedRowId === rowId && (state.mode ?? "copy") === mode
        ? closeMarketHeatIntent(state)
        : selectMarketHeatIntent(state, rowId, marketHeatPreview.rows, mode),
    );
  };

  const handleMarketHeatWalletSubmit = async (
    rowId: string,
    mode: MarketHeatIntentMode = marketHeatIntent.mode ?? "copy",
  ) => {
    setMarketHeatIntent((state) =>
      selectMarketHeatIntent(state, rowId, marketHeatPreview.rows, mode),
    );

    if (!currentAccount) {
      setWalletTxState({
        status: "error",
        label: "Connect a Sui testnet wallet first.",
        digest: null,
      });
      return;
    }

    if (!activePredictManagerObjectId) {
      setWalletTxState({
        status: "error",
        label: "Create a Predict account first.",
        digest: null,
      });
      return;
    }

    const copyTrade = buildTradeMarketForMarketHeatRow(marketHeatPreview, rowId, {
      nowMs: Date.now(),
    });
    if (!copyTrade) {
      setWalletTxState({
        status: "error",
        label: "Select a live copy-ready feed row first.",
        digest: null,
      });
      return;
    }
    const copyTradeSide = resolveMarketHeatIntentSide(copyTrade.row.side, mode);
    const copyTradeLabel = marketHeatIntentModeLabel(mode);

    setWalletTxState({
      status: "pending",
      label: `Preparing ${copyTradeLabel.toLowerCase()} quote...`,
      digest: null,
    });

    try {
      const quote = await loadTradeQuote({
        apiBaseUrl: realtimeApiBaseUrl,
        market: copyTrade.market,
        side: copyTradeSide,
        spendUsd: copyState.copyAmount,
      });

      if (!quote) {
        setWalletTxState({
          status: "error",
          label: "Could not quote this feed copy. Try the Trade tab.",
          digest: null,
        });
        return;
      }

      const quoteCostAtomic = parseAtomicQuoteCost(quote.cost);
      if (
        quoteCostAtomic !== null &&
        livePredictManagerBankrollAtomic !== null &&
        livePredictManagerBankrollAtomic < quoteCostAtomic
      ) {
        setWalletTxState({
          status: "error",
          label: `Deposit bankroll first. Bankroll ${formatDusdcBalance(
            livePredictManagerBankrollAtomic,
          )}, copy needs ${formatDusdcBalance(quoteCostAtomic)}.`,
          digest: null,
        });
        return;
      }

      setWalletTxState({
        status: "pending",
        label: `Sending ${copyTradeLabel.toLowerCase()} to wallet...`,
        digest: null,
      });

      const transaction = buildTradeMintTransaction({
        predictManagerObjectId: activePredictManagerObjectId,
        market: copyTrade.market,
        quote,
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      const error = walletResultError(result);
      if (error) {
        setWalletTxState({
          status: "error",
          label: error,
          digest: null,
        });
        return;
      }

      const digest = walletResultDigest(result);
      setWalletTxState({
        status: "success",
        label: `${copyTradeLabel} transaction sent.`,
        digest,
      });
      recordCopyAttribution({
        amount:
          Number.isFinite(quote.costUsd) && quote.costUsd > 0
            ? quote.costUsd
            : copyState.copyAmount,
        copied_position_id: buildPredictPortfolioPositionId({
          managerId: activePredictManagerObjectId,
          oracleId: copyTrade.market.oracleId,
          expiry: copyTrade.market.expiry,
          strike: copyTrade.market.strikeRaw,
          direction: copyTradeSide,
        }),
        copier: currentAccount.address,
        position_id: copyAttributionTargetForMarketHeatRow(copyTrade.row).positionId,
        source_wallet: copyTrade.row.wallet,
        timestamp: Date.now(),
      });
      refreshAfterWalletTransaction(digest);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };
  const handleMarketHeatSortModeChange = (sortMode: MarketHeatFeedMode) => {
    setMarketHeatSortMode(sortMode);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
  };
  const handleFeedAllExpiriesSelect = () => {
    setSelectedFeedExpiryDate(null);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
  };
  const handleFeedExpiryChange = (expiryDate: string) => {
    setSelectedFeedExpiryDate(expiryDate);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
  };
  const handleTradeExpiryChange = (expiryDate: string) => {
    setTradeQuoteRequested(false);
    setSelectedTradeExpiryDate(expiryDate);
    const nextMarket = allTradeMarketRows.find(
      (marketRow) => tradeExpiryDateKey(marketRow.expiryMs) === expiryDate,
    );

    if (nextMarket) {
      setSelectedTradeMarketId(nextMarket.id);
    }
  };
  const handleMarketHeatShowExpiredChange = (showExpired: boolean) => {
    setMarketHeatShowExpired(showExpired);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
  };
  const handleMarketHeatShowMore = () => {
    setMarketHeatVisibleLimit((limit) => limit + MARKET_HEAT_PAGE_SIZE);
  };
  const handleFeedEmptyAction = () => {
    setActiveView("leaderboards");
  };
  const handleProfilePositionsShowMore = () => {
    setProfilePositionVisibleLimit((limit) => limit + MARKET_HEAT_PAGE_SIZE);
  };
  const handleBottomNavViewChange = (view: AppView) => {
    setSelectedProfileWallet((wallet) => resolveSelectedProfileWalletForNav(view, wallet));
    setActiveView(view);
  };
  const handleProfileWalletOpen = (wallet: FollowedWallet) => {
    const normalizedWallet = normalizeProfileWalletAddress(wallet.wallet);
    if (!normalizedWallet) {
      return;
    }

    setSelectedProfileWallet({
      displayName: wallet.displayName || formatWalletAddress(normalizedWallet),
      wallet: normalizedWallet,
    });
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
    setProfilePositionVisibleLimit(MARKET_HEAT_PAGE_SIZE);
    setActiveView("profile");
  };
  const handleFollowWallet = (wallet: FollowedWallet) => {
    const normalizedWallet = normalizeProfileWalletAddress(wallet.wallet);
    if (!normalizedWallet) {
      pushToast({
        kind: "error",
        title: "Follow failed",
        message: "Wallet address was invalid.",
        groupKey: "follow-wallet",
      });
      return;
    }

    setFollowedWallets((currentWallets) => {
      const nextWallets = mergeFollowedWallet(currentWallets, wallet);
      writeFollowedWallets(nextWallets);
      return nextWallets;
    });
    pushToast({
      kind: "success",
      title: "Wallet followed",
      message: wallet.displayName || formatWalletAddress(normalizedWallet),
      groupKey: "follow-wallet",
    });
  };
  const handleUnfollowWallet = (wallet: string) => {
    const normalizedWallet = normalizeProfileWalletAddress(wallet);
    if (!normalizedWallet) {
      pushToast({
        kind: "error",
        title: "Unfollow failed",
        message: "Wallet address was invalid.",
        groupKey: "follow-wallet",
      });
      return;
    }

    setFollowedWallets((currentWallets) => {
      const nextWallets = currentWallets.filter(
        (followedWallet) =>
          followedWallet.wallet.toLowerCase() !== normalizedWallet.toLowerCase(),
      );
      writeFollowedWallets(nextWallets);
      return nextWallets;
    });
    pushToast({
      kind: "success",
      title: "Wallet unfollowed",
      message: formatWalletAddress(normalizedWallet),
      groupKey: "follow-wallet",
    });
  };
  const handleDepositAmountChange = (amount: number) => {
    setDepositAmount(clampDepositAmount(amount));
  };
  const handleTradeSideChange = (side: TradeSide) => {
    setTradeQuoteRequested(true);
    setTradeSide(side);
  };
  const handleTradeMarketChange = (selection: TradeMarketSelection) => {
    setTradeQuoteRequested(true);
    setSelectedTradeMarketId(selection.marketId);
    setCustomTradeStrikes((state) => ({
      ...state,
      [selection.marketId]: selection,
    }));
  };

  const connectToWallet = async (wallet: UiWallet | undefined) => {
    if (!wallet) {
      setWalletTxState({
        status: "error",
        label: "No compatible Sui wallet found.",
        digest: null,
      });
      return;
    }

    setWalletTxState({
      status: "pending",
      label: `Connecting ${wallet.name}...`,
      digest: null,
    });

    try {
      await dAppKit.connectWallet({ wallet });
      setWalletTxState(idleWalletTransactionState);
      pushToast({
        kind: "success",
        title: "Wallet connected",
        message: wallet.name,
      });
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };

  const handleWalletConnect = () => {
    if (wallets.length === 0) {
      void connectToWallet(undefined);
      return;
    }

    if (wallets.length === 1) {
      void connectToWallet(wallets[0]);
      return;
    }

    setIsWalletChooserOpen((isOpen) => !isOpen);
  };

  const handleWalletSelect = (walletIndex: number) => {
    setIsWalletChooserOpen(false);
    void connectToWallet(wallets[walletIndex]);
  };

  const handleWalletDisconnect = async () => {
    try {
      await dAppKit.disconnectWallet();
      setWalletTxState(idleWalletTransactionState);
      setPortfolioWalletSubmitPositionId(null);
      pushToast({
        kind: "success",
        title: "Wallet disconnected",
        message: "Session controls cleared.",
      });
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };
  const refreshPredictWalletSurfaces = () => {
    setDusdcBalanceRefreshKey((key) => key + 1);
    setPredictManagerRefreshKey((key) => key + 1);
    setPredictManagerBankrollRefreshKey((key) => key + 1);
    setPredictPortfolioRefreshKey((key) => key + 1);
  };
  const refreshAfterWalletTransaction = (digest: string | null) => {
    void waitForWalletTransactionFinality({
      client: currentClient,
      digest,
    }).finally(() => {
      schedulePostWalletRefresh({
        refresh: refreshPredictWalletSurfaces,
      });
    });
  };
  const handleCreatePredictManager = async () => {
    if (!currentAccount) {
      setWalletTxState({
        status: "error",
        label: "Connect a Sui testnet wallet first.",
        digest: null,
      });
      return;
    }

    setWalletTxState({
      status: "pending",
      label: "Creating Predict account...",
      digest: null,
    });

    try {
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildCreatePredictManagerTransaction(),
      });
      const error = walletResultError(result);
      if (error) {
        setWalletTxState({
          status: "error",
          label: error,
          digest: null,
        });
        return;
      }

      const digest = walletResultDigest(result);
      setWalletTxState({
        status: "success",
        label: "Predict account transaction sent. Checking account...",
        digest,
      });
      refreshAfterWalletTransaction(digest);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };
  const handleDepositBankroll = async () => {
    if (!currentAccount) {
      setWalletTxState({
        status: "error",
        label: "Connect a Sui testnet wallet first.",
        digest: null,
      });
      return;
    }

    if (!activePredictManagerObjectId) {
      setWalletTxState({
        status: "error",
        label: "Create a Predict account first.",
        digest: null,
      });
      return;
    }

    const amount = usdToDusdcAtomic(depositAmount);
    const amountLabel = formatCopyAmount(depositAmount);

    setWalletTxState({
      status: "pending",
      label: `Depositing ${amountLabel} to bankroll...`,
      digest: null,
    });

    try {
      const coin = await selectDusdcDepositCoin({
        amount,
        owner: currentAccount.address,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildDepositQuoteTransaction({
          amount,
          predictManagerObjectId: activePredictManagerObjectId,
          quoteCoinObjectId: coin.coinObjectId,
        }),
      });
      const error = walletResultError(result);
      if (error) {
        setWalletTxState({
          status: "error",
          label: error,
          digest: null,
        });
        return;
      }

      const digest = walletResultDigest(result);
      setWalletTxState({
        status: "success",
        label: `${amountLabel} deposit transaction sent.`,
        digest,
      });
      refreshAfterWalletTransaction(digest);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };
  const handleTradeWalletSubmit = async () => {
    if (!currentAccount) {
      setWalletTxState({
        status: "error",
        label: "Connect a Sui testnet wallet first.",
        digest: null,
      });
      return;
    }

    if (!selectedTradeMarket || !activeTradeQuote) {
      setWalletTxState({
        status: "error",
        label: "Wait for a live quote before sending.",
        digest: null,
      });
      return;
    }

    if (!activePredictManagerObjectId) {
      setWalletTxState({
        status: "error",
        label: "Create a Predict account first.",
        digest: null,
      });
      return;
    }

    const quoteCostAtomic = parseAtomicQuoteCost(activeTradeQuote.cost);
    if (
      quoteCostAtomic !== null &&
      livePredictManagerBankrollAtomic !== null &&
      livePredictManagerBankrollAtomic < quoteCostAtomic
    ) {
      setWalletTxState({
        status: "error",
        label: `Deposit bankroll first. Bankroll ${formatDusdcBalance(
          livePredictManagerBankrollAtomic,
        )}, trade needs ${formatDusdcBalance(quoteCostAtomic)}.`,
        digest: null,
      });
      return;
    }

    setWalletTxState({
      status: "pending",
      label: "Sending trade to wallet...",
      digest: null,
    });

    try {
      const transaction = buildTradeMintTransaction({
        predictManagerObjectId: activePredictManagerObjectId,
        market: selectedTradeMarket,
        quote: activeTradeQuote,
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      const error = walletResultError(result);
      if (error) {
        setWalletTxState({
          status: "error",
          label: error,
          digest: null,
        });
        return;
      }

      const digest = walletResultDigest(result);
      setWalletTxState({
        status: "success",
        label: "Trade transaction sent.",
        digest,
      });
      refreshAfterWalletTransaction(digest);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };
  const handlePortfolioPositionAction = async (position: PredictPortfolioPosition) => {
    if (!currentAccount) {
      setWalletTxState({
        status: "error",
        label: "Connect a Sui testnet wallet first.",
        digest: null,
      });
      return;
    }

    if (!activePredictManagerObjectId) {
      setWalletTxState({
        status: "error",
        label: "Create a Predict account first.",
        digest: null,
      });
      return;
    }

    setPortfolioWalletSubmitPositionId(position.id);
    setWalletTxState({
      status: "pending",
      label: `${position.actionLabel}ing position...`,
      digest: null,
    });

    try {
      const transaction = buildPortfolioRedeemTransaction({
        position,
        predictManagerObjectId: activePredictManagerObjectId,
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      const error = walletResultError(result);
      if (error) {
        setWalletTxState({
          status: "error",
          label: error,
          digest: null,
        });
        return;
      }

      const digest = walletResultDigest(result);
      setWalletTxState({
        status: "success",
        label: `${position.actionLabel} transaction sent.`,
        digest,
      });
      refreshAfterWalletTransaction(digest);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };
  const handleShareProfile = () => {
    if (!activeProfileWalletAddress) {
      pushToast({
        kind: "error",
        title: "No profile selected",
        message: "Open a wallet profile first.",
        groupKey: "share-card",
      });
      return;
    }

    const walletLabel =
      selectedProfileWallet?.displayName ??
      (isOwnActiveProfileWallet ? "Your wallet" : formatWalletAddress(activeProfileWalletAddress));

    void openShareCard({
      kind: "profile",
      title: walletLabel,
      subtitle: "Verifiable DeepBook Predict record",
      walletLabel,
      walletAddress: activeProfileWalletAddress,
      stats: buildProfileShareStats(activeProfileStats),
      copiedLabel: activeProfileCopyAttributionLabel,
      url: currentShareUrl(),
    });
  };
  const handleMarketHeatShare = (rowId: string) => {
    const row = getCopyableMarketHeatRows(marketHeatPreview.rows).find(
      (candidate) => candidate.id === rowId,
    );
    if (!row) {
      pushToast({
        kind: "error",
        title: "Call unavailable",
        message: "Refresh the feed and try again.",
        groupKey: "share-card",
      });
      return;
    }

    const copiedLabel = copyAttributionLabelsByRowId[row.id];
    void openShareCard({
      kind: "call",
      title: `${row.side} ${row.pairLabel} call`,
      subtitle: `${row.displayName} · ${row.statusLabel}`,
      walletLabel: row.displayName,
      walletAddress: row.wallet,
      stats: buildCallShareStats(row, copiedLabel),
      call: {
        direction: row.side,
        expiry: row.expiryTimeLabel,
        strike: row.strikeLabel.replace(/^Strike\s+/, ""),
      },
      copiedLabel,
      url: currentShareUrl(),
    });
  };

  const isFollowingFeedMode = marketHeatSortMode === "following";
  const followingFeedEmptyTitle = followedWallets.length
    ? "No followed calls right now"
    : "You're not following anyone yet";
  const followingFeedEmptyDetail = followedWallets.length
    ? "Fresh calls from followed wallets will appear here."
    : "Find leaders to follow.";

  const renderMarketHeatPreview = (testId = "market-heat-preview") => (
    <MarketHeatPreview
      rows={sortedMarketHeatRows}
      sourceLabel={marketHeatPreview.sourceLabel}
      sortMode={marketHeatSortMode}
      selectedExpiryDate={activeFeedExpiryDate}
      emptyActionLabel={isFollowingFeedMode ? "Find leaders" : undefined}
      emptyDetail={isFollowingFeedMode ? followingFeedEmptyDetail : undefined}
      emptyTitle={isFollowingFeedMode ? followingFeedEmptyTitle : undefined}
      expiryOptions={tradeExpiryOptions}
      showExpired={marketHeatShowExpired}
      showEmptyAction={isFollowingFeedMode ? true : undefined}
      canShowMore={marketHeatRemainingCount > 0}
      selectedMode={activeMarketHeatIntentMode}
      selectedRowId={marketHeatIntent.selectedRowId}
      copyAmount={copyState.copyAmount}
      copyAttributionLabels={copyAttributionLabelsByRowId}
      quote={activeMarketHeatQuote}
      quoteStatus={activeMarketHeatQuoteStatus}
      showMoreLabel={marketHeatShowMoreLabel}
      testId={testId}
      walletConnected={Boolean(currentAccount)}
      onAmountSet={handleAmountSet}
      onAllExpiriesSelect={handleFeedAllExpiriesSelect}
      onEmptyAction={isFollowingFeedMode ? handleFeedEmptyAction : undefined}
      onExpiryChange={handleFeedExpiryChange}
      onShowExpiredChange={handleMarketHeatShowExpiredChange}
      onShowMore={handleMarketHeatShowMore}
      onSortModeChange={handleMarketHeatSortModeChange}
      onWalletSubmit={handleMarketHeatWalletSubmit}
      onRetryQuote={() => setMarketHeatQuoteRefreshKey((key) => key + 1)}
      onShareRow={handleMarketHeatShare}
      onSelectRow={handleMarketHeatSelect}
      onWalletOpen={handleProfileWalletOpen}
    />
  );

  const renderTradeTicket = (testId = "trade-view") => (
    <TradeTicket
      customStrike={selectedTradeCustomStrike}
      copyAmount={copyState.copyAmount}
      expiryOptions={tradeExpiryOptions}
      marketPriceLabel={tradeMarketPriceLabel}
      marketRows={displayedTradeMarketRows}
      selectedExpiryDate={activeTradeExpiryDate}
      selectedMarketId={baseSelectedTradeMarket?.id ?? ""}
      selectedSide={tradeSide}
      quote={activeTradeQuote}
      quoteStatus={activeTradeQuoteStatus}
      predictManagerObjectId={activePredictManagerObjectId}
      testId={testId}
      walletActionPending={isWalletActionPending}
      walletConnected={Boolean(currentAccount)}
      onAmountSet={handleAmountSet}
      onExpiryChange={handleTradeExpiryChange}
      onMarketChange={handleTradeMarketChange}
      onSideChange={handleTradeSideChange}
      onWalletSubmit={handleTradeWalletSubmit}
    />
  );

  return (
    <main className="app-shell" data-theme={themeMode} data-testid="app-shell">
      <section
        className={`phone-frame phone-frame-${activeView}`}
        data-theme={themeMode}
        aria-label="Hot Hands market shell"
      >
        <div className="app-scroll" data-testid="app-scroll" ref={appScrollRef}>
          <MarketHeader
            themeControl={
              <button
                type="button"
                className="theme-toggle"
                data-testid="theme-toggle"
                aria-label={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
                title={`Switch to ${themeMode === "light" ? "dark" : "light"} mode`}
                onClick={() =>
                  setThemeMode((currentTheme) =>
                    currentTheme === "light" ? "dark" : "light",
                  )
                }
              >
                <span aria-hidden="true">
                  <ThemeModeIcon mode={themeMode === "light" ? "dark" : "light"} />
                </span>
              </button>
            }
            walletControl={
              <WalletHeaderControl
                accountAddress={connectedAccountAddress}
                connectionStatus={isReadOnlyWalletView ? "readonly" : walletConnection.status}
                readOnly={isReadOnlyWalletView}
                walletChoices={wallets}
                walletChooserOpen={isWalletChooserOpen}
                walletCount={wallets.length}
                onConnect={handleWalletConnect}
                onDisconnect={handleWalletDisconnect}
                onWalletSelect={handleWalletSelect}
              />
            }
          />
          <OraclePriceChartCard
            chart={oraclePriceChart}
            fallbackPriceLabel={marketHeatPreview.marketPrice.priceLabel}
            onOpen={() => setIsOracleChartOpen(true)}
          />
          <WalletStatusBar
            accountAddress={connectedAccountAddress}
            connectionStatus={isReadOnlyWalletView ? "readonly" : walletConnection.status}
            networkLabel={String(currentNetwork)}
            predictManagerObjectId={visiblePredictManagerObjectId}
            predictManagerStatus={visiblePredictManagerStatus}
            readOnly={isReadOnlyWalletView}
            txState={walletTxState}
            walletCount={wallets.length}
            walletName={isReadOnlyWalletView ? "Read-only wallet" : currentWallet?.name ?? null}
            onConnect={handleWalletConnect}
            onCreatePredictManager={handleCreatePredictManager}
            onDisconnect={handleWalletDisconnect}
            onWalletSelect={handleWalletSelect}
          />
          {shouldShowAccountSummary(activeView) ? (
            <AccountSummary
              availableLabel={liveDusdcBalanceLabel}
              bankrollLabel={livePredictManagerBankrollLabel}
              depositAmount={depositAmount}
              onDeposit={handleDepositBankroll}
              onDepositAmountChange={handleDepositAmountChange}
              onStakeAmountChange={handleAmountSet}
              pnlLabel={visiblePortfolioPnl.pnlLabel}
              pnlTone={visiblePortfolioPnl.pnlTone}
              stakeAmount={copyState.copyAmount}
              summary={accountSummary}
              variant={getAccountSummaryVariant(activeView)}
            />
          ) : null}
          {activeView === "feed" ? (
            renderMarketHeatPreview()
          ) : activeView === "trade" ? (
            renderTradeTicket()
          ) : activeView === "leaderboards" ? (
            <WalletLeaderboardsPanel
              activeBoard={activeWalletLeaderboard}
              rangeMode={walletLeaderboardRangeMode}
              sortDirection={walletLeaderboardSortDirection}
              snapshot={walletLeaderboardsState.snapshot}
              status={walletLeaderboardsState.status}
              onBoardChange={setActiveWalletLeaderboard}
              onWalletOpen={handleProfileWalletOpen}
              onRangeModeChange={setWalletLeaderboardRangeMode}
              onSortDirectionChange={setWalletLeaderboardSortDirection}
            />
          ) : activeView === "portfolio" ? (
            <PortfolioPanel
              emptyLabel={
                connectedAccountAddress
                  ? activePredictManagerObjectId
                    ? undefined
                    : "Create a Predict account first"
                  : "Connect wallet to see positions"
              }
              historyItems={visiblePortfolioHistory}
              nowMs={portfolioNowMs}
              positions={visiblePortfolioPositionsWithAttribution}
              status={visiblePortfolioStatus}
              walletActionPending={isWalletActionPending}
              walletSubmittedPositionId={portfolioWalletSubmitPositionId}
              onDismissPosition={handleDismissPortfolioPosition}
              onPositionAction={handlePortfolioPositionAction}
            />
          ) : (
            <ProfilePanel
              currentWalletAddress={connectedAccountAddress}
              copyAmount={copyState.copyAmount}
              copyAttributionLabels={copyAttributionLabelsByRowId}
              followedWallets={followedWallets}
              profileCopyAttributionLabel={activeProfileCopyAttributionLabel}
              profileHistoryItems={activeProfileHistoryItems}
              profileHistoryStatus={activeProfileHistoryStatus}
              profileStats={activeProfileStats}
              profileWallet={selectedProfileWallet}
              profilePositionRows={profilePositionRows}
              profilePositionsCanShowMore={profilePositionRemainingCount > 0}
              profilePositionsShowMoreLabel={profilePositionShowMoreLabel}
              selectedProfilePositionMode={activeMarketHeatIntentMode}
              selectedProfilePositionRowId={marketHeatIntent.selectedRowId}
              quote={activeMarketHeatQuote}
              quoteStatus={activeMarketHeatQuoteStatus}
              walletConnected={Boolean(currentAccount)}
              onAmountSet={handleAmountSet}
              onFollowWallet={handleFollowWallet}
              onProfilePositionSelect={handleMarketHeatSelect}
              onProfilePositionsShowMore={handleProfilePositionsShowMore}
              onProfilePositionWalletSubmit={handleMarketHeatWalletSubmit}
              onProfileQuoteRetry={() => setMarketHeatQuoteRefreshKey((key) => key + 1)}
              onShareProfile={handleShareProfile}
              onShareRow={handleMarketHeatShare}
              onSelectWallet={handleProfileWalletOpen}
              onUnfollowWallet={handleUnfollowWallet}
            />
          )}
        </div>
        {isOracleChartOpen ? (
          <OraclePriceChartModal
            chart={oraclePriceChart}
            marketContext={oracleChartMarketContext}
            nowMs={marketHeatNowMs}
            onClose={() => setIsOracleChartOpen(false)}
          >
            {renderTradeTicket("expanded-chart-trade-ticket")}
          </OraclePriceChartModal>
        ) : null}
        {shareCard ? (
          <ShareCardModal
            card={shareCard}
            onClose={() => setShareCard(null)}
            onCopy={() => {
              void handleCopyShareCard();
            }}
            onShareToX={handleShareCardToX}
          />
        ) : null}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <BottomNav activeView={activeView} onViewChange={handleBottomNavViewChange} />
      </section>
    </main>
  );
}
