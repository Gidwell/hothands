import { useEffect, useMemo, useState } from "react";
import {
  COPY_AMOUNT_MAX,
  COPY_AMOUNT_MIN,
  formatCopyAmount,
  getSelectedTrader,
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
  getReplayFrame,
  getReplayTraders,
  REPLAY_SCENARIOS,
  resetReplay,
  selectReplayScenario,
  setReplayPlaying,
  updateReplayCopy,
  type ReplayScenarioId,
} from "./replayModel";

const quickAmounts = [100, 250, 500, 1_000];

function traderCopyStatus(isSelected: boolean, receiptState: string): string {
  if (!isSelected) {
    return "Live";
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
}) {
  const status = traderCopyStatus(isSelected, receiptState);

  return (
    <article
      className={`trader-row trader-row-${trader.tone} ${
        isSelected ? "trader-row-selected" : ""
      } ${isHotTrader ? "trader-row-hot" : ""}`}
      data-testid="hot-trader-row"
    >
      <div className="trader-row-main">
        <div className="trader-avatar" aria-hidden="true">
          {trader.avatar}
        </div>
        <div className="trader-identity">
          <div className="trader-title-row">
            <h2>{trader.name}</h2>
            <span className={`copy-status copy-status-${status.toLowerCase()}`}>
              {status}
            </span>
          </div>
          <p>
            {trader.handle} / {trader.role}
          </p>
        </div>
        <div className="trader-row-score">
          <strong>{trader.hotScore}</strong>
          <span>Hot</span>
        </div>
      </div>

      <div className="trader-row-metrics" aria-label={`${trader.name} trading stats`}>
        <span>{trader.streak} streak</span>
        <span>{trader.roi} ROI</span>
        <span>{trader.copied.toLocaleString()} copied</span>
      </div>

      <div className="trader-row-signal">
        <p>{trader.signal}</p>
        <button
          type="button"
          data-testid="copy-trigger"
          aria-expanded={isExpanded}
          onClick={() => onCopy(trader.id)}
        >
          Copy
        </button>
      </div>

      <div className="heat-meter" aria-label={`${trader.name} hot score ${trader.hotScore}`}>
        <span style={{ width: `${trader.hotScore}%` }} />
      </div>

      {isExpanded ? (
        <div className="inline-copy-panel" data-testid="inline-copy-panel">
          <div className="inline-copy-summary">
            <p>Copy next {trader.name} signal</p>
            <strong>{formatCopyAmount(copyAmount)} max / BTC-USD</strong>
          </div>
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
            className={`arm-button ${receiptState === "Armed" || receiptState === "Copied" ? "armed" : ""}`}
            data-testid="arm-copy-button"
            onClick={onArmToggle}
          >
            {receiptState === "Armed" || receiptState === "Copied" ? "Pause copy" : "Arm copy"}
          </button>
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
  scenario,
  activity,
}: {
  spectatorCount: number;
  scenario: ReturnType<typeof createReplayScenario>;
  activity: string[];
}) {
  return (
    <section className="spectator-rail" aria-label="Live activity" data-testid="spectator-rail">
      <div className="spectator-copy">
        <strong>{spectatorCount.toLocaleString()}</strong>
        <span>watching</span>
      </div>
      <div className="spectator-watchers" aria-label="Spectators watching">
        {scenario.spectators.slice(0, 5).map((spectator) => (
          <div
            className="spectator-avatar"
            key={spectator.id}
            style={{ backgroundColor: spectator.color }}
            aria-label={`${spectator.initials} ${spectator.mood}`}
          >
            {spectator.initials}
          </div>
        ))}
      </div>
      <div className="activity-ticker" aria-label="Market activity">
        {activity.map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function ActiveSignalStrip({
  frame,
  selectedTrader,
  isPlaying,
  scenarioId,
  onReplayToggle,
  onReplayNext,
  onReplayReset,
  onScenarioChange,
}: {
  frame: ReturnType<typeof getReplayFrame>;
  selectedTrader: Trader;
  isPlaying: boolean;
  scenarioId: ReplayScenarioId;
  onReplayToggle: () => void;
  onReplayNext: () => void;
  onReplayReset: () => void;
  onScenarioChange: (scenarioId: ReplayScenarioId) => void;
}) {
  return (
    <section
      className={`active-signal-strip active-signal-strip-${frame.phase}`}
      aria-label="Active signal"
      data-testid="active-signal-strip"
    >
      <div className="signal-strip-top">
        <span className="phase-chip">{frame.phaseBadge}</span>
        <div>
          <p>{frame.status}</p>
          <h1>Hot Hands</h1>
        </div>
        <span className="step-chip">{frame.stepLabel}</span>
      </div>
      <div className="signal-strip-leader">
        <span aria-hidden="true">{selectedTrader.avatar}</span>
        <div>
          <strong>{frame.latestSignal}</strong>
          <p>{frame.tableCall}</p>
        </div>
      </div>
      <ReplayControls
        isPlaying={isPlaying}
        scenarioId={scenarioId}
        onReplayToggle={onReplayToggle}
        onReplayNext={onReplayNext}
        onReplayReset={onReplayReset}
        onScenarioChange={onScenarioChange}
      />
    </section>
  );
}

function MarketHeader() {
  return (
    <header className="market-strip" data-testid="market-header">
      <div className="market-live">
        <span aria-hidden="true" />
        <div>
          <p>{market.status}</p>
          <strong>{market.pair}</strong>
        </div>
      </div>
      <div className="market-price">
        <strong>{market.price}</strong>
        <span>{market.move}</span>
      </div>
      <div className="market-badges" aria-label="Market details">
        <span>{market.expiry}</span>
        <span>{market.strike}</span>
        <span>{market.volume}</span>
      </div>
    </header>
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
}) {
  return (
    <section className="trader-list" aria-label="Hot leaderboard" data-testid="hot-leaderboard">
      <div className="section-heading">
        <p>Hot Right Now</p>
        <span>Copy the next BTC UP/DOWN signal</span>
      </div>
      {traders.map((trader) => (
        <TraderRow
          trader={trader}
          key={trader.id}
          isSelected={trader.id === selectedTraderId}
          isExpanded={trader.id === expandedTraderId}
          isHotTrader={trader.id === hotTraderId}
          receiptState={receiptState}
          copyAmount={copyAmount}
          onCopy={onCopy}
          onAmountStep={onAmountStep}
          onAmountSet={onAmountSet}
          onArmToggle={onArmToggle}
        />
      ))}
    </section>
  );
}

export function App() {
  const [scenario, setScenario] = useState(() => createReplayScenario("opening-night"));
  const [replayState, setReplayState] = useState(() => createInitialReplayState(scenario));
  const [expandedTraderId, setExpandedTraderId] = useState<string | null>(null);
  const copyState = replayState.copy;
  const replayTraders = useMemo(
    () => getReplayTraders(replayState, scenario),
    [replayState, scenario],
  );
  const frame = useMemo(
    () => getReplayFrame(replayState, scenario, market),
    [replayState, scenario],
  );
  const selectedTrader = getSelectedTrader(copyState, replayTraders);
  const hotTrader = replayTraders.find((trader) => trader.name === frame.hotHand.leader);
  const receipt = frame.copyReceipt;
  const spectatorCount = scenario.spectators.length + selectedTrader.copied + selectedTrader.streak * 7;

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
  };

  const handleTraderSelect = (traderId: string) => {
    setReplayState((state) =>
      updateReplayCopy(state, (copy) => selectHotTrader(copy, traderId, scenario.traders)),
    );
    setExpandedTraderId(traderId);
  };

  const handleAmountStep = (direction: -1 | 1) => {
    setReplayState((state) => updateReplayCopy(state, (copy) => stepCopyAmount(copy, direction)));
  };

  const handleAmountSet = (amount: number) => {
    setReplayState((state) => updateReplayCopy(state, (copy) => setCopyAmount(copy, amount)));
  };

  const handleArmToggle = () => {
    const willArmCopy = !copyState.isArmed;

    setReplayState((state) => updateReplayCopy(state, (copy) => toggleCopyArmed(copy)));

    if (willArmCopy) {
      setExpandedTraderId(null);
    }
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
  };

  return (
    <main className="app-shell" data-testid="app-shell">
      <section className="phone-frame" aria-label="Hot Hands market shell">
        <MarketHeader />
        <ActiveSignalStrip
          frame={frame}
          selectedTrader={selectedTrader}
          isPlaying={replayState.isPlaying}
          scenarioId={scenario.id}
          onReplayToggle={handleReplayToggle}
          onReplayNext={handleReplayNext}
          onReplayReset={handleReplayReset}
          onScenarioChange={handleScenarioChange}
        />
        <SpectatorRail
          spectatorCount={spectatorCount}
          scenario={scenario}
          activity={frame.activity}
        />
        <HotTraderList
          traders={replayTraders}
          selectedTraderId={copyState.selectedTraderId}
          expandedTraderId={expandedTraderId}
          receiptState={receipt.state}
          copyAmount={copyState.copyAmount}
          hotTraderId={hotTrader?.id ?? ""}
          onCopy={handleTraderSelect}
          onAmountStep={handleAmountStep}
          onAmountSet={handleAmountSet}
          onArmToggle={handleArmToggle}
        />
      </section>
    </main>
  );
}
