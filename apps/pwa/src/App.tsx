import { copyTray, market, spectators, traders, type Trader } from "./mockData";

function TraderCard({ trader }: { trader: Trader }) {
  return (
    <article className={`trader-card trader-card-${trader.tone}`}>
      <div className="trader-main">
        <div className="trader-avatar">{trader.avatar}</div>
        <div>
          <h2>{trader.name}</h2>
          <p>{trader.handle}</p>
        </div>
        <span className="signal-pill">{trader.signal}</span>
      </div>

      <div className="trader-stats" aria-label={`${trader.name} trading stats`}>
        <div>
          <span>{trader.streak}</span>
          <p>Streak</p>
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
    </article>
  );
}

export function App() {
  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="Hot Hands table shell">
        <header className="market-strip">
          <div>
            <p>{market.status}</p>
            <strong>{market.pair}</strong>
          </div>
          <div className="market-price">
            <strong>{market.price}</strong>
            <span>{market.move}</span>
          </div>
          <span className="volume-chip">{market.volume}</span>
        </header>

        <section className="table-heading">
          <div>
            <p>Stage 1</p>
            <h1>Hot Table</h1>
          </div>
          <button type="button" className="table-button" aria-label="Open table options">
            Menu
          </button>
        </section>

        <section className="spectator-section" aria-label="Spectators watching">
          <div className="spectator-copy">
            <span>{spectators.length + 218}</span>
            <p>spectators watching</p>
          </div>
          <div className="spectator-rail">
            {spectators.map((spectator) => (
              <div
                className="spectator-avatar"
                key={spectator.id}
                style={{ backgroundColor: spectator.color }}
                aria-label={`${spectator.initials} watching`}
              >
                {spectator.initials}
              </div>
            ))}
          </div>
        </section>

        <section className="trader-list" aria-label="Hot traders">
          {traders.map((trader) => (
            <TraderCard trader={trader} key={trader.id} />
          ))}
        </section>

        <section className="copy-tray" aria-label="Copy next signal tray">
          <div>
            <p className="copy-state">{copyTray.state}</p>
            <h2>Copy next signal</h2>
            <p className="copy-summary">
              {copyTray.leader} on {copyTray.market}. Max stake {copyTray.maxStake}.
            </p>
          </div>
          <div className="copy-actions">
            <span>{copyTray.settlement}</span>
            <button type="button">Armed</button>
          </div>
        </section>
      </section>
    </main>
  );
}
