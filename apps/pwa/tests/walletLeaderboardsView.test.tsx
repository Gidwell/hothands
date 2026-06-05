import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletLeaderboardsPanel } from "../src/App";
import { buildWalletLeaderboards } from "../src/walletLeaderboards";

describe("WalletLeaderboardsPanel component", () => {
  test("renders segmented wallet leaderboard boards with compact rows", () => {
    const snapshot = buildWalletLeaderboards(
      {
        source: "indexed_testnet",
        leaderboards: {
          longestWinningStreak: [],
          longestLosingStreak: [],
          highestPnl: [
            {
              wallet: "0xaaaa222233334444555566667777888899990001",
              totalPnl: 12_345_678,
              winCount: 4,
              lossCount: 1,
              closedCount: 5,
              longestWinningStreak: 3,
              longestLosingStreak: 1,
              currentStreakType: "win",
              currentStreakLength: 2,
              lastSettledAtMs: 1_779_165_600_000,
            },
          ],
          worstPnl: [],
        },
      },
      { timeZone: "America/Los_Angeles" },
    );
    const html = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="highestPnl"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="wallet-leaderboards-view"');
    expect(html).toContain("Wallet Leaders");
    expect(html).toContain("Indexed Testnet");
    expect(html).toContain('data-testid="wallet-leaderboard-tab-highestPnl"');
    expect(html).toContain('data-testid="wallet-leaderboard-tab-longestWinningStreak"');
    expect(html).toContain('data-testid="wallet-leaderboard-tab-longestLosingStreak"');
    expect(html).toContain('data-testid="wallet-leaderboard-tab-worstPnl"');
    expect(html.indexOf("Top PnL")).toBeLessThan(html.indexOf("Win Streaks"));
    expect(html.indexOf("Win Streaks")).toBeLessThan(html.indexOf("Lose Streaks"));
    expect(html.indexOf("Lose Streaks")).toBeLessThan(html.indexOf("Worst PnL"));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="wallet-leaderboard-row"');
    expect(html).toContain("#1");
    expect(html).toContain("0xaaaa...0001");
    expect(html).toContain("+$12.35");
    expect(html).toContain("PNL</small>+$12.35");
    expect(html).toContain("Wins</small>4");
    expect(html).toContain("Losses</small>1");
    expect(html).toContain("Closed</small>5");
    expect(html).toContain("Current</small>2 wins");
    expect(html).toContain("Last</small>May 18, 21:40 PDT");
  });

  test("labels streak board primary metric as Top Streak", () => {
    const snapshot = buildWalletLeaderboards(
      {
        source: "indexed_testnet",
        leaderboards: {
          highestPnl: [],
          longestWinningStreak: [
            {
              wallet: "0xaaaa222233334444555566667777888899990001",
              totalPnl: 12_345_678,
              winCount: 4,
              lossCount: 1,
              closedCount: 5,
              longestWinningStreak: 3,
              longestLosingStreak: 1,
              currentStreakType: "win",
              currentStreakLength: 2,
              lastSettledAtMs: 1_779_165_600_000,
            },
          ],
          longestLosingStreak: [],
          worstPnl: [],
        },
      },
      { timeZone: "America/Los_Angeles" },
    );
    const html = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="longestWinningStreak"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
      />,
    );

    expect(html).toContain("Top Streak</small>3 wins");
    expect(html).not.toContain("Wins</small>3 wins");
  });

  test("renders an empty state for a loaded board with no entries", () => {
    const html = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="worstPnl"
        snapshot={buildWalletLeaderboards()}
        status="ready"
        onBoardChange={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="wallet-leaderboard-empty"');
    expect(html).toContain("No settled wallet results yet");
  });
});
