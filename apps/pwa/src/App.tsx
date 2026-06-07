import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
  COPY_AMOUNT_MAX,
  COPY_AMOUNT_MIN,
  formatCopyAmount,
  markCopySubmitted,
  selectHotTrader,
  setCopyAmount,
  stepCopyAmount,
  toggleCopyArmed,
} from "./copyModel";
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
  loadTradeQuote,
  loadMarketHeatPreview,
  selectMarketHeatIntent,
  selectVisibleMarketHeatRows,
  type MarketHeatIntentState,
  type MarketHeatPreview as MarketHeatPreviewModel,
  type MarketHeatPreviewRow,
  type MarketHeatSortMode,
  type MarketDurationOption,
  type TradeQuote,
  type TradeMarketLadderRow,
  type TradeStrikeOption,
} from "./marketHeatModel";
import {
  OraclePriceChartCard,
  OraclePriceChartModal,
} from "./OraclePriceChart";
import {
  loadOraclePriceChart,
  type OraclePriceChart,
} from "./oraclePriceChartModel";
import {
  buildWalletLeaderboards,
  loadWalletLeaderboards,
  selectWalletLeaderboardEntries,
  WALLET_LEADERBOARD_BOARDS,
  type WalletLeaderboardBoardKey,
  type WalletLeaderboardEntry,
  type WalletLeaderboardPanelBoardKey,
  type WalletLeaderboardSortDirection,
  type WalletLeaderboardStreakMode,
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
const MARKET_HEAT_REFRESH_MS = 1_000;
const ORACLE_PRICE_CHART_REFRESH_MS = 1_000;
const MARKET_HEAT_PAGE_SIZE = 8;
const WALLET_LEADERBOARDS_REFRESH_MS = 15_000;
const PORTFOLIO_DATA_REFRESH_MS = 15_000;
const PORTFOLIO_TIME_REFRESH_MS = 15_000;
const DEPOSIT_AMOUNT_DEFAULT = 25;
const DEPOSIT_AMOUNT_MIN = 0.01;
const TOAST_LIMIT = 3;
const TOAST_TIMEOUT_MS = 4_500;
type PreviewMode = "replay" | "market";
export type AppView = "feed" | "trade" | "leaderboards" | "portfolio";
type MarketHeatDensity = "compact" | "expanded";
export type MarketHeatSwipeAction = "none" | "select" | "submit";
type MarketHeatSwipePreview = {
  action: MarketHeatSwipeAction;
  deltaX: number;
  rowId: string;
};
export function shouldShowAccountSummary(view: AppView): boolean {
  return view === "trade" || view === "portfolio";
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
type PortfolioTab = "positions" | "history";

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

function estimatePriceFromRow(row: Pick<MarketHeatPreviewRow, "cost" | "costUsd" | "quantity">): number | undefined {
  const costUsd =
    row.costUsd ??
    (row.cost === undefined || !Number.isFinite(row.cost) ? undefined : row.cost / 1_000_000);
  const payoutUsd =
    row.quantity === undefined || !Number.isFinite(row.quantity) || row.quantity <= 0
      ? undefined
      : row.quantity / 1_000_000;

  if (costUsd === undefined || costUsd <= 0 || payoutUsd === undefined || payoutUsd <= 0) {
    return undefined;
  }

  return costUsd / payoutUsd;
}

function formatObservedBuyAmount(row: Pick<MarketHeatPreviewRow, "cost" | "costUsd">): string {
  const costUsd =
    row.costUsd ??
    (row.cost === undefined || !Number.isFinite(row.cost) ? undefined : row.cost / 1_000_000);

  if (costUsd === undefined || !Number.isFinite(costUsd)) {
    return "Unknown";
  }

  return formatUsdValue(costUsd);
}

function marketDurationTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const MARKET_HEAT_SWIPE_CONFIRM_THRESHOLD = 86;
const MARKET_HEAT_SWIPE_VERTICAL_TOLERANCE = 38;
const MARKET_HEAT_SWIPE_MAX_OFFSET = 118;

export function resolveMarketHeatSwipeAction(
  deltaX: number,
  deltaY: number,
  rowStatus: MarketHeatPreviewRow["status"],
): MarketHeatSwipeAction {
  if (
    deltaX < MARKET_HEAT_SWIPE_CONFIRM_THRESHOLD ||
    Math.abs(deltaY) > MARKET_HEAT_SWIPE_VERTICAL_TOLERANCE
  ) {
    return "none";
  }

  return rowStatus === "copy_ready" ? "submit" : "select";
}

const TRADE_EXPIRY_DAY_MS = 24 * 60 * 60_000;
const MARKET_DURATION_OPTIONS: MarketDurationOption[] = [
  { count: 0, label: "15m", value: "15m" },
  { count: 0, label: "1h", value: "1h" },
  { count: 0, label: "1d", value: "1d" },
];
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

function tradeIntervalSortMs(intervalLabel: string): number {
  const match = /^(\d+)\s*([mhwd])$/i.exec(intervalLabel.trim());
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "w") {
    return value * 7 * TRADE_EXPIRY_DAY_MS;
  }

  if (unit === "d") {
    return value * TRADE_EXPIRY_DAY_MS;
  }

  if (unit === "h") {
    return value * 60 * 60_000;
  }

  return value * 60_000;
}

function marketDurationMatches(intervalLabel: string, duration: string): boolean {
  return intervalLabel.trim().toLowerCase() === duration.toLowerCase();
}

function selectMarketHeatRowsForDuration(
  rows: MarketHeatPreviewRow[],
  duration: string,
): MarketHeatPreviewRow[] {
  if (duration === "all") {
    return rows;
  }

  return rows.filter((row) => marketDurationMatches(row.intervalLabel, duration));
}

function selectTradeMarketsForDuration(
  marketRows: TradeMarketLadderRow[],
  duration: string,
): TradeMarketLadderRow[] {
  if (duration === "all") {
    return marketRows;
  }

  return marketRows.filter((marketRow) =>
    marketDurationMatches(marketRow.intervalLabel, duration),
  );
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
  return horizon === "Today" || horizon === "Tomorrow"
    ? horizon
    : tradeExpiryDateFormatter.format(expiryMs);
}

function formatTradeExpirySublabel(
  expiryMs: number,
  intervalLabels: string[],
  count: number,
  nowMs: number,
): string {
  const horizon = formatTradeExpiryHorizon(expiryMs, nowMs);
  const uniqueIntervals = [...new Set(intervalLabels)].sort(
    (left, right) =>
      tradeIntervalSortMs(left) - tradeIntervalSortMs(right) || left.localeCompare(right),
  );
  const intervalSummary =
    uniqueIntervals.length <= 2 ? uniqueIntervals.join(", ") : `${uniqueIntervals.length} expiries`;
  const countSummary = count === 1 ? "1 market" : `${count} markets`;

  if (horizon === "Today" || horizon === "Tomorrow") {
    return intervalSummary || countSummary;
  }

  if (horizon) {
    return `${horizon} · ${intervalSummary || countSummary}`;
  }

  return intervalSummary ? `${countSummary} · ${intervalSummary}` : countSummary;
}

function buildTradeExpiryOptions(
  marketRows: TradeMarketLadderRow[],
  nowMs: number,
): TradeExpiryOption[] {
  const expiriesByDate = new Map<
    string,
    {
      count: number;
      earliestExpiryMs: number;
      intervalLabels: string[];
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
      existing.intervalLabels.push(marketRow.intervalLabel);
      continue;
    }

    expiriesByDate.set(value, {
      count: 1,
      earliestExpiryMs: marketRow.expiryMs,
      intervalLabels: [marketRow.intervalLabel],
    });
  }

  return [...expiriesByDate.entries()]
    .map(([value, expiry]) => ({
      count: expiry.count,
      expiryMs: expiry.earliestExpiryMs,
      label: formatTradeExpiryLabel(expiry.earliestExpiryMs, nowMs),
      sublabel: formatTradeExpirySublabel(
        expiry.earliestExpiryMs,
        expiry.intervalLabels,
        expiry.count,
        nowMs,
      ),
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

function applyCustomStrikeToTradeMarket(
  market: TradeMarketLadderRow,
  customStrike: TradeMarketSelection | null | undefined,
  spotPriceLabel: string,
): TradeMarketLadderRow | null {
  if (!customStrike || customStrike.marketId !== market.id) {
    return market;
  }

  const spot = parseTradeStrikeInputValue(spotPriceLabel);

  return {
    ...market,
    strike: customStrike.strike,
    strikeLabel: customStrike.strikeLabel,
    strikeRaw: customStrike.strikeRaw,
    moneynessLabel:
      spot === null
        ? market.moneynessLabel
        : formatTradeMoneyness(customStrike.strike - spot),
  };
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

function formatTradeSidePayout(
  copyAmount: number,
  sideSummary: TradeMarketLadderRow["up"] | null | undefined,
): string {
  const returnPreview = buildReturnPreview(copyAmount, sideSummary?.estimatedPrice);
  return returnPreview ? `Pays ${returnPreview.payoutLabel}` : "Quote needed";
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

function walletAvatarLabel(displayName: string): string {
  return displayName.replace(/^0x/, "").slice(0, 2).toUpperCase() || "HH";
}

function formatWalletAddress(address: string | null | undefined): string {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
  return (
    <nav className="bottom-nav" aria-label="Primary" data-testid="bottom-nav">
      <button
        type="button"
        aria-pressed={activeView === "feed"}
        onClick={() => onViewChange("feed")}
      >
        🔥 Feed
      </button>
      <button
        type="button"
        aria-pressed={activeView === "leaderboards"}
        onClick={() => onViewChange("leaderboards")}
      >
        🏆 Leaders
      </button>
      <button
        type="button"
        aria-pressed={activeView === "trade"}
        onClick={() => onViewChange("trade")}
      >
        ↔ Trade
      </button>
      <button
        type="button"
        aria-pressed={activeView === "portfolio"}
        onClick={() => onViewChange("portfolio")}
      >
        💵 Portfolio
      </button>
    </nav>
  );
}

function MarketDurationToggle({
  ariaLabel,
  className = "",
  onDurationChange,
  options,
  selectedDuration,
  testIdPrefix,
}: {
  ariaLabel: string;
  className?: string;
  onDurationChange: (duration: string) => void;
  options: MarketDurationOption[];
  selectedDuration: string;
  testIdPrefix: string;
}) {
  return (
    <div className={`market-duration-toggle ${className}`} aria-label={ariaLabel}>
      <button
        type="button"
        aria-pressed={selectedDuration === "all"}
        data-testid={`${testIdPrefix}-all`}
        onClick={() => onDurationChange("all")}
      >
        All
      </button>
      {options.map((option) => (
        <button
          type="button"
          aria-pressed={selectedDuration === option.value}
          data-testid={`${testIdPrefix}-${marketDurationTestId(option.value)}`}
          key={option.value}
          onClick={() => onDurationChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TradeExpiryRail({
  onExpiryChange,
  options,
  selectedExpiryDate,
}: {
  onExpiryChange: (expiryDate: string) => void;
  options: TradeExpiryOption[];
  selectedExpiryDate: string | null;
}) {
  if (!options.length) {
    return null;
  }

  return (
    <div className="trade-expiry-rail" aria-label="Trade expiration dates">
      {options.map((option) => (
        <button
          type="button"
          className="trade-expiry-option"
          aria-pressed={selectedExpiryDate === option.value}
          data-testid={`trade-expiry-${marketDurationTestId(option.value)}`}
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

export function TradeTicket({
  customStrike = null,
  copyAmount,
  expiryOptions = [],
  marketPriceLabel = null,
  marketRows,
  selectedExpiryDate = null,
  selectedMarketId,
  selectedSide,
  selectedDuration = "all",
  durationOptions = [],
  quote = null,
  quoteStatus = "idle",
  predictManagerObjectId = "",
  testId = "trade-view",
  walletActionPending = false,
  walletConnected = false,
  onAmountSet,
  onDurationChange = () => undefined,
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
  selectedDuration?: string;
  durationOptions?: MarketDurationOption[];
  quote?: TradeQuote | null;
  quoteStatus?: TradeQuoteStatus;
  predictManagerObjectId?: string;
  testId?: string;
  walletActionPending?: boolean;
  walletConnected?: boolean;
  onAmountSet: (amount: number) => void;
  onDurationChange?: (duration: string) => void;
  onExpiryChange?: (expiryDate: string) => void;
  onMarketChange: (selection: TradeMarketSelection) => void;
  onSideChange: (side: TradeSide) => void;
  onWalletSubmit: () => void;
}) {
  const baseSelectedMarket =
    marketRows.find((market) => market.id === selectedMarketId) ??
    marketRows[0] ??
    null;
  const selectedMarket = baseSelectedMarket
    ? applyCustomStrikeToTradeMarket(baseSelectedMarket, customStrike, marketPriceLabel ?? "") ??
      baseSelectedMarket
    : null;
  const selectedSideSummary = selectedMarket
    ? selectedSide === "UP"
      ? selectedMarket.up
      : selectedMarket.down
    : null;
  const returnPreview = quote
    ? buildReturnPreviewFromQuote(quote)
    : buildReturnPreview(copyAmount, selectedSideSummary?.estimatedPrice);
  const selectedCustomStrike =
    selectedMarket && customStrike?.marketId === selectedMarket.id
      ? customStrike
      : selectedMarket
        ? buildTradeMarketSelectionFromRow(selectedMarket)
        : null;
  const selectedLadderKey =
    selectedMarket && selectedCustomStrike
      ? `${selectedMarket.pairLabel}:${selectedMarket.intervalLabel}:${selectedMarket.timeRemainingLabel}:${selectedCustomStrike.strikeLabel}`
      : null;
  const ladderRows = marketRows.reduce<
    Array<{
      key: string;
      market: TradeMarketLadderRow;
      selection: TradeMarketSelection;
    }>
  >((rows, baseMarket) => {
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
      const candidate = {
        key,
        market,
        selection,
      };
      const existingIndex = rows.findIndex((row) => row.key === key);

      if (existingIndex === -1) {
        rows.push(candidate);
      } else if (key === selectedLadderKey && baseMarket.id === baseSelectedMarket?.id) {
        rows[existingIndex] = candidate;
      }
    }

    return rows;
  }, []);
  const spotPrice = marketPriceLabel ? parseTradeStrikeInputValue(marketPriceLabel) : null;
  const spotLineIndex =
    spotPrice === null
      ? -1
      : ladderRows.findIndex((row) => row.selection.strike >= spotPrice);
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
          : walletActionPending
            ? "Sending..."
            : "Confirm transaction";

  return (
    <section className="trade-ticket" aria-label="Trade" data-testid={testId}>
      <div className="section-heading">
        <p>Trade</p>
        <span>{selectedMarket?.pairLabel ?? "BTC/USD"}</span>
      </div>
      {durationOptions.length ? (
        <MarketDurationToggle
          ariaLabel="Trade market duration"
          className="trade-duration-toggle"
          options={durationOptions}
          selectedDuration={selectedDuration}
          testIdPrefix="trade-duration"
          onDurationChange={onDurationChange}
        />
      ) : null}
      <TradeExpiryRail
        options={expiryOptions}
        selectedExpiryDate={selectedExpiryDate}
        onExpiryChange={onExpiryChange}
      />
      <div className="trade-ticket-panel">
        <div className="trade-ticket-title-row">
          <div className="trade-ticket-title">
            <p>Up/Down</p>
            <strong>BTC strike ladder</strong>
          </div>
          <span className="trade-duration-pill">
            {selectedMarket?.intervalLabel ?? "No markets"}
          </span>
        </div>

        <div className="trade-ticket-stats">
          <span>
            <small>{selectedMarket?.pairLabel ?? "BTC/USD"}</small>
            {marketPriceLabel ?? "Live market"}
          </span>
          <span>
            <small>Expiry</small>
            {selectedMarket?.expiryTimeLabel ?? "No active market"}
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
              const isSelectedStrike = key === selectedLadderKey;
              const isSelectedUp = isSelectedStrike && selectedSide === "UP";
              const isSelectedDown = isSelectedStrike && selectedSide === "DOWN";

              return (
                <div className="trade-ladder-row" key={key}>
                  {index === spotLineIndex ? (
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
                    <strong>{formatTradeSidePrice(market.up)}</strong>
                    <small>{formatTradeSidePayout(copyAmount, market.up)}</small>
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
                    <strong>{formatTradeSidePrice(market.down)}</strong>
                    <small>{formatTradeSidePayout(copyAmount, market.down)}</small>
                  </button>
                </div>
              );
            })
          ) : (
            <div className="trade-ladder-empty">No active markets</div>
          )}
        </div>

        {selectedMarket ? (
          <section className="trade-order-panel" aria-label="Selected position">
            <div className="trade-row-ticket-heading">
              <div>
                <span>Selected</span>
                <strong>
                  {selectedSide} {selectedMarket.strikeLabel}
                </strong>
                <small>{formatTradeOutcome(selectedSide, selectedMarket.strikeLabel)}</small>
              </div>
              <small>{selectedMarket.expiryTimeLabel}</small>
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
              {quoteStatus === "loading" ? (
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
              ) : quoteStatus === "error" ? (
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
              {tradeWalletButtonLabel}
            </button>
          </section>
        ) : (
          <button
            type="button"
            className="trade-wallet-button"
            data-testid="trade-wallet-submit"
            disabled
          >
            {tradeWalletButtonLabel}
          </button>
        )}
      </div>
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
  positions: PredictPortfolioPosition[];
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
          {positions.map((position) => {
            const isExpired =
              typeof nowMs === "number" ? position.expiryMs <= nowMs : position.isExpired;
            const statusLabel = isExpired ? "Expired" : position.statusLabel;
            const timeLabel =
              typeof nowMs === "number"
                ? formatPortfolioTimeRemaining(position.expiryMs, nowMs)
                : position.timeLabel;
            const statusParts =
              statusLabel === timeLabel ? [statusLabel] : [statusLabel, timeLabel];
            const statusSummary = [
              ...statusParts,
              !isExpired && position.closeValueStatusLabel ? position.closeValueStatusLabel : null,
              isExpired && position.outcomeLabel ? position.outcomeLabel : null,
            ]
              .filter((label): label is string => Boolean(label))
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
                <div className="portfolio-row-main">
                  <span className={position.direction === "UP" ? "portfolio-side-up" : "portfolio-side-down"}>
                    {position.direction}
                  </span>
                  <div>
                    <strong>BTC/USD {position.strikeLabel}</strong>
                    <small>{statusSummary}</small>
                  </div>
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
                <div className="portfolio-row-metrics">
                  <span>
                    <small>{isExpired ? "Claim value" : "Est. close"}</small>
                    {isExpired
                      ? position.claimValueLabel ?? (status === "loading" ? "Checking" : "Pending")
                      : position.closeValueLabel ?? (status === "loading" ? "Checking" : "Unavailable")}
                  </span>
                  <span>
                    <small>Cost</small>
                    {position.costBasisLabel}
                  </span>
                  <span>
                    <small>{isExpired ? "Settled BTC" : "Max payout"}</small>
                    {isExpired
                      ? position.settlementPriceLabel ?? "Pending"
                      : position.maxPayoutLabel}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : activeTab === "positions" ? (
        <div className="portfolio-empty">
          <strong>{emptyLabel}</strong>
          {emptyLabel === "No open positions" ? (
            <span>Live positions will appear here after you trade or copy a signal.</span>
          ) : null}
        </div>
      ) : historyItems.length ? (
        <div className="portfolio-history" data-testid="portfolio-history">
          <p className="portfolio-history-title">Trade history</p>
          {historyItems.map((item) => (
            <article
              className={`portfolio-history-row portfolio-history-row-${item.pnlTone}`}
              key={item.id}
            >
              <div className="portfolio-row-main">
                <span className={item.direction === "UP" ? "portfolio-side-up" : "portfolio-side-down"}>
                  {item.direction}
                </span>
                <div>
                  <strong>BTC/USD {item.strikeLabel}</strong>
                  <small>
                    {item.statusLabel} · Exp {item.expiryTimeLabel}
                  </small>
                </div>
                <div className={`portfolio-history-pnl portfolio-history-pnl-${item.pnlTone}`}>
                  <small>PNL</small>
                  <strong>{item.pnlLabel}</strong>
                </div>
              </div>
              <div className="portfolio-row-metrics portfolio-history-metrics">
                <span>
                  <small>Cost</small>
                  {item.costLabel}
                </span>
                <span>
                  <small>Payout</small>
                  {item.payoutLabel}
                </span>
                <span>
                  <small>Opened</small>
                  {item.openedAtLabel}
                </span>
                <span>
                  <small>Updated</small>
                  {item.updatedAtLabel}
                </span>
                <span>
                  <small>Remaining</small>
                  {item.remainingLabel}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="portfolio-empty">{historyEmptyLabel}</div>
      )}
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
  streakMode: WalletLeaderboardStreakMode,
): WalletLeaderboardBoardKey {
  if (board === "pnl") {
    return sortDirection === "best" ? "highestPnl" : "worstPnl";
  }

  if (streakMode === "current") {
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

function walletLeaderboardListLabel(
  board: WalletLeaderboardPanelBoardKey,
  sortDirection: WalletLeaderboardSortDirection,
  streakMode: WalletLeaderboardStreakMode,
): string {
  if (board === "pnl") {
    return sortDirection === "best" ? "Top PnL" : "Worst PnL";
  }

  const streakType = sortDirection === "best" ? "Win" : "Lose";
  return streakMode === "current"
    ? `Current ${streakType} Streaks`
    : `${streakType} Streaks`;
}

export function WalletLeaderboardsPanel({
  activeBoard,
  sortDirection = "best",
  streakMode = "allTime",
  snapshot,
  status = "ready",
  onBoardChange,
  onSortDirectionChange,
  onStreakModeChange,
}: {
  activeBoard: WalletLeaderboardPanelBoardKey;
  sortDirection?: WalletLeaderboardSortDirection;
  streakMode?: WalletLeaderboardStreakMode;
  snapshot: WalletLeaderboardsSnapshot;
  status?: WalletLeaderboardsStatus;
  onBoardChange: (board: WalletLeaderboardPanelBoardKey) => void;
  onSortDirectionChange?: (direction: WalletLeaderboardSortDirection) => void;
  onStreakModeChange?: (mode: WalletLeaderboardStreakMode) => void;
}) {
  const activeBoardDefinition =
    WALLET_LEADERBOARD_BOARDS.find((board) => board.key === activeBoard) ??
    WALLET_LEADERBOARD_BOARDS[0];
  const effectiveBoard = walletLeaderboardEffectiveBoard(
    activeBoardDefinition.key,
    sortDirection,
    streakMode,
  );
  const coreMetricLabel = walletLeaderboardMetricLabel(effectiveBoard);
  const entries = selectWalletLeaderboardEntries(snapshot, effectiveBoard);
  const isStreakBoard = activeBoardDefinition.key === "streaks";
  const listLabel = walletLeaderboardListLabel(
    activeBoardDefinition.key,
    sortDirection,
    streakMode,
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
      {isStreakBoard ? (
        <div className="wallet-leaderboard-streak-modes" aria-label="Streak range">
          <button
            type="button"
            aria-pressed={streakMode === "allTime"}
            data-testid="wallet-leaderboard-streak-mode-allTime"
            onClick={() => onStreakModeChange?.("allTime")}
          >
            All Time
          </button>
          <button
            type="button"
            aria-pressed={streakMode === "current"}
            data-testid="wallet-leaderboard-streak-mode-current"
            onClick={() => onStreakModeChange?.("current")}
          >
            Current
          </button>
        </div>
      ) : null}
      {entries.length ? (
        <div className="wallet-leaderboard-list">
          {entries.map((entry) => {
            const coreMetricValue = walletLeaderboardMetricValue(entry, effectiveBoard);
            const coreMetricTone = walletLeaderboardMetricTone(entry, effectiveBoard);

            return (
              <article
                className={`wallet-leaderboard-row wallet-leaderboard-row-${entry.totalPnlTone}`}
                data-testid="wallet-leaderboard-row"
                key={`${effectiveBoard}-${entry.wallet}-${entry.rank}`}
              >
                <div className="wallet-leaderboard-main">
                  <span className="wallet-leaderboard-rank">#{entry.rank}</span>
                  <div>
                    <strong>{entry.displayName}</strong>
                    <small>{listLabel}</small>
                  </div>
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
                    <small>Wins</small>
                    {entry.winCount}
                  </span>
                  <span>
                    <small>Losses</small>
                    {entry.lossCount}
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
                    {entry.lastSettledLabel}
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
  density = "expanded",
  selectedDuration = "all",
  showExpired,
  canShowMore,
  selectedRowId,
  copyAmount,
  durationOptions = [],
  showMoreLabel,
  testId = "market-heat-preview",
  onAmountSet,
  onDurationChange = () => undefined,
  onDensityChange = () => undefined,
  onShowExpiredChange,
  onShowMore,
  onSortModeChange,
  onWalletSubmit,
  onSelectRow,
  onCloseIntent,
}: {
  rows: MarketHeatPreviewRow[];
  sourceLabel: string;
  sortMode: MarketHeatSortMode;
  density?: MarketHeatDensity;
  selectedDuration?: string;
  showExpired: boolean;
  canShowMore: boolean;
  selectedRowId: string | null;
  copyAmount: number;
  durationOptions?: MarketDurationOption[];
  showMoreLabel: string;
  testId?: string;
  onAmountSet: (amount: number) => void;
  onDurationChange?: (duration: string) => void;
  onDensityChange?: (density: MarketHeatDensity) => void;
  onShowExpiredChange: (showExpired: boolean) => void;
  onShowMore: () => void;
  onSortModeChange: (sortMode: MarketHeatSortMode) => void;
  onWalletSubmit: (rowId: string) => void;
  onSelectRow: (rowId: string) => void;
  onCloseIntent: () => void;
}) {
  const swipeStartRef = useRef<{ rowId: string; x: number; y: number } | null>(null);
  const swipedRowRef = useRef<string | null>(null);
  const [swipePreview, setSwipePreview] = useState<MarketHeatSwipePreview | null>(null);
  const isCompact = density === "compact";
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

    if (deltaX <= 8 || Math.abs(deltaY) > MARKET_HEAT_SWIPE_VERTICAL_TOLERANCE) {
      setSwipePreview((current) => (current?.rowId === row.id ? null : current));
      return;
    }

    setSwipePreview({
      action: resolveMarketHeatSwipeAction(deltaX, deltaY, row.status),
      deltaX: Math.min(deltaX, MARKET_HEAT_SWIPE_MAX_OFFSET),
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

    if (action === "submit") {
      onWalletSubmit(row.id);
      return;
    }

    onSelectRow(row.id);
  };

  return (
    <section
      className={`market-heat-list market-heat-list-${density}`}
      aria-label="Alpha Feed"
      data-testid={testId}
    >
      <div className="section-heading market-heat-heading">
        <div className="market-heat-heading-title">
          <p
            aria-label={`Alpha Feed, ${sourceLabel} BTC markets`}
            title={`${sourceLabel} BTC markets`}
          >
            Alpha Feed
          </p>
        </div>
        <div className="market-heat-controls">
          {durationOptions.length ? (
            <div className="market-duration-toggle" aria-label="Market duration">
              <button
                type="button"
                aria-pressed={selectedDuration === "all"}
                data-testid="market-duration-all"
                onClick={() => onDurationChange("all")}
              >
                All
              </button>
              {durationOptions.map((option) => (
                <button
                  type="button"
                  aria-pressed={selectedDuration === option.value}
                  data-testid={`market-duration-${marketDurationTestId(option.value)}`}
                  key={option.value}
                  onClick={() => onDurationChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          <label className="market-heat-expired-toggle">
            <input
              type="checkbox"
              checked={showExpired}
              data-testid="market-heat-show-expired"
              onChange={(event) => onShowExpiredChange(event.currentTarget.checked)}
            />
            <span>Show expired</span>
          </label>
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
            </div>
            <div className="market-heat-density-toggle" aria-label="Feed row density">
              <button
                type="button"
                aria-pressed={density === "compact"}
                data-testid="market-heat-density-compact"
                onClick={() => onDensityChange("compact")}
              >
                Compact
              </button>
              <button
                type="button"
                aria-pressed={density === "expanded"}
                data-testid="market-heat-density-expanded"
                onClick={() => onDensityChange("expanded")}
              >
                Expanded
              </button>
            </div>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="market-heat-empty" data-testid="market-heat-empty">
          <strong>{showExpired ? "No positions for this filter" : "No live positions right now"}</strong>
          <span>
            {showExpired
              ? "Try another duration."
              : "Show expired to review recent testnet activity."}
          </span>
          {!showExpired ? (
            <button type="button" onClick={() => onShowExpiredChange(true)}>
              Show expired
            </button>
          ) : null}
        </div>
      ) : null}
      {rows.map((row) => {
        const isSelected = row.id === selectedRowId;
        const intentPanel = isSelected ? buildMarketHeatIntentPanel(row) : null;
        const sideClass = row.side.toLowerCase();
        const isWalletSubmitReady = row.status === "copy_ready";
        const swipePreviewForRow = swipePreview?.rowId === row.id ? swipePreview : null;
        const isSwipeConfirming = swipePreviewForRow?.action === "submit";
        const returnPreview = buildReturnPreview(copyAmount, estimatePriceFromRow(row));
        const intentPanelElement = intentPanel ? (
          <div
            className={`inline-watch-panel inline-watch-panel-${row.status}`}
            data-testid="market-heat-intent-panel"
          >
            <div className="inline-copy-header">
              <div className="inline-copy-summary market-heat-copy-summary">
                <strong>{intentPanel.title}</strong>
              </div>
              <button
                type="button"
                aria-label={`Cancel ${row.displayName} watch`}
                className="close-copy-button"
                data-testid="close-market-heat-intent"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseIntent();
                }}
              >
                {intentPanel.closeLabel}
              </button>
            </div>
            <div className="market-heat-intent-meta" aria-label={`${row.displayName} intent`}>
              <span>
                <small>Spend</small>
                {formatCopyAmount(copyAmount)}
              </span>
              {returnPreview ? (
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
              ) : null}
            </div>
            <div className="market-heat-intent-support">
              <span>{intentPanel.detailLabel}</span>
              <span>{row.expiryTimeLabel}</span>
            </div>
            <CopyAmountControls
              ariaLabel="Quick spend amounts"
              copyAmount={copyAmount}
              onAmountSet={onAmountSet}
              stopPropagation={true}
            />
            {isWalletSubmitReady ? (
              <div className="wallet-submit-row">
                <button
                  type="button"
                  className="wallet-submit-button"
                  data-testid="market-heat-wallet-submit"
                  onClick={(event) => {
                    event.stopPropagation();
                    onWalletSubmit(row.id);
                  }}
                >
                  Confirm transaction
                </button>
              </div>
            ) : null}
          </div>
        ) : null;

        return (
          <article
            aria-current={isSelected ? "true" : undefined}
            className={`market-heat-row market-heat-row-${density} market-heat-row-${row.status} market-heat-row-${sideClass} ${
              isSelected ? "market-heat-row-selected" : ""
            } ${swipePreviewForRow ? "market-heat-row-swiping" : ""} ${
              isSwipeConfirming ? "market-heat-row-swipe-confirming" : ""
            }`}
            data-testid="market-heat-row"
            key={row.id}
            onClick={() => {
              if (swipedRowRef.current === row.id) {
                swipedRowRef.current = null;
                return;
              }

              onSelectRow(row.id);
            }}
            onPointerCancel={() => {
              swipeStartRef.current = null;
            }}
            onPointerDown={
              isCompact ? (event) => startMarketHeatSwipe(row.id, event) : undefined
            }
            onPointerMove={
              isCompact ? (event) => updateMarketHeatSwipe(row, event) : undefined
            }
            onPointerUp={
              isCompact ? (event) => finishMarketHeatSwipe(row, event) : undefined
            }
          >
            {isCompact ? (
              <>
                {swipePreviewForRow ? (
                  <div className="market-heat-swipe-action" aria-hidden="true">
                    {isSwipeConfirming ? "Confirm" : "Open"}
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
                  <span className="market-heat-swipe-copy" aria-hidden="true">
                    →
                  </span>
                  <div className="wallet-avatar wallet-avatar-compact" aria-hidden="true">
                    {walletAvatarLabel(row.displayName)}
                  </div>
                  <div className="market-heat-compact-identity">
                    <strong>{row.displayName}</strong>
                    <span>{row.statusLabel}</span>
                  </div>
                  <strong className={`direction-pill direction-pill-${sideClass}`}>
                    {row.side}
                  </strong>
                  <div className="market-heat-compact-strike">
                    <strong>{row.strikeLabel.replace(/^Strike\s+/, "")}</strong>
                    <span>{row.intervalLabel}</span>
                  </div>
                  <div className="market-heat-compact-heat">
                    <small>Heat</small>
                    <strong>{row.heatScore}</strong>
                  </div>
                  <span className="market-heat-compact-hint">
                    {isSwipeConfirming ? "Release" : "Swipe"}
                  </span>
                </div>
                {intentPanelElement}
              </>
            ) : (
              <>
                <div className="market-heat-main">
                  <div className="wallet-avatar" aria-hidden="true">
                    {walletAvatarLabel(row.displayName)}
                  </div>
                  <div className="market-heat-identity">
                    <div className="trader-title-row">
                      <h2>{row.displayName}</h2>
                      <span>{row.statusLabel}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="market-heat-row-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRow(row.id);
                    }}
                  >
                    {row.actionLabel}
                  </button>
                </div>
                <div className="alpha-call-line">
                  <div>
                    <span>{row.strikeLabel}</span>
                    <strong className={`direction-pill direction-pill-${sideClass}`}>
                      {row.side}
                    </strong>
                  </div>
                  <span>{row.intervalLabel} market</span>
                </div>
                <div className="trader-row-metrics" aria-label={`${row.displayName} market stats`}>
                  <span>
                    <small>Cost</small>
                    {formatObservedBuyAmount(row)}
                  </span>
                  <span>
                    <small>Expiry</small>
                    {row.expiryTimeLabel}
                  </span>
                  <span>
                    <small>Heat</small>
                    {row.heatScore}
                  </span>
                </div>
                {intentPanelElement}
              </>
            )}
          </article>
        );
      })}
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

export function MarketHeader({
  walletControl,
}: {
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
  pnlLabel,
  pnlTitle = "All-time PNL",
  pnlTone,
  summary,
}: {
  availableLabel?: string | null;
  bankrollLabel?: string | null;
  depositAmount?: number;
  onDeposit?: () => void;
  onDepositAmountChange?: (amount: number) => void;
  pnlLabel?: string;
  pnlTitle?: string;
  pnlTone?: "positive" | "negative" | "flat";
  summary: ReturnType<typeof getReplayAccountSummary>;
}) {
  const visiblePnlLabel = pnlLabel ?? summary.pnl;
  const visiblePnlTone = pnlTone ?? summary.pnlTone;

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
          <span>Bankroll</span>
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
          <span>Available</span>
          <strong data-testid="available-wallet-balance">
            {availableLabel ?? summary.available}
          </strong>
        </div>
        <div>
          <span>Copy</span>
          <strong>{summary.copyValue}</strong>
        </div>
        <div>
          <span>Position</span>
          <strong>{summary.status}</strong>
        </div>
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
  const [replayState, setReplayState] = useState(() => createInitialReplayState(scenario));
  const realtimeApiBaseUrl = import.meta.env.VITE_HOT_HANDS_API_URL;
  const [activeView, setActiveView] = useState<AppView>(() =>
    readOnlyWalletAddress ? "portfolio" : "feed",
  );
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
  const [walletLeaderboardsState, setWalletLeaderboardsState] =
    useState<WalletLeaderboardsState>(() => ({
      snapshot: buildWalletLeaderboards(),
      status: "idle",
    }));
  const [activeWalletLeaderboard, setActiveWalletLeaderboard] =
    useState<WalletLeaderboardPanelBoardKey>("pnl");
  const [walletLeaderboardSortDirection, setWalletLeaderboardSortDirection] =
    useState<WalletLeaderboardSortDirection>("best");
  const [walletLeaderboardStreakMode, setWalletLeaderboardStreakMode] =
    useState<WalletLeaderboardStreakMode>("allTime");
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
  const previewMode = getInitialPreviewMode(realtimeApiBaseUrl);
  const [marketHeatPreview, setMarketHeatPreview] = useState<MarketHeatPreviewModel>(() =>
    buildMarketHeatPreview(),
  );
  const [oraclePriceChart, setOraclePriceChart] =
    useState<OraclePriceChart | null>(null);
  const [isOracleChartOpen, setIsOracleChartOpen] = useState(false);
  const [marketHeatSortMode, setMarketHeatSortMode] =
    useState<MarketHeatSortMode>("latest");
  const [marketHeatDensity, setMarketHeatDensity] =
    useState<MarketHeatDensity>("expanded");
  const [marketHeatShowExpired, setMarketHeatShowExpired] = useState(false);
  const [selectedMarketDuration, setSelectedMarketDuration] = useState("all");
  const [selectedTradeDuration, setSelectedTradeDuration] = useState("all");
  const [selectedTradeExpiryDate, setSelectedTradeExpiryDate] = useState<string | null>(null);
  const [marketHeatVisibleLimit, setMarketHeatVisibleLimit] =
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
  const copyState = replayState.copy;
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
  const activeMarketDuration =
    selectedMarketDuration !== "all" &&
    MARKET_DURATION_OPTIONS.some((option) => option.value === selectedMarketDuration)
      ? selectedMarketDuration
      : "all";
  const allVisibleMarketHeatRows = selectVisibleMarketHeatRows(marketHeatPreview.rows, {
    intervalLabel: null,
    limit: Number.MAX_SAFE_INTEGER,
    nowMs: marketHeatNowMs,
    showExpired: marketHeatShowExpired,
    sortMode: marketHeatSortMode,
  });
  const durationFilteredMarketHeatRows = selectMarketHeatRowsForDuration(
    allVisibleMarketHeatRows,
    activeMarketDuration,
  );
  const sortedMarketHeatRows = durationFilteredMarketHeatRows.slice(0, marketHeatVisibleLimit);
  const allTradeMarketRows = buildTradeMarketLadder(marketHeatPreview, {
    intervalLabel: null,
    nowMs: marketHeatNowMs,
  });
  const activeTradeDuration =
    selectedTradeDuration !== "all" &&
    MARKET_DURATION_OPTIONS.some((option) => option.value === selectedTradeDuration)
      ? selectedTradeDuration
      : "all";
  const tradeDurationMarketRows = selectTradeMarketsForDuration(
    allTradeMarketRows,
    activeTradeDuration,
  );
  const tradeExpiryOptions = buildTradeExpiryOptions(tradeDurationMarketRows, marketHeatNowMs);
  const activeTradeExpiryDate =
    selectedTradeExpiryDate &&
    tradeExpiryOptions.some((option) => option.value === selectedTradeExpiryDate)
      ? selectedTradeExpiryDate
      : tradeExpiryOptions[0]?.value ?? null;
  const tradeMarketRows = selectTradeMarketsForExpiry(
    tradeDurationMarketRows,
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
        marketHeatPreview.marketPrice.priceLabel,
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
  const tradeQuoteKey = selectedTradeMarket
    ? buildTradeQuoteKey(selectedTradeMarket, tradeSide, copyState.copyAmount)
    : null;
  const activeTradeQuote =
    tradeQuoteState.key === tradeQuoteKey ? tradeQuoteState.quote : null;
  const activeTradeQuoteStatus =
    tradeQuoteState.key === tradeQuoteKey ? tradeQuoteState.status : "idle";

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

  const marketHeatVisibleTotal = durationFilteredMarketHeatRows.length;
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

  useEffect(() => {
    if (connectedAccountAddress || wallets.length <= 1) {
      setIsWalletChooserOpen(false);
    }
  }, [connectedAccountAddress, wallets.length]);

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
  const visiblePortfolioHistory = isPredictPortfolioStateCurrent
    ? predictPortfolioState.history
    : [];
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
          useMainnetSuinsNames: true,
        });
        if (isCurrent) {
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

    const refreshTimer = window.setInterval(refreshMarketHeat, MARKET_HEAT_REFRESH_MS);

    return () => {
      isCurrent = false;
      window.clearInterval(refreshTimer);
    };
  }, [previewMode, realtimeApiBaseUrl]);

  useEffect(() => {
    if (activeView !== "leaderboards") {
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
      setOraclePriceChart(null);
      return undefined;
    }

    let isCurrent = true;
    setOraclePriceChart((chart) =>
      chart?.oracleId === activeChartOracleId ? chart : null,
    );

    const refreshOraclePriceChart = () => {
      void loadOraclePriceChart({
        apiBaseUrl: realtimeApiBaseUrl,
        oracleId: activeChartOracleId,
      }).then((chart) => {
        if (isCurrent) {
          setOraclePriceChart(chart);
        }
      });
    };

    refreshOraclePriceChart();
    const refreshTimer = window.setInterval(
      refreshOraclePriceChart,
      ORACLE_PRICE_CHART_REFRESH_MS,
    );

    return () => {
      isCurrent = false;
      window.clearInterval(refreshTimer);
    };
  }, [activeChartOracleId, realtimeApiBaseUrl]);

  useEffect(() => {
    if (
      activeView !== "trade" ||
      previewMode !== "market" ||
      !realtimeApiBaseUrl ||
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
    tradeSide,
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

  const handleMarketHeatSelect = (rowId: string) => {
    setMarketHeatIntent((state) =>
      selectMarketHeatIntent(state, rowId, marketHeatPreview.rows),
    );
  };

  const handleMarketHeatClose = () => {
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
  };
  const handleMarketHeatWalletSubmit = async (rowId: string) => {
    setMarketHeatIntent((state) =>
      selectMarketHeatIntent(state, rowId, marketHeatPreview.rows),
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

    setWalletTxState({
      status: "pending",
      label: "Preparing copy quote...",
      digest: null,
    });

    try {
      const quote = await loadTradeQuote({
        apiBaseUrl: realtimeApiBaseUrl,
        market: copyTrade.market,
        side: copyTrade.row.side,
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
        label: "Sending copy to wallet...",
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
        label: "Copy transaction sent.",
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
  const handleMarketHeatSortModeChange = (sortMode: MarketHeatSortMode) => {
    setMarketHeatSortMode(sortMode);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
  };
  const handleMarketDurationChange = (duration: string) => {
    setSelectedMarketDuration(duration);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
  };
  const handleTradeDurationChange = (duration: string) => {
    setSelectedTradeDuration(duration);
    setSelectedTradeExpiryDate(null);
  };
  const handleTradeExpiryChange = (expiryDate: string) => {
    setSelectedTradeExpiryDate(expiryDate);
    const nextMarket = tradeDurationMarketRows.find(
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
  const handleDepositAmountChange = (amount: number) => {
    setDepositAmount(clampDepositAmount(amount));
  };
  const handleTradeSideChange = (side: TradeSide) => {
    setTradeSide(side);
  };
  const handleTradeMarketChange = (selection: TradeMarketSelection) => {
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

  const renderMarketHeatPreview = (testId = "market-heat-preview") => (
    <MarketHeatPreview
      rows={sortedMarketHeatRows}
      sourceLabel={marketHeatPreview.sourceLabel}
      sortMode={marketHeatSortMode}
      density={marketHeatDensity}
      selectedDuration={activeMarketDuration}
      durationOptions={MARKET_DURATION_OPTIONS}
      showExpired={marketHeatShowExpired}
      canShowMore={marketHeatRemainingCount > 0}
      selectedRowId={marketHeatIntent.selectedRowId}
      copyAmount={copyState.copyAmount}
      showMoreLabel={marketHeatShowMoreLabel}
      testId={testId}
      onAmountSet={handleAmountSet}
      onDensityChange={setMarketHeatDensity}
      onDurationChange={handleMarketDurationChange}
      onShowExpiredChange={handleMarketHeatShowExpiredChange}
      onShowMore={handleMarketHeatShowMore}
      onSortModeChange={handleMarketHeatSortModeChange}
      onWalletSubmit={handleMarketHeatWalletSubmit}
      onSelectRow={handleMarketHeatSelect}
      onCloseIntent={handleMarketHeatClose}
    />
  );

  const renderTradeTicket = (testId = "trade-view") => (
    <TradeTicket
      customStrike={selectedTradeCustomStrike}
      copyAmount={copyState.copyAmount}
      expiryOptions={tradeExpiryOptions}
      marketPriceLabel={marketHeatPreview.marketPrice.priceLabel}
      marketRows={displayedTradeMarketRows}
      selectedExpiryDate={activeTradeExpiryDate}
      selectedMarketId={baseSelectedTradeMarket?.id ?? ""}
      selectedDuration={activeTradeDuration}
      selectedSide={tradeSide}
      durationOptions={MARKET_DURATION_OPTIONS}
      quote={activeTradeQuote}
      quoteStatus={activeTradeQuoteStatus}
      predictManagerObjectId={activePredictManagerObjectId}
      testId={testId}
      walletActionPending={isWalletActionPending}
      walletConnected={Boolean(currentAccount)}
      onAmountSet={handleAmountSet}
      onDurationChange={handleTradeDurationChange}
      onExpiryChange={handleTradeExpiryChange}
      onMarketChange={handleTradeMarketChange}
      onSideChange={handleTradeSideChange}
      onWalletSubmit={handleTradeWalletSubmit}
    />
  );

  return (
    <main className="app-shell" data-testid="app-shell">
      <section
        className={`phone-frame phone-frame-${activeView}`}
        aria-label="Hot Hands market shell"
      >
        <div className="app-scroll" data-testid="app-scroll">
          <MarketHeader
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
              pnlLabel={visiblePortfolioPnl.pnlLabel}
              pnlTone={visiblePortfolioPnl.pnlTone}
              summary={accountSummary}
            />
          ) : null}
          {activeView === "feed" ? (
            renderMarketHeatPreview()
          ) : activeView === "trade" ? (
            renderTradeTicket()
          ) : activeView === "leaderboards" ? (
            <WalletLeaderboardsPanel
              activeBoard={activeWalletLeaderboard}
              sortDirection={walletLeaderboardSortDirection}
              streakMode={walletLeaderboardStreakMode}
              snapshot={walletLeaderboardsState.snapshot}
              status={walletLeaderboardsState.status}
              onBoardChange={setActiveWalletLeaderboard}
              onSortDirectionChange={setWalletLeaderboardSortDirection}
              onStreakModeChange={setWalletLeaderboardStreakMode}
            />
          ) : (
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
              positions={visiblePortfolioPositions}
              status={visiblePortfolioStatus}
              walletActionPending={isWalletActionPending}
              walletSubmittedPositionId={portfolioWalletSubmitPositionId}
              onDismissPosition={handleDismissPortfolioPosition}
              onPositionAction={handlePortfolioPositionAction}
            />
          )}
        </div>
        {isOracleChartOpen ? (
          <OraclePriceChartModal
            chart={oraclePriceChart}
            onClose={() => setIsOracleChartOpen(false)}
          >
            {renderTradeTicket("expanded-chart-trade-ticket")}
            {renderMarketHeatPreview("expanded-chart-market-heat-preview")}
          </OraclePriceChartModal>
        ) : null}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <BottomNav activeView={activeView} onViewChange={setActiveView} />
      </section>
    </main>
  );
}
