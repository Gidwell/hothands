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

function TraderCard({
  trader,
  isSelected,
  isHotHand,
  onSelect,
}: {
  trader: Trader;
  isSelected: boolean;
  isHotHand: boolean;
  onSelect: (traderId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`trader-card trader-card-${trader.tone} ${
        isHotHand ? "trader-card-hot" : ""
      }`}
      aria-pressed={isSelected}
      onClick={() => onSelect(trader.id)}
    >
      <div className="trader-main">
        <div className="trader-avatar">{trader.avatar}</div>
        <div>
          <div className="trader-title-row">
            <h2>{trader.name}</h2>
            {isHotHand ? <span>Hot hand</span> : isSelected ? <span>Live pick</span> : null}
          </div>
          <p>
            {trader.handle} / {trader.role}
          </p>
        </div>
        <div className="heat-meter" aria-label={`${trader.name} hot score ${trader.hotScore}`}>
          <span style={{ width: `${trader.hotScore}%` }} />
        </div>
      </div>

      <div className="trader-stats" aria-label={`${trader.name} trading stats`}>
        <div>
          <span>{trader.streak}</span>
          <p>Streak</p>
        </div>
        <div>
          <span>{trader.hotScore}</span>
          <p>Hot</p>
        </div>
        <div>
          <span>{trader.roi}</span>
          <p>ROI</p>
        </div>
        <div>
          <span>{trader.copied.toLocaleString()}</span>
          <p>Copied</p>
        </div>
      </div>

      <div className="signal-row">
        <span>{trader.signal}</span>
        <p>{trader.tableRead}</p>
      </div>
    </button>
  );
}

export function App() {
  const [scenario, setScenario] = useState(() => createReplayScenario("opening-night"));
  const [replayState, setReplayState] = useState(() => createInitialReplayState(scenario));
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
  };

  const handleTraderSelect = (traderId: string) => {
    setReplayState((state) =>
      updateReplayCopy(state, (copy) => selectHotTrader(copy, traderId, scenario.traders)),
    );
  };

  const handleAmountStep = (direction: -1 | 1) => {
    setReplayState((state) => updateReplayCopy(state, (copy) => stepCopyAmount(copy, direction)));
  };

  const handleAmountSet = (amount: number) => {
    setReplayState((state) => updateReplayCopy(state, (copy) => setCopyAmount(copy, amount)));
  };

  const handleArmToggle = () => {
    setReplayState((state) => updateReplayCopy(state, (copy) => toggleCopyArmed(copy)));
  };

  const handleReplayToggle = () => {
    setReplayState((state) => setReplayPlaying(state, !state.isPlaying));
  };

  const handleReplayNext = () => {
    setReplayState((state) => advanceReplay(setReplayPlaying(state, false), scenario));
  };

  const handleReplayReset = () => {
    setReplayState((state) => resetReplay(state));
  };

  return (
    <main className="app-shell" data-testid="app-shell">
      <section className="phone-frame" aria-label="Hot Hands market shell">
        <header className="market-strip">
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

        <section className="table-heading">
          <div>
            <p>BTC UP/DOWN signal market</p>
            <h1>Hot Hands</h1>
          </div>
          <div className="table-badge">{frame.stepLabel}</div>
        </section>

        <section className="scenario-switcher" aria-label="Demo scenario">
          <select
            aria-label="Demo scenario"
            data-testid="scenario-selector"
            value={scenario.id}
            onChange={(event) => handleScenarioChange(event.currentTarget.value as ReplayScenarioId)}
          >
            {REPLAY_SCENARIOS.map((availableScenario) => (
              <option key={availableScenario.id} value={availableScenario.id}>
                {availableScenario.title}
              </option>
            ))}
          </select>
        </section>

        <section
          className="replay-panel"
          aria-label="Live replay status"
          data-testid="replay-status"
        >
          <div className="replay-status-row">
            <div>
              <p>Live replay</p>
              <h2>{frame.status}</h2>
            </div>
            <span>{frame.phaseBadge}</span>
          </div>
          <p className="replay-call">{frame.tableCall}</p>
          <div className="replay-controls" aria-label="Replay controls">
            <button type="button" onClick={handleReplayToggle}>
              {replayState.isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" data-testid="replay-next" onClick={handleReplayNext}>
              Next
            </button>
            <button type="button" data-testid="replay-reset" onClick={handleReplayReset}>
              Reset
            </button>
          </div>
        </section>

        <section
          className={`market-board market-board-${frame.phase} ${
            copyState.isArmed ? "market-board-armed" : ""
          }`}
        >
          <div className="prediction-zones">
            <span>BTC UP</span>
            <span>BTC DOWN</span>
            <span>Copy max</span>
          </div>
          <div className="signal-leader">
            <span>{selectedTrader.avatar}</span>
            <strong>{selectedTrader.name}</strong>
            <p>{frame.latestSignal}</p>
          </div>
          <div className="market-action-strip">{frame.tableCall}</div>
          <div className="signal-badge-row" aria-hidden="true">
            <span className="signal-badge">{frame.signalBadges[0]}</span>
            <span className="signal-badge">{frame.signalBadges[1]}</span>
            <span className="phase-chip chip-gold">{frame.phaseBadge}</span>
          </div>
        </section>

        <section className="spectator-section" aria-label="Spectators watching">
          <div className="spectator-copy">
            <span>{spectatorCount.toLocaleString()}</span>
            <p>spectators watching</p>
          </div>
          <div className="spectator-watchers">
            {scenario.spectators.map((spectator) => (
              <div
                className="spectator-avatar"
                key={spectator.id}
                style={{ backgroundColor: spectator.color }}
                aria-label={`${spectator.initials} ${spectator.mood}`}
              >
                {spectator.initials}
              </div>
            ))}
            <div className="spectator-more">+{selectedTrader.streak * 11}</div>
          </div>
          <div className="activity-ticker" aria-label="Market activity">
            {frame.activity.map((activity, index) => (
              <span key={`${activity}-${index}`}>{activity}</span>
            ))}
          </div>
        </section>

        <section className="trader-list" aria-label="Hot leaderboard" data-testid="hot-leaderboard">
          {replayTraders.map((trader) => (
            <TraderCard
              trader={trader}
              key={trader.id}
              isSelected={trader.id === copyState.selectedTraderId}
              isHotHand={
                frame.phase === "hot-hand-updated" && trader.id === copyState.selectedTraderId
              }
              onSelect={handleTraderSelect}
            />
          ))}
        </section>

        <section className="copy-tray" aria-label="Copy next signal tray">
          <div className="copy-receipt" data-testid="copy-receipt">
            <p className="copy-state">
              {receipt.state} / {frame.status}
            </p>
            <h2>{receipt.label}</h2>
            <p className="copy-summary">{receipt.summary}</p>
            <div className="receipt-grid">
              <span>Leader</span>
              <strong>{receipt.leader}</strong>
              <span>Copy max</span>
              <strong>{receipt.amount}</strong>
              <span>Settles</span>
              <strong>{receipt.settlement}</strong>
              <span>Result</span>
              <strong>{frame.settlement.pnl}</strong>
            </div>
          </div>
          <div className="amount-panel" aria-label="Copy amount">
            <div className="amount-stepper">
              <button
                type="button"
                aria-label="Decrease copy amount"
                onClick={() => handleAmountStep(-1)}
              >
                -
              </button>
              <strong>{formatCopyAmount(copyState.copyAmount)}</strong>
              <button
                type="button"
                aria-label="Increase copy amount"
                onClick={() => handleAmountStep(1)}
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
              value={copyState.copyAmount}
              onChange={(event) => handleAmountSet(Number(event.currentTarget.value))}
            />
            <div className="chip-row" aria-label="Quick copy amounts">
              {quickAmounts.map((amount) => (
                <button
                  type="button"
                  className={copyState.copyAmount === amount ? "selected-chip" : ""}
                  key={amount}
                  onClick={() => handleAmountSet(amount)}
                >
                  {formatCopyAmount(amount)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`arm-button ${copyState.isArmed ? "armed" : ""}`}
              data-testid="arm-button"
              onClick={handleArmToggle}
            >
              {copyState.isArmed ? "Disarm copy" : "Arm copy"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
