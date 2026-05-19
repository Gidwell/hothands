import { useEffect, useMemo, useRef, useState } from "react";
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

const quickAmounts = [100, 250, 500, 1_000];

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
          <div className="chip-row" aria-label="Quick copy amounts">
            {quickAmounts.map((amount) => (
              <button
                type="button"
                className={copyAmount === amount ? "selected-chip" : ""}
                key={amount}
                onClick={() => onAmountSet(amount)}
              >
                {formatCopyAmount(amount)}
              </button>
            ))}
          </div>
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
  const latestActivity = activity[0] ?? "Waiting for the next BTC signal";

  return (
    <section
      className="spectator-rail"
      aria-label="Live activity"
      data-source={activitySource}
      data-status={activityStatus}
      data-testid="spectator-rail"
    >
      <div className="spectator-copy">
        <strong>{spectatorCount.toLocaleString()}</strong>
        <span>
          watching /{" "}
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

function ActiveSignalStrip({
  frame,
  receiptState,
  copyAmount,
  isPlaying,
  scenarioId,
  onReplayToggle,
  onReplayNext,
  onReplayReset,
  onScenarioChange,
}: {
  frame: ReturnType<typeof getReplayFrame>;
  receiptState: string;
  copyAmount: number;
  isPlaying: boolean;
  scenarioId: ReplayScenarioId;
  onReplayToggle: () => void;
  onReplayNext: () => void;
  onReplayReset: () => void;
  onScenarioChange: (scenarioId: ReplayScenarioId) => void;
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
          <p>{frame.status}</p>
        </div>
        <span>
          {receiptState === "Disarmed"
            ? `Ready / ${formatCopyAmount(copyAmount)}`
            : `${receiptState} / ${formatCopyAmount(copyAmount)}`}
        </span>
        <button
          type="button"
          className="demo-toggle"
          aria-expanded={isDemoOpen}
          onClick={() => setIsDemoOpen((isOpen) => !isOpen)}
        >
          Demo
        </button>
      </div>
      <div className="signal-strip-leader">
        <div>
          <strong>{frame.latestSignal}</strong>
        </div>
        <span>{frame.stepLabel}</span>
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

function MarketHeader() {
  return (
    <header className="market-strip" data-testid="market-header">
      <div className="market-live">
        <span aria-hidden="true" />
        <div>
          <h1>Hot Hands</h1>
          <p>
            {market.pair} / {market.expiry}
          </p>
        </div>
      </div>
      <div className="market-price">
        <strong>{market.price}</strong>
        <span>{market.move}</span>
      </div>
    </header>
  );
}

function AccountSummary({
  summary,
}: {
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
          <p>{summary.title}</p>
          <strong>{summary.pnl}</strong>
        </div>
        <div className="account-value">
          <span>Bankroll</span>
          <strong data-testid="account-value">{summary.accountValue}</strong>
        </div>
      </div>
      <div className="account-summary-stats">
        <div>
          <span>Avail</span>
          <strong>{summary.available}</strong>
        </div>
        <div>
          <span>Copy</span>
          <strong>{summary.copyValue}</strong>
        </div>
        <div>
          <span>State</span>
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
  const [scenario, setScenario] = useState(() => createReplayScenario("opening-night"));
  const [replayState, setReplayState] = useState(() => createInitialReplayState(scenario));
  const [liveActivitySnapshotState, setLiveActivitySnapshotState] = useState<{
    key: string;
    snapshot: LiveActivityModeSnapshot;
  } | null>(null);
  const liveActivityModeRef = useRef<LiveActivityModeController | null>(null);
  const [expandedTraderId, setExpandedTraderId] = useState<string | null>(null);
  const [frozenTraderOrder, setFrozenTraderOrder] = useState<string[] | null>(null);
  const copyState = replayState.copy;
  const realtimeApiBaseUrl = import.meta.env.VITE_HOT_HANDS_API_URL;
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
    liveActivityModeRef.current?.updateReplayActivity(replayActivity);
  }, [replayActivity]);

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

  return (
    <main className="app-shell" data-testid="app-shell">
      <section className="phone-frame" aria-label="Hot Hands market shell">
        <MarketHeader />
        <AccountSummary summary={accountSummary} />
        <ActiveSignalStrip
          frame={frame}
          receiptState={receipt.state}
          copyAmount={copyState.copyAmount}
          isPlaying={replayState.isPlaying}
          scenarioId={scenario.id}
          onReplayToggle={handleReplayToggle}
          onReplayNext={handleReplayNext}
          onReplayReset={handleReplayReset}
          onScenarioChange={handleScenarioChange}
        />
        <SpectatorRail
          spectatorCount={spectatorCount}
          activity={activity}
          activitySource={liveActivitySnapshot.dataSource}
          activityStatus={liveActivitySnapshot.status}
          activityStatusLabel={liveActivitySnapshot.statusLabel}
        />
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
      </section>
    </main>
  );
}
