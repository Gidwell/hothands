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
import { market, spectators, traders, type Trader } from "./mockData";
import {
  advanceReplay,
  createInitialReplayState,
  getReplayFrame,
  getReplayTraders,
  resetReplay,
  setReplayPlaying,
  updateReplayCopy,
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
  const [replayState, setReplayState] = useState(() => createInitialReplayState(traders));
  const copyState = replayState.copy;
  const replayTraders = useMemo(() => getReplayTraders(replayState, traders), [replayState]);
  const frame = useMemo(() => getReplayFrame(replayState, traders, market), [replayState]);
  const selectedTrader = getSelectedTrader(copyState, replayTraders);
  const receipt = frame.copyReceipt;
  const railCount = spectators.length + selectedTrader.copied + selectedTrader.streak * 7;

  useEffect(() => {
    if (!replayState.isPlaying) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setReplayState((state) => advanceReplay(state));
    }, 1800);

    return () => window.clearInterval(timer);
  }, [replayState.isPlaying]);

  const handleTraderSelect = (traderId: string) => {
    setReplayState((state) =>
      updateReplayCopy(state, (copy) => selectHotTrader(copy, traderId, traders)),
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
    setReplayState((state) => advanceReplay(setReplayPlaying(state, false)));
  };

  const handleReplayReset = () => {
    setReplayState((state) => resetReplay(state));
  };

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="Hot Hands table shell">
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
          <span className="volume-chip">{market.volume}</span>
        </header>

        <section className="table-heading">
          <div>
            <p>Table 7 / point {market.point}</p>
            <h1>Hot Hands</h1>
          </div>
          <div className="table-badge">{frame.stepLabel}</div>
        </section>

        <section className="replay-panel" aria-label="Live replay status">
          <div className="replay-status-row">
            <div>
              <p>Live replay</p>
              <h2>{frame.status}</h2>
            </div>
            <span>{frame.puck}</span>
          </div>
          <p className="replay-call">{frame.tableCall}</p>
          <div className="replay-controls" aria-label="Replay controls">
            <button type="button" onClick={handleReplayToggle}>
              {replayState.isPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={handleReplayNext}>
              Next
            </button>
            <button type="button" onClick={handleReplayReset}>
              Reset
            </button>
          </div>
        </section>

        <section
          className={`felt-table felt-table-${frame.phase} ${
            copyState.isArmed ? "felt-table-armed" : ""
          }`}
        >
          <div className="felt-rail">
            <span>Pass</span>
            <span>Come</span>
            <span>Odds</span>
          </div>
          <div className="shooter-puck">
            <span>{selectedTrader.avatar}</span>
            <strong>{selectedTrader.name}</strong>
            <p>{frame.latestSignal}</p>
          </div>
          <div className="felt-action-strip">{frame.tableCall}</div>
          <div className="dice-row" aria-hidden="true">
            <span className="die">{frame.dice[0]}</span>
            <span className="die">{frame.dice[1]}</span>
            <span className="chip chip-gold">{frame.puck}</span>
          </div>
        </section>

        <section className="spectator-section" aria-label="Spectators watching">
          <div className="spectator-copy">
            <span>{railCount.toLocaleString()}</span>
            <p>spectators on the rail</p>
          </div>
          <div className="spectator-rail">
            {spectators.map((spectator) => (
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
          <div className="rail-ticker" aria-label="Table activity">
            {frame.activity.map((activity) => (
              <span key={activity}>{activity}</span>
            ))}
          </div>
        </section>

        <section className="trader-list" aria-label="Hot leaderboard">
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
          <div className="copy-receipt">
            <p className="copy-state">
              {receipt.state} / {frame.status}
            </p>
            <h2>{receipt.label}</h2>
            <p className="copy-summary">{receipt.summary}</p>
            <div className="receipt-grid">
              <span>Leader</span>
              <strong>{receipt.leader}</strong>
              <span>Stake</span>
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
