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
import { buildCreatePredictManagerTransaction } from "@hot-hands/contracts";
import {
  COPY_AMOUNT_MAX,
  COPY_AMOUNT_MIN,
  formatCopyAmount,
  getSelectedTrader,
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
  REPLAY_SCENARIOS,
  resetReplay,
  selectReplayScenario,
  setReplayPlaying,
  updateReplayCopy,
  type ReplayScenarioId,
} from "./replayModel";
import { produceRealtimeActivityTraceById } from "@hot-hands/demo-runner";
import {
  createInitialRealtimeActivityState,
} from "./realtimeActivityModel";
import { applyRealtimeActivityServerMessageJson } from "./realtimeActivityStreamClient";
import {
  createLiveActivityMode,
  createReplayLiveActivitySnapshot,
  type LiveActivityModeController,
  type LiveActivityModeSnapshot,
  type LiveActivityModeStatus,
} from "./liveActivityMode";
import {
  buildMarketHeatIntentPanel,
  buildMarketHeatPreview,
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
  type TradeQuote,
  type TradeMarketLadderRow,
  type TradeStrikeOption,
} from "./marketHeatModel";
import { buildTradeMintTransaction } from "./walletTransactions";
import { loadDusdcBalanceLabel } from "./walletBalance";
import { findPredictManagerForOwner } from "./predictManager";

const quickAmounts = [10, 25, 50, COPY_AMOUNT_MAX];
const MARKET_HEAT_REFRESH_MS = 10_000;
const MARKET_HEAT_PAGE_SIZE = 8;
type PreviewMode = "replay" | "market";
export type AppView = "feed" | "trade";
export type TradeSide = "UP" | "DOWN";
export type TradeMarketSelection = {
  marketId: string;
  strike: number;
  strikeLabel: string;
  strikeRaw: number;
};
type TradeQuoteStatus = "idle" | "loading" | "ready" | "error";
type WalletTransactionStatus = "idle" | "pending" | "success" | "error";
type WalletTransactionState = {
  status: WalletTransactionStatus;
  label: string;
  digest: string | null;
};
type DusdcBalanceState = {
  accountAddress: string | null;
  refreshKey: number;
  status: "idle" | "loading" | "ready" | "error";
  label: string | null;
};
type PredictManagerStatus = "idle" | "checking" | "ready" | "missing" | "error";
type PredictManagerState = {
  accountAddress: string | null;
  objectId: string | null;
  refreshKey: number;
  status: PredictManagerStatus;
};

const idleWalletTransactionState: WalletTransactionState = {
  status: "idle",
  label: "Wallet ready",
  digest: null,
};
const PREDICT_MANAGER_STORAGE_KEY = "hot-hands-predict-manager-id";

export function getInitialPreviewMode(apiBaseUrl: string | undefined): PreviewMode {
  return apiBaseUrl ? "market" : "replay";
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
      {txState.status !== "idle" ? (
        <div className={`wallet-tx-status wallet-tx-status-${txState.status}`} aria-live="polite">
          <span data-testid="wallet-tx-status">{txState.label}</span>
          {txState.digest ? (
            <small data-testid="wallet-tx-digest">{formatWalletAddress(txState.digest)}</small>
          ) : null}
        </div>
      ) : null}
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
    </nav>
  );
}

export function TradeTicket({
  customStrike = null,
  copyAmount,
  marketRows,
  selectedMarketId,
  selectedSide,
  quote = null,
  quoteStatus = "idle",
  predictManagerObjectId = "",
  walletActionPending = false,
  walletConnected = false,
  walletStatusLabel = null,
  walletSubmitted = false,
  onAmountSet,
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
  quote?: TradeQuote | null;
  quoteStatus?: TradeQuoteStatus;
  predictManagerObjectId?: string;
  walletActionPending?: boolean;
  walletConnected?: boolean;
  walletStatusLabel?: string | null;
  walletSubmitted?: boolean;
  onAmountSet: (amount: number) => void;
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
    <section className="trade-ticket" aria-label="Trade" data-testid="trade-view">
      <div className="section-heading">
        <p>Trade</p>
        <span>{selectedMarket?.pairLabel ?? "BTC/USD"}</span>
      </div>
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
                    {walletSubmitted ? (
                      <span className="trade-wallet-status" aria-live="polite">
                        {walletStatusLabel ?? "Wallet request started"}
                      </span>
                    ) : null}
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

function ReplayControls({
  isPlaying,
  scenarioId,
  onReplayToggle,
  onReplayNext,
  onReplayReset,
  onScenarioChange,
}: {
  isPlaying: boolean;
  scenarioId: ReplayScenarioId;
  onReplayToggle: () => void;
  onReplayNext: () => void;
  onReplayReset: () => void;
  onScenarioChange: (scenarioId: ReplayScenarioId) => void;
}) {
  return (
    <div className="demo-controls" aria-label="Demo controls">
      <select
        aria-label="Demo scenario"
        data-testid="scenario-selector"
        value={scenarioId}
        onChange={(event) => onScenarioChange(event.currentTarget.value as ReplayScenarioId)}
      >
        {REPLAY_SCENARIOS.map((availableScenario) => (
          <option key={availableScenario.id} value={availableScenario.id}>
            {availableScenario.title}
          </option>
        ))}
      </select>
      <div className="demo-buttons" aria-label="Replay controls">
        <button type="button" onClick={onReplayToggle}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" data-testid="replay-next" onClick={onReplayNext}>
          Next
        </button>
        <button type="button" data-testid="replay-reset" onClick={onReplayReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

function SpectatorRail({
  spectatorCount,
  activity,
  activitySource,
  activityStatus,
  activityStatusLabel,
}: {
  spectatorCount: number;
  activity: string[];
  activitySource?: string;
  activityStatus: LiveActivityModeStatus;
  activityStatusLabel: string;
}) {
  const latestActivity = activity[0] ?? "Waiting for live BTC activity";

  return (
    <section
      className="spectator-rail"
      aria-label="Live testnet activity"
      data-source={activitySource}
      data-status={activityStatus}
      data-testid="spectator-rail"
    >
      <div className="spectator-copy">
        <span>Live status</span>
        <strong>{spectatorCount.toLocaleString()}</strong>
        <span>
          wallets watched /{" "}
          <span
            className="activity-source-status"
            data-testid="activity-connection-status"
            role="status"
          >
            {activityStatusLabel}
          </span>
        </span>
      </div>
      <div className="activity-ticker" aria-label="Market activity">
        <span>{latestActivity}</span>
      </div>
    </section>
  );
}

function ModeSwitch({
  mode,
  onModeChange,
}: {
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
}) {
  return (
    <div className="mode-switch" aria-label="Preview mode">
      <button
        type="button"
        aria-pressed={mode === "replay"}
        onClick={() => onModeChange("replay")}
      >
        Demo
      </button>
      <button
        type="button"
        aria-pressed={mode === "market"}
        data-testid="market-heat-mode"
        onClick={() => onModeChange("market")}
      >
        Testnet
      </button>
    </div>
  );
}

function ActiveSignalStrip({
  frame,
  receiptState,
  copyAmount,
  isPlaying,
  scenarioId,
  mode,
  onReplayToggle,
  onReplayNext,
  onReplayReset,
  onScenarioChange,
  onModeChange,
  marketHeatSourceLabel,
}: {
  frame: ReturnType<typeof getReplayFrame>;
  receiptState: string;
  copyAmount: number;
  isPlaying: boolean;
  scenarioId: ReplayScenarioId;
  mode: PreviewMode;
  onReplayToggle: () => void;
  onReplayNext: () => void;
  onReplayReset: () => void;
  onScenarioChange: (scenarioId: ReplayScenarioId) => void;
  onModeChange: (mode: PreviewMode) => void;
  marketHeatSourceLabel: string;
}) {
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  return (
    <section
      className={`active-signal-strip active-signal-strip-${frame.phase}`}
      aria-label="Active signal"
      data-testid="active-signal-strip"
    >
      <div className="signal-strip-top">
        <div>
          <p>{mode === "market" ? "Testnet Alpha" : frame.status}</p>
          <strong>
            {mode === "market"
              ? "Live Predict wallets"
              : frame.latestSignal}
          </strong>
        </div>
        <span>
          {mode === "market"
            ? "User signs every copy"
            : receiptState === "Disarmed"
            ? `Ready / ${formatCopyAmount(copyAmount)}`
            : `${receiptState} / ${formatCopyAmount(copyAmount)}`}
        </span>
        <button
          type="button"
          className="demo-toggle"
          aria-expanded={isDemoOpen}
          onClick={() => setIsDemoOpen((isOpen) => !isOpen)}
        >
          Tools
        </button>
      </div>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
      <div className="signal-strip-leader">
        <div>
          <strong>
            {mode === "market"
              ? "Observed BTC UP/DOWN mints"
              : frame.latestSignal}
          </strong>
        </div>
        <span>{mode === "market" ? marketHeatSourceLabel : frame.stepLabel}</span>
      </div>
      {isDemoOpen ? (
        <ReplayControls
          isPlaying={isPlaying}
          scenarioId={scenarioId}
          onReplayToggle={onReplayToggle}
          onReplayNext={onReplayNext}
          onReplayReset={onReplayReset}
          onScenarioChange={onScenarioChange}
        />
      ) : null}
    </section>
  );
}

export function MarketHeatPreview({
  rows,
  sourceLabel,
  sortMode,
  showExpired,
  canShowMore,
  selectedRowId,
  walletSubmitRowId = null,
  copyAmount,
  showMoreLabel,
  onAmountSet,
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
  showExpired: boolean;
  canShowMore: boolean;
  selectedRowId: string | null;
  walletSubmitRowId?: string | null;
  copyAmount: number;
  showMoreLabel: string;
  onAmountSet: (amount: number) => void;
  onShowExpiredChange: (showExpired: boolean) => void;
  onShowMore: () => void;
  onSortModeChange: (sortMode: MarketHeatSortMode) => void;
  onWalletSubmit: (rowId: string) => void;
  onSelectRow: (rowId: string) => void;
  onCloseIntent: () => void;
}) {
  return (
    <section className="market-heat-list" aria-label="Alpha Feed" data-testid="market-heat-preview">
      <div className="section-heading market-heat-heading">
        <div className="market-heat-heading-title">
          <p>Alpha Feed</p>
          <span>{sourceLabel} BTC markets</span>
        </div>
        <div className="market-heat-controls">
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
        const didSubmitToWallet = walletSubmitRowId === row.id;
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
                <span>{row.pairLabel}</span>
                <strong className={`direction-pill direction-pill-${sideClass}`}>{row.side}</strong>
              </div>
              <span>{row.intervalLabel} market</span>
            </div>
            <div className="trader-row-metrics" aria-label={`${row.displayName} market heat stats`}>
              <span>
                <small>Strike</small>
                {row.strikeLabel.replace("Strike ", "")}
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
                    {didSubmitToWallet ? (
                      <span className="wallet-submit-status" aria-live="polite">
                        Wallet request started
                      </span>
                    ) : null}
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
          <p>BTC Up/Down on DeepBook Predict</p>
        </div>
      </div>
      <div className="market-price">
        <span>{price.marketLabel}</span>
        <strong>{price.priceLabel}</strong>
        <em>{price.statusLabel}</em>
      </div>
    </header>
  );
}

function AccountSummary({
  availableLabel = null,
  bankrollLabel = null,
  summary,
}: {
  availableLabel?: string | null;
  bankrollLabel?: string | null;
  summary: ReturnType<typeof getReplayAccountSummary>;
}) {
  return (
    <section
      className={`account-summary account-summary-${summary.pnlTone}`}
      aria-label="Account summary"
      data-testid="session-pnl"
    >
      <div className="account-summary-main">
        <div className="account-pnl" data-testid="account-pnl">
          <p>Session PNL</p>
          <strong>{summary.pnl}</strong>
        </div>
        <div className="account-value">
          <span>Bankroll</span>
          <strong data-testid="account-value">{bankrollLabel ?? summary.accountValue}</strong>
        </div>
      </div>
      <div className="account-summary-stats">
        <div>
          <span>Avail</span>
          <strong>{availableLabel ?? summary.available}</strong>
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
  const [tradeWalletSubmitted, setTradeWalletSubmitted] = useState(false);
  const [walletTxState, setWalletTxState] = useState<WalletTransactionState>(
    idleWalletTransactionState,
  );
  const [dusdcBalanceRefreshKey, setDusdcBalanceRefreshKey] = useState(0);
  const [dusdcBalanceState, setDusdcBalanceState] = useState<DusdcBalanceState>({
    accountAddress: null,
    refreshKey: 0,
    status: "idle",
    label: null,
  });
  const [predictManagerRefreshKey, setPredictManagerRefreshKey] = useState(0);
  const [predictManagerState, setPredictManagerState] = useState<PredictManagerState>({
    accountAddress: null,
    objectId: null,
    refreshKey: 0,
    status: "idle",
  });
  const [tradeQuoteState, setTradeQuoteState] = useState<{
    key: string | null;
    status: TradeQuoteStatus;
    quote: TradeQuote | null;
  }>({
    key: null,
    status: "idle",
    quote: null,
  });
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() =>
    getInitialPreviewMode(realtimeApiBaseUrl),
  );
  const [liveActivitySnapshotState, setLiveActivitySnapshotState] = useState<{
    key: string;
    snapshot: LiveActivityModeSnapshot;
  } | null>(null);
  const [marketHeatPreview, setMarketHeatPreview] = useState<MarketHeatPreviewModel>(() =>
    buildMarketHeatPreview(),
  );
  const [marketHeatSortMode, setMarketHeatSortMode] =
    useState<MarketHeatSortMode>("latest");
  const [marketHeatShowExpired, setMarketHeatShowExpired] = useState(false);
  const [marketHeatVisibleLimit, setMarketHeatVisibleLimit] =
    useState(MARKET_HEAT_PAGE_SIZE);
  const [marketHeatIntent, setMarketHeatIntent] = useState<MarketHeatIntentState>({
    selectedRowId: null,
  });
  const [marketHeatWalletSubmitRowId, setMarketHeatWalletSubmitRowId] =
    useState<string | null>(null);
  const liveActivityModeRef = useRef<LiveActivityModeController | null>(null);
  const [expandedTraderId, setExpandedTraderId] = useState<string | null>(null);
  const [frozenTraderOrder, setFrozenTraderOrder] = useState<string[] | null>(null);
  const copyState = replayState.copy;
  const liveActivityKey = `${scenario.id}:${scenario.tableId}:${realtimeApiBaseUrl ?? ""}`;
  const realtimeTrace = useMemo(
    () => produceRealtimeActivityTraceById(scenario.id),
    [scenario.id],
  );
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
  const sortedMarketHeatRows = selectVisibleMarketHeatRows(marketHeatPreview.rows, {
    limit: marketHeatVisibleLimit,
    nowMs: marketHeatNowMs,
    showExpired: marketHeatShowExpired,
    sortMode: marketHeatSortMode,
  });
  const tradeMarketRows = buildTradeMarketLadder(marketHeatPreview, {
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
  const replayActivity = useMemo(() => {
    const sourceSequence = scenario.frames[replayState.step]?.source.sequence ?? 0;
    const visibleTrace = realtimeTrace.filter(
      (item) => item.sourceSequence <= sourceSequence,
    );

    return visibleTrace.reduce(
      (state, item) =>
        applyRealtimeActivityServerMessageJson(state, JSON.stringify(item)),
      createInitialRealtimeActivityState(),
    );
  }, [realtimeTrace, replayState.step, scenario.frames]);
  const fallbackActivitySnapshot = useMemo(
    () => createReplayLiveActivitySnapshot(replayActivity),
    [replayActivity],
  );
  const liveActivitySnapshot =
    liveActivitySnapshotState?.key === liveActivityKey
      ? liveActivitySnapshotState.snapshot
      : fallbackActivitySnapshot;
  const selectedTrader = getSelectedTrader(copyState, replayTraders);
  const hotTrader = replayTraders.find((trader) => trader.name === frame.hotHand.leader);
  const accountSummary = getReplayAccountSummary(replayState, frame);
  const receipt = frame.copyReceipt;
  const spectatorCount = scenario.spectators.length + selectedTrader.copied + selectedTrader.streak * 7;
  const activity = liveActivitySnapshot.activity.latestActivity
    ? [liveActivitySnapshot.activity.latestActivity.label]
    : frame.activity;
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
    const setSnapshot = (snapshot: LiveActivityModeSnapshot) => {
      setLiveActivitySnapshotState({
        key: liveActivityKey,
        snapshot,
      });
    };
    const mode = createLiveActivityMode({
      apiBaseUrl: realtimeApiBaseUrl,
      tableId: scenario.tableId,
      spectatorId: "spectator-local",
      replayActivity,
      onSnapshot: setSnapshot,
    });

    liveActivityModeRef.current = mode;
    setSnapshot(mode.snapshot);

    return () => {
      if (liveActivityModeRef.current === mode) {
        liveActivityModeRef.current = null;
      }

      mode.close();
    };
  }, [liveActivityKey, realtimeApiBaseUrl, scenario.tableId]);

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
    liveActivityModeRef.current?.updateReplayActivity(replayActivity);
  }, [replayActivity]);

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

  const handleScenarioChange = (scenarioId: ReplayScenarioId) => {
    const nextScenario = createReplayScenario(scenarioId);

    setScenario(nextScenario);
    setReplayState((state) => selectReplayScenario(state, nextScenario));
    setExpandedTraderId(null);
    setFrozenTraderOrder(null);
  };

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
    setTradeWalletSubmitted(false);
  };

  const handleAmountSet = (amount: number) => {
    setMarketHeatWalletSubmitRowId(null);
    setTradeWalletSubmitted(false);
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

  const handleReplayToggle = () => {
    setReplayState((state) => setReplayPlaying(state, !state.isPlaying));
  };

  const handleReplayNext = () => {
    setReplayState((state) => advanceReplay(setReplayPlaying(state, false), scenario));
  };

  const handleReplayReset = () => {
    setReplayState((state) => resetReplay(state));
    setExpandedTraderId(null);
    setFrozenTraderOrder(null);
  };

  const handlePreviewModeChange = (mode: PreviewMode) => {
    setPreviewMode(mode);

    if (mode !== "market") {
      setMarketHeatIntent((state) => closeMarketHeatIntent(state));
      setMarketHeatWalletSubmitRowId(null);
    }
  };

  const handleMarketHeatSelect = (rowId: string) => {
    setMarketHeatWalletSubmitRowId(null);
    setMarketHeatIntent((state) =>
      selectMarketHeatIntent(state, rowId, marketHeatPreview.rows),
    );
  };

  const handleMarketHeatClose = () => {
    setMarketHeatIntent((state) => closeMarketHeatIntent(state));
    setMarketHeatWalletSubmitRowId(null);
  };
  const handleMarketHeatWalletSubmit = (rowId: string) => {
    setMarketHeatIntent((state) =>
      selectMarketHeatIntent(state, rowId, marketHeatPreview.rows),
    );
    setMarketHeatWalletSubmitRowId(rowId);
  };
  const handleMarketHeatSortModeChange = (sortMode: MarketHeatSortMode) => {
    setMarketHeatSortMode(sortMode);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
  };
  const handleMarketHeatShowExpiredChange = (showExpired: boolean) => {
    setMarketHeatShowExpired(showExpired);
    setMarketHeatVisibleLimit(MARKET_HEAT_PAGE_SIZE);
  };
  const handleMarketHeatShowMore = () => {
    setMarketHeatVisibleLimit((limit) => limit + MARKET_HEAT_PAGE_SIZE);
  };
  const handleTradeSideChange = (side: TradeSide) => {
    setTradeSide(side);
    setTradeWalletSubmitted(false);
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
    setTradeWalletSubmitted(false);
  };
  const handleTradeStrikeChange = (selection: TradeMarketSelection) => {
    setSelectedTradeMarketId(selection.marketId);
    setCustomTradeStrikes((state) => ({
      ...state,
      [selection.marketId]: selection,
    }));
    setTradeWalletSubmitted(false);
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
      setTradeWalletSubmitted(false);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
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

      setWalletTxState({
        status: "success",
        label: "Predict account transaction sent. Checking account...",
        digest: walletResultDigest(result),
      });
      setDusdcBalanceRefreshKey((key) => key + 1);
      setPredictManagerRefreshKey((key) => key + 1);
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

    setTradeWalletSubmitted(true);
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

      setWalletTxState({
        status: "success",
        label: "Trade transaction sent.",
        digest: walletResultDigest(result),
      });
      setDusdcBalanceRefreshKey((key) => key + 1);
    } catch (error) {
      setWalletTxState({
        status: "error",
        label: walletErrorMessage(error),
        digest: null,
      });
    }
  };

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
            bankrollLabel={liveDusdcBalanceLabel}
            summary={accountSummary}
          />
          {activeView === "feed" ? (
            <>
              <ActiveSignalStrip
                frame={frame}
                receiptState={receipt.state}
                copyAmount={copyState.copyAmount}
                isPlaying={replayState.isPlaying}
                scenarioId={scenario.id}
                mode={previewMode}
                onReplayToggle={handleReplayToggle}
                onReplayNext={handleReplayNext}
                onReplayReset={handleReplayReset}
                onScenarioChange={handleScenarioChange}
                onModeChange={handlePreviewModeChange}
                marketHeatSourceLabel={marketHeatPreview.sourceLabel}
              />
              <SpectatorRail
                spectatorCount={spectatorCount}
                activity={activity}
                activitySource={liveActivitySnapshot.dataSource}
                activityStatus={liveActivitySnapshot.status}
                activityStatusLabel={liveActivitySnapshot.statusLabel}
              />
              {previewMode === "market" ? (
                <MarketHeatPreview
                  rows={sortedMarketHeatRows}
                  sourceLabel={marketHeatPreview.sourceLabel}
                  sortMode={marketHeatSortMode}
                  showExpired={marketHeatShowExpired}
                  canShowMore={marketHeatRemainingCount > 0}
                  selectedRowId={marketHeatIntent.selectedRowId}
                  walletSubmitRowId={marketHeatWalletSubmitRowId}
                  copyAmount={copyState.copyAmount}
                  showMoreLabel={marketHeatShowMoreLabel}
                  onAmountSet={handleAmountSet}
                  onShowExpiredChange={handleMarketHeatShowExpiredChange}
                  onShowMore={handleMarketHeatShowMore}
                  onSortModeChange={handleMarketHeatSortModeChange}
                  onWalletSubmit={handleMarketHeatWalletSubmit}
                  onSelectRow={handleMarketHeatSelect}
                  onCloseIntent={handleMarketHeatClose}
                />
              ) : (
                <HotTraderList
                  traders={displayedTraders}
                  selectedTraderId={copyState.selectedTraderId}
                  expandedTraderId={expandedTraderId}
                  receiptState={receipt.state}
                  copyAmount={copyState.copyAmount}
                  hotTraderId={hotTrader?.id ?? ""}
                  onCopy={handleTraderSelect}
                  onAmountStep={handleAmountStep}
                  onAmountSet={handleAmountSet}
                  onArmToggle={handleArmToggle}
                  onConfirmCopy={handleConfirmCopy}
                  onClose={handleCloseCopyPanel}
                />
              )}
            </>
          ) : (
            <TradeTicket
              customStrike={selectedTradeCustomStrike}
              copyAmount={copyState.copyAmount}
              marketRows={displayedTradeMarketRows}
              selectedMarketId={baseSelectedTradeMarket?.id ?? ""}
              selectedSide={tradeSide}
              quote={activeTradeQuote}
              quoteStatus={activeTradeQuoteStatus}
              predictManagerObjectId={activePredictManagerObjectId}
              walletActionPending={isWalletActionPending}
              walletConnected={Boolean(currentAccount)}
              walletStatusLabel={walletTxState.label}
              walletSubmitted={tradeWalletSubmitted}
              onAmountSet={handleAmountSet}
              onMarketChange={handleTradeMarketChange}
              onSideChange={handleTradeSideChange}
              onStrikeChange={handleTradeStrikeChange}
              onWalletSubmit={handleTradeWalletSubmit}
            />
          )}
        </div>
        <BottomNav activeView={activeView} onViewChange={setActiveView} />
      </section>
    </main>
  );
}
