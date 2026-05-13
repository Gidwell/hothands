import { useMemo, useState } from "react";
import {
  COPY_AMOUNT_MAX,
  COPY_AMOUNT_MIN,
  createInitialCopyState,
  formatCopyAmount,
  getCopyReceiptPreview,
  getSelectedTrader,
  selectHotTrader,
  setCopyAmount,
  stepCopyAmount,
  toggleCopyArmed,
} from "./copyModel";
import { market, spectators, traders, type Trader } from "./mockData";

const quickAmounts = [100, 250, 500, 1_000];

function TraderCard({
  trader,
  isSelected,
  onSelect,
}: {
  trader: Trader;
  isSelected: boolean;
  onSelect: (traderId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`trader-card trader-card-${trader.tone}`}
      aria-pressed={isSelected}
      onClick={() => onSelect(trader.id)}
    >
      <div className="trader-main">
        <div className="trader-avatar">{trader.avatar}</div>
        <div>
          <div className="trader-title-row">
            <h2>{trader.name}</h2>
            {isSelected ? <span>Live pick</span> : null}
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
  const [copyState, setCopyState] = useState(() => createInitialCopyState(traders));
  const selectedTrader = getSelectedTrader(copyState, traders);
  const receipt = useMemo(
    () => getCopyReceiptPreview(copyState, traders, market),
    [copyState],
  );
  const railCount = spectators.length + selectedTrader.copied + selectedTrader.streak * 7;

  const handleTraderSelect = (traderId: string) => {
    setCopyState((state) => selectHotTrader(state, traderId, traders));
  };

  const handleAmountStep = (direction: -1 | 1) => {
    setCopyState((state) => stepCopyAmount(state, direction));
  };

  const handleAmountSet = (amount: number) => {
    setCopyState((state) => setCopyAmount(state, amount));
  };

  const handleArmToggle = () => {
    setCopyState((state) => toggleCopyArmed(state));
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
          <div className="table-badge">Live roll</div>
        </section>

        <section className={`felt-table ${copyState.isArmed ? "felt-table-armed" : ""}`}>
          <div className="felt-rail">
            <span>Pass</span>
            <span>Come</span>
            <span>Odds</span>
          </div>
          <div className="shooter-puck">
            <span>{selectedTrader.avatar}</span>
            <strong>{selectedTrader.name}</strong>
            <p>{selectedTrader.signal}</p>
          </div>
          <div className="dice-row" aria-hidden="true">
            <span className="die">3</span>
            <span className="die">5</span>
            <span className="chip chip-gold">{copyState.isArmed ? "ON" : "OFF"}</span>
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
            <span>{selectedTrader.streak} straight hot signals</span>
            <span>{receipt.amount} max copy</span>
            <span>{copyState.isArmed ? "Copy armed" : "Copy paused"}</span>
          </div>
        </section>

        <section className="trader-list" aria-label="Hot traders">
          {traders.map((trader) => (
            <TraderCard
              trader={trader}
              key={trader.id}
              isSelected={trader.id === copyState.selectedTraderId}
              onSelect={handleTraderSelect}
            />
          ))}
        </section>

        <section className="copy-tray" aria-label="Copy next signal tray">
          <div className="copy-receipt">
            <p className="copy-state">{receipt.status}</p>
            <h2>{receipt.label}</h2>
            <p className="copy-summary">{receipt.summary}</p>
            <div className="receipt-grid">
              <span>Leader</span>
              <strong>{receipt.leader}</strong>
              <span>Stake</span>
              <strong>{receipt.amount}</strong>
              <span>Settles</span>
              <strong>Next signal</strong>
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
