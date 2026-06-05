import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WalletLeaderboardsPanel } from "../src/App";
import { buildWalletLeaderboards } from "../src/walletLeaderboards";

describe("WalletLeaderboardsPanel component", () => {
  test("renders PnL and Streaks sections with best/worst sorting", () => {
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
              openCount: 2,
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
        activeBoard="pnl"
        sortDirection="best"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
        onSortDirectionChange={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="wallet-leaderboards-view"');
    expect(html).toContain("Wallet Leaders");
    expect(html).toContain("Indexed Testnet");
    expect(html).toContain('data-testid="wallet-leaderboard-tab-pnl"');
    expect(html).toContain('data-testid="wallet-leaderboard-tab-streaks"');
    expect(html).not.toContain('data-testid="wallet-leaderboard-tab-highestPnl"');
    expect(html).not.toContain('data-testid="wallet-leaderboard-tab-longestWinningStreak"');
    expect(html.indexOf(">PnL</button>")).toBeLessThan(html.indexOf(">Streaks</button>"));
    expect(html).toContain('data-testid="wallet-leaderboard-sort-toggle"');
    expect(html).toContain('aria-label="Sort worst first"');
    expect(html).toContain("↑");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="wallet-leaderboard-row"');
    expect(html).toContain("#1");
    expect(html).toContain("0xaaaa...0001");
    expect(html).toContain("+$12.35");
    expect(html).toContain("PNL</small>+$12.35");
    expect(html).toContain("Wins</small>4");
    expect(html).toContain("Losses</small>1");
    expect(html).toContain("Open</small>2");
    expect(html).not.toContain("Closed</small>5");
    expect(html).toContain("Current</small>2 wins");
    expect(html).toContain("Last</small>May 18, 21:40 PDT");
  });

  test("switches PnL sort between best and worst", () => {
    const snapshot = buildWalletLeaderboards(
      {
        source: "indexed_testnet",
        leaderboards: {
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
            },
          ],
          worstPnl: [
            {
              wallet: "0xdddd222233334444555566667777888899990004",
              totalPnl: -9_500_000,
              winCount: 1,
              lossCount: 5,
              closedCount: 6,
              longestWinningStreak: 1,
              longestLosingStreak: 4,
              currentStreakType: "loss",
              currentStreakLength: 3,
            },
          ],
        },
      },
      { timeZone: "America/Los_Angeles" },
    );
    const html = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="pnl"
        sortDirection="worst"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
        onSortDirectionChange={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="wallet-leaderboard-sort-toggle"');
    expect(html).toContain('aria-label="Sort best first"');
    expect(html).toContain("↓");
    expect(html).toContain("Worst PnL");
    expect(html).toContain("0xdddd...0004");
    expect(html).toContain("PNL</small><strong>-$9.50");
    expect(html).not.toContain("0xaaaa...0001");
  });

  test("labels streak board primary metric by selected sort", () => {
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
          currentWinningStreak: [
            {
              wallet: "0xbbbb222233334444555566667777888899990002",
              totalPnl: 3_450_000,
              winCount: 2,
              lossCount: 1,
              closedCount: 3,
              longestWinningStreak: 2,
              longestLosingStreak: 1,
              currentStreakType: "win",
              currentStreakLength: 2,
              lastSettledAtMs: 1_779_165_900_000,
            },
          ],
          longestLosingStreak: [],
          currentLosingStreak: [],
          worstPnl: [],
        },
      },
      { timeZone: "America/Los_Angeles" },
    );
    const html = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="streaks"
        sortDirection="best"
        streakMode="allTime"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
        onSortDirectionChange={() => undefined}
        onStreakModeChange={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="wallet-leaderboard-streak-mode-allTime"');
    expect(html).toContain('data-testid="wallet-leaderboard-streak-mode-current"');
    expect(html).toContain('data-testid="wallet-leaderboard-core-metric"');
    expect(html).toContain("Win Streak</small><strong>3 wins");
    expect(html).toContain("PNL</small>+$12.35");
    expect(html).not.toContain("Wins</small>3 wins");
  });

  test("switches streak boards between all-time and current streaks", () => {
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
              currentStreakType: "loss",
              currentStreakLength: 1,
              lastSettledAtMs: 1_779_165_600_000,
            },
          ],
          currentWinningStreak: [
            {
              wallet: "0xbbbb222233334444555566667777888899990002",
              totalPnl: 3_450_000,
              winCount: 2,
              lossCount: 1,
              closedCount: 3,
              longestWinningStreak: 2,
              longestLosingStreak: 1,
              currentStreakType: "win",
              currentStreakLength: 2,
              lastSettledAtMs: 1_779_165_900_000,
            },
          ],
          longestLosingStreak: [],
          currentLosingStreak: [
            {
              wallet: "0xcccc222233334444555566667777888899990003",
              totalPnl: -4_200_000,
              winCount: 1,
              lossCount: 4,
              closedCount: 5,
              longestWinningStreak: 1,
              longestLosingStreak: 2,
              currentStreakType: "loss",
              currentStreakLength: 2,
              lastSettledAtMs: 1_779_166_000_000,
            },
          ],
          worstPnl: [],
        },
      },
      { timeZone: "America/Los_Angeles" },
    );
    const winHtml = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="streaks"
        sortDirection="best"
        streakMode="current"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
        onSortDirectionChange={() => undefined}
        onStreakModeChange={() => undefined}
      />,
    );
    const lossHtml = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="streaks"
        sortDirection="worst"
        streakMode="current"
        snapshot={snapshot}
        status="ready"
        onBoardChange={() => undefined}
        onSortDirectionChange={() => undefined}
        onStreakModeChange={() => undefined}
      />,
    );

    expect(winHtml).toContain('aria-pressed="true" data-testid="wallet-leaderboard-streak-mode-current"');
    expect(winHtml).toContain('aria-label="Sort worst first"');
    expect(winHtml).toContain("0xbbbb...0002");
    expect(winHtml).toContain("Current Wins</small><strong>2 wins");
    expect(winHtml).toContain("PNL</small>+$3.45");
    expect(winHtml).not.toContain("0xaaaa...0001");
    expect(lossHtml).toContain('aria-label="Sort best first"');
    expect(lossHtml).toContain("0xcccc...0003");
    expect(lossHtml).toContain("Current Losses</small><strong>2 losses");
    expect(lossHtml).toContain("PNL</small>-$4.20");
  });

  test("renders an empty state for a loaded board with no entries", () => {
    const html = renderToStaticMarkup(
      <WalletLeaderboardsPanel
        activeBoard="pnl"
        sortDirection="worst"
        snapshot={buildWalletLeaderboards()}
        status="ready"
        onBoardChange={() => undefined}
        onSortDirectionChange={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="wallet-leaderboard-empty"');
    expect(html).toContain("No settled wallet results yet");
  });
});
