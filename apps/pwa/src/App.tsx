import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import {
  useCurrentClient,
  useCurrentAccount,
  useCurrentNetwork,
  useCurrentWallet,
  useDAppKit,
  useWalletConnection,
  useWallets,
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
  buildMarketDurationOptions,
  buildTradeMarketForMarketHeatRow,
  buildTradeMarketLadder,
  closeMarketHeatIntent,
  loadTradeQuote,
  loadMarketHeatPreview,
  selectMarketHeatIntent,
  selectVisibleMarketHeatRows,
  type MarketHeatIntentState,
  type MarketHeatPrice,
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
const MARKET_HEAT_REFRESH_MS = 10_000;
const ORACLE_PRICE_CHART_REFRESH_MS = 1_000;
const MARKET_HEAT_PAGE_SIZE = 8;
const PORTFOLIO_DATA_REFRESH_MS = 15_000;
const PORTFOLIO_TIME_REFRESH_MS = 15_000;
const DEPOSIT_AMOUNT_DEFAULT = 25;
const DEPOSIT_AMOUNT_MIN = 0.01;
const TOAST_LIMIT = 3;
const TOAST_TIMEOUT_MS = 4_500;
type PreviewMode = "replay" | "market";
export type AppView = "feed" | "trade" | "portfolio";
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

export function WalletStatusBar({
  accountAddress,
  connectionStatus,
  networkLabel,
  predictManagerObjectId,
  predictManagerStatus,
  txState,
  walletCount,
  walletName,
  onConnect,
  onCreatePredictManager,
  onDisconnect,
}: {
  accountAddress: string | null;
  connectionStatus: string;
  networkLabel: string;
  predictManagerObjectId: string | null;
  predictManagerStatus: PredictManagerStatus;
  txState: WalletTransactionState;
  walletCount: number;
  walletName: string | null;
  onConnect: () => void;
  onCreatePredictManager: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = Boolean(accountAddress);
  const connectLabel =
    walletCount === 0
      ? "Install wallet"
      : connectionStatus === "connecting" || connectionStatus === "reconnecting"
        ? "Connecting"
        : "Connect wallet";

  return (
    <section className="wallet-status-bar" aria-label="Wallet" data-testid="wallet-status">
      <div className="wallet-status-main">
        <small>{networkLabel}</small>
        <strong data-testid="wallet-address">
          {isConnected ? formatWalletAddress(accountAddress) : "Wallet disconnected"}
        </strong>
        <span>{isConnected ? walletName ?? "Sui wallet" : `${walletCount} wallets found`}</span>
      </div>
      <div className="wallet-status-actions">
        {isConnected ? (
          <button type="button" data-testid="wallet-disconnect" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            data-testid="wallet-connect"
            disabled={walletCount === 0 || connectionStatus === "connecting"}
            onClick={onConnect}
          >
            {connectLabel}
          </button>
        )}
      </div>
      {isConnected ? (
        <div
          className={`predict-manager-status predict-manager-status-${predictManagerStatus}`}
          aria-live="polite"
        >
          <span data-testid="predict-manager-status">
            {predictManagerStatus === "checking"
              ? "Checking Predict account..."
              : predictManagerStatus === "ready"
                ? `Predict account ${formatWalletAddress(predictManagerObjectId)}`
                : predictManagerStatus === "error"
                  ? "Could not check Predict account"
                  : "No Predict account yet"}
          </span>
          {predictManagerStatus === "missing" || predictManagerStatus === "error" ? (
            <button
              type="button"
              data-testid="create-predict-manager"
              disabled={txState.status === "pending"}
              onClick={onCreatePredictManager}
            >
              {txState.status === "pending" ? "Sending..." : "Create Predict account"}
            </button>
          ) : null}
        </div>
      ) : null}
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

export function TradeTicket({
  customStrike = null,
  copyAmount,
  marketRows,
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
  onMarketChange,
  onSideChange,
  onStrikeChange = () => undefined,
  onWalletSubmit,
}: {
  customStrike?: TradeMarketSelection | null;
  copyAmount: number;
  marketRows: TradeMarketLadderRow[];
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
  onMarketChange: (selection: TradeMarketSelection) => void;
  onSideChange: (side: TradeSide) => void;
  onStrikeChange?: (selection: TradeMarketSelection) => void;
  onWalletSubmit: () => void;
}) {
  const baseSelectedMarket =
    marketRows.find((market) => market.id === selectedMarketId) ??
    marketRows[0] ??
    null;
  const selectedMarket = baseSelectedMarket
    ? applyCustomStrikeToTradeMarket(baseSelectedMarket, customStrike, "") ??
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
  const hasPredictManagerObjectId = predictManagerObjectId.trim().length > 0;
  const canSubmitTrade =
    walletConnected &&
    hasPredictManagerObjectId &&
    quoteStatus === "ready" &&
    Boolean(quote) &&
    !walletActionPending;
  const tradeWalletButtonLabel = !walletConnected
    ? "Connect wallet first"
    : !hasPredictManagerObjectId
      ? "Create Predict account first"
      : quoteStatus === "loading"
        ? "Wait for quote"
        : walletActionPending
          ? "Sending..."
          : "Send to wallet";

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
      <div className="trade-ticket-panel">
        <div className="trade-ticket-title">
          <p>Make a BTC prediction</p>
          <strong>
            {selectedMarket
              ? `${selectedSide} / ${selectedMarket.timeRemainingLabel}`
              : `${selectedSide} / No active market`}
          </strong>
        </div>
        <div className="trade-market-ladder" aria-label="Pick a market">
          <div className="trade-ladder-heading">
            <span>Pick a market</span>
            <small>Live Predict</small>
          </div>
          {marketRows.length ? marketRows.map((baseMarket) => {
            const market =
              applyCustomStrikeToTradeMarket(baseMarket, customStrike, "") ??
              baseMarket;

            return (
              <div className="trade-market-item" key={baseMarket.id}>
                <button
                  type="button"
                  className="trade-market-row"
                  aria-pressed={selectedMarket?.id === market.id}
                  onClick={() => onMarketChange(buildTradeMarketSelectionFromRow(market))}
                >
                  <span className="trade-market-main">
                    <strong>{market.timeRemainingLabel}</strong>
                    <small>{market.roundLabel}</small>
                  </span>
                  <span className="trade-market-strike">
                    <strong>{market.strikeLabel}</strong>
                    <small>{market.moneynessLabel}</small>
                  </span>
                  <span className="trade-market-flow">
                    <strong>{market.activityLabel}</strong>
                    <small>
                      UP {market.up.walletCount}{" "}
                      {market.up.walletCount === 1 ? "wallet" : "wallets"} · DOWN{" "}
                      {market.down.walletCount}{" "}
                      {market.down.walletCount === 1 ? "wallet" : "wallets"}
                    </small>
                  </span>
                </button>
                {selectedMarket?.id === market.id ? (
                  <div className="trade-row-ticket" data-testid="trade-row-ticket">
                    <div className="trade-row-ticket-heading">
                      <strong>Trade this market</strong>
                      <small>{selectedSide} · {market.expiryTimeLabel}</small>
                    </div>
                    <div className="trade-side-toggle" aria-label="Direction">
                      <button
                        type="button"
                        className={selectedSide === "UP" ? "trade-side-up selected" : "trade-side-up"}
                        aria-pressed={selectedSide === "UP"}
                        onClick={() => onSideChange("UP")}
                      >
                        UP
                      </button>
                      <button
                        type="button"
                        className={selectedSide === "DOWN" ? "trade-side-down selected" : "trade-side-down"}
                        aria-pressed={selectedSide === "DOWN"}
                        onClick={() => onSideChange("DOWN")}
                      >
                        DOWN
                      </button>
                    </div>
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
                      <span>
                        <small>Strike</small>
                        {market.strikeLabel}
                      </span>
                      <span>
                        <small>Expiry</small>
                        {market.expiryTimeLabel}
                      </span>
                    </div>
                    <label className="trade-strike-select">
                      <span>Strike</span>
                      <select
                        aria-label="Strike"
                        data-testid="trade-strike-select"
                        value={String(selectedCustomStrike?.strikeRaw ?? market.strikeRaw)}
                        onChange={(event) => {
                          const selectedOption = getTradeStrikeOptions(market).find(
                            (option) => String(option.strikeRaw) === event.currentTarget.value,
                          );
                          if (selectedOption) {
                            onStrikeChange(buildTradeMarketSelection(market.id, selectedOption));
                          }
                        }}
                      >
                        {getTradeStrikeOptions(market).map((option) => (
                          <option key={option.strikeRaw} value={option.strikeRaw}>
                            {option.strikeLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <CopyAmountControls
                      ariaLabel="Trade spend amounts"
                      copyAmount={copyAmount}
                      onAmountSet={onAmountSet}
                    />
                    <button
                      type="button"
                      className="trade-wallet-button"
                      data-testid="trade-wallet-submit"
                      disabled={!canSubmitTrade}
                      onClick={onWalletSubmit}
                    >
                      {tradeWalletButtonLabel}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          }) : (
            <button type="button" className="trade-market-row" aria-pressed="false" disabled>
              No active markets
            </button>
          )}
        </div>
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
              ? `${positions.length} active`
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
                <button
                  type="button"
                  className="portfolio-action-button"
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
              </article>
            );
          })}
        </div>
      ) : activeTab === "positions" ? (
        <div className="portfolio-empty">{emptyLabel}</div>
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
                  <small>PNL</small>
                  {item.pnlLabel}
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

export function MarketHeatPreview({
  rows,
  sourceLabel,
  sortMode,
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
  onShowExpiredChange: (showExpired: boolean) => void;
  onShowMore: () => void;
  onSortModeChange: (sortMode: MarketHeatSortMode) => void;
  onWalletSubmit: (rowId: string) => void;
  onSelectRow: (rowId: string) => void;
  onCloseIntent: () => void;
}) {
  return (
    <section className="market-heat-list" aria-label="Alpha Feed" data-testid={testId}>
      <div className="section-heading market-heat-heading">
        <div className="market-heat-heading-title">
          <p>Alpha Feed</p>
          <span>{sourceLabel} BTC markets</span>
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
        </div>
      </div>
      {rows.map((row) => {
        const isSelected = row.id === selectedRowId;
        const intentPanel = isSelected ? buildMarketHeatIntentPanel(row) : null;
        const sideClass = row.side.toLowerCase();
        const isWalletSubmitReady = row.status === "copy_ready";
        const returnPreview = buildReturnPreview(copyAmount, estimatePriceFromRow(row));

        return (
          <article
            aria-current={isSelected ? "true" : undefined}
            className={`market-heat-row market-heat-row-${row.status} market-heat-row-${sideClass} ${
              isSelected ? "market-heat-row-selected" : ""
            }`}
            data-testid="market-heat-row"
            key={row.id}
            onClick={() => onSelectRow(row.id)}
          >
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
                <strong className={`direction-pill direction-pill-${sideClass}`}>{row.side}</strong>
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
            {intentPanel ? (
              <div
                className={`inline-watch-panel inline-watch-panel-${row.status}`}
                data-testid="market-heat-intent-panel"
              >
                <div className="inline-copy-header">
                  <div className="inline-copy-summary">
                    <p>{intentPanel.title}</p>
                    <strong>{intentPanel.actionLabel}</strong>
                    <span>{intentPanel.signatureLabel}</span>
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
                  <span>
                    <small>Signal</small>
                    {intentPanel.detailLabel}
                  </span>
                  <span>
                    <small>Expiry</small>
                    {row.expiryTimeLabel}
                  </span>
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
                      Send to wallet
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
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

function MarketHeader({
  price,
}: {
  price: MarketHeatPrice;
}) {
  return (
    <header className="market-strip" data-testid="market-header">
      <div className="market-live">
        <span aria-hidden="true" />
        <div>
          <h1>Hot Hands</h1>
        </div>
      </div>
      <div className="market-price">
        <span>{price.marketLabel}</span>
        <em>{price.statusLabel}</em>
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
  const [scenario, setScenario] = useState(() => createReplayScenario("opening-night"));
  const [replayState, setReplayState] = useState(() => createInitialReplayState(scenario));
  const realtimeApiBaseUrl = import.meta.env.VITE_HOT_HANDS_API_URL;
  const [activeView, setActiveView] = useState<AppView>("feed");
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
  const [marketHeatShowExpired, setMarketHeatShowExpired] = useState(false);
  const [selectedMarketDuration, setSelectedMarketDuration] = useState("all");
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
  const marketDurationOptions = buildMarketDurationOptions(marketHeatPreview, {
    nowMs: marketHeatNowMs,
  });
  const activeMarketDuration =
    selectedMarketDuration !== "all" &&
    marketDurationOptions.some((option) => option.value === selectedMarketDuration)
      ? selectedMarketDuration
      : "all";
  const activeMarketIntervalLabel =
    activeMarketDuration === "all" ? null : activeMarketDuration;
  const sortedMarketHeatRows = selectVisibleMarketHeatRows(marketHeatPreview.rows, {
    intervalLabel: activeMarketIntervalLabel,
    limit: marketHeatVisibleLimit,
    nowMs: marketHeatNowMs,
    showExpired: marketHeatShowExpired,
    sortMode: marketHeatSortMode,
  });
  const tradeMarketRows = buildTradeMarketLadder(marketHeatPreview, {
    intervalLabel: activeMarketIntervalLabel,
    nowMs: marketHeatNowMs,
  });
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
    ? [
        selectedTradeMarket.id,
        selectedTradeMarket.oracleId,
        selectedTradeMarket.expiry,
        selectedTradeMarket.strikeRaw,
        tradeSide,
        copyState.copyAmount,
      ].join(":")
    : null;
  const activeTradeQuote =
    tradeQuoteState.key === tradeQuoteKey ? tradeQuoteState.quote : null;
  const activeTradeQuoteStatus =
    tradeQuoteState.key === tradeQuoteKey ? tradeQuoteState.status : "idle";
  const marketHeatVisibleTotal = selectVisibleMarketHeatRows(marketHeatPreview.rows, {
    intervalLabel: activeMarketIntervalLabel,
    limit: Number.MAX_SAFE_INTEGER,
    nowMs: marketHeatNowMs,
    showExpired: marketHeatShowExpired,
    sortMode: marketHeatSortMode,
  }).length;
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
  const connectedAccountAddress = currentAccount?.address ?? null;
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
        const preview = await loadMarketHeatPreview({ apiBaseUrl: realtimeApiBaseUrl });
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
    selectedTradeMarket?.up.estimatedPrice,
    selectedTradeMarket?.down.estimatedPrice,
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
    setCustomTradeStrikes((state) => {
      if (state[selection.marketId]) {
        return state;
      }

      return {
        ...state,
        [selection.marketId]: selection,
      };
    });
  };
  const handleTradeStrikeChange = (selection: TradeMarketSelection) => {
    setSelectedTradeMarketId(selection.marketId);
    setCustomTradeStrikes((state) => ({
      ...state,
      [selection.marketId]: selection,
    }));
  };
  const handleWalletConnect = async () => {
    const wallet = wallets[0];
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
      selectedDuration={activeMarketDuration}
      durationOptions={marketDurationOptions}
      showExpired={marketHeatShowExpired}
      canShowMore={marketHeatRemainingCount > 0}
      selectedRowId={marketHeatIntent.selectedRowId}
      copyAmount={copyState.copyAmount}
      showMoreLabel={marketHeatShowMoreLabel}
      testId={testId}
      onAmountSet={handleAmountSet}
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
      durationOptions={marketDurationOptions}
      marketRows={displayedTradeMarketRows}
      selectedMarketId={baseSelectedTradeMarket?.id ?? ""}
      selectedDuration={activeMarketDuration}
      selectedSide={tradeSide}
      quote={activeTradeQuote}
      quoteStatus={activeTradeQuoteStatus}
      predictManagerObjectId={activePredictManagerObjectId}
      testId={testId}
      walletActionPending={isWalletActionPending}
      walletConnected={Boolean(currentAccount)}
      onAmountSet={handleAmountSet}
      onDurationChange={handleMarketDurationChange}
      onMarketChange={handleTradeMarketChange}
      onSideChange={handleTradeSideChange}
      onStrikeChange={handleTradeStrikeChange}
      onWalletSubmit={handleTradeWalletSubmit}
    />
  );

  return (
    <main className="app-shell" data-testid="app-shell">
      <section className="phone-frame" aria-label="Hot Hands market shell">
        <div className="app-scroll" data-testid="app-scroll">
          <MarketHeader price={marketHeatPreview.marketPrice} />
          <WalletStatusBar
            accountAddress={currentAccount?.address ?? null}
            connectionStatus={walletConnection.status}
            networkLabel={String(currentNetwork)}
            predictManagerObjectId={visiblePredictManagerObjectId}
            predictManagerStatus={visiblePredictManagerStatus}
            txState={walletTxState}
            walletCount={wallets.length}
            walletName={currentWallet?.name ?? null}
            onConnect={handleWalletConnect}
            onCreatePredictManager={handleCreatePredictManager}
            onDisconnect={handleWalletDisconnect}
          />
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
          <OraclePriceChartCard
            chart={oraclePriceChart}
            fallbackPriceLabel={marketHeatPreview.marketPrice.priceLabel}
            onOpen={() => setIsOracleChartOpen(true)}
          />
          {activeView === "feed" ? (
            renderMarketHeatPreview()
          ) : activeView === "trade" ? (
            renderTradeTicket()
          ) : (
            <PortfolioPanel
              emptyLabel={
                currentAccount
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
