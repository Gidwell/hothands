import { describe, expect, test } from "bun:test";
import {
  buildWalletLeaderboards,
  loadWalletLeaderboards,
  selectWalletLeaderboardEntries,
} from "../src/walletLeaderboards";

describe("wallet leaderboards model", () => {
  test("loads indexed testnet wallet leaderboards from the API", async () => {
    const calls: string[] = [];
    const snapshot = await loadWalletLeaderboards({
      apiBaseUrl: "https://api.hot-hands.test/",
      nowMs: 1_779_166_200_000,
      timeZone: "America/Los_Angeles",
      fetcher: async (url) => {
        calls.push(String(url));

        return Response.json({
          source: "indexed_testnet",
          leaderboards: {
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
            longestLosingStreak: [
              {
                wallet: "0xbbbb222233334444555566667777888899990002",
                totalPnl: -900_000,
                winCount: 1,
                lossCount: 3,
                closedCount: 4,
                longestWinningStreak: 1,
                longestLosingStreak: 3,
                currentStreakType: "loss",
                currentStreakLength: 3,
                lastSettledAtMs: 1_779_165_000_000,
              },
            ],
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
            worstPnl: [
              {
                wallet: "0xbbbb222233334444555566667777888899990002",
                totalPnl: -900_000,
                winCount: 1,
                lossCount: 3,
                closedCount: 4,
                longestWinningStreak: 1,
                longestLosingStreak: 3,
                currentStreakType: "loss",
                currentStreakLength: 3,
                lastSettledAtMs: 1_779_165_000_000,
              },
            ],
          },
        });
      },
    });

    expect(calls).toEqual(["https://api.hot-hands.test/testnet/wallet-leaderboards"]);
    expect(snapshot.sourceLabel).toBe("Indexed Testnet");
    expect(snapshot.leaderboards.longestWinningStreak[0]).toMatchObject({
      rank: 1,
      wallet: "0xaaaa222233334444555566667777888899990001",
      displayName: "0xaaaa...0001",
      totalPnlLabel: "+$12.35",
      totalPnlTone: "positive",
      currentStreakLabel: "2 wins",
      longestWinningStreakLabel: "3 wins",
      longestLosingStreakLabel: "1 loss",
      lastSettledLabel: "May 18, 21:40 PDT",
    });
    expect(snapshot.leaderboards.longestLosingStreak[0]).toMatchObject({
      totalPnlLabel: "-$0.90",
      totalPnlTone: "negative",
      currentStreakLabel: "3 losses",
    });
  });

  test("preserves backend board ordering and filters malformed entries", () => {
    const snapshot = buildWalletLeaderboards({
      source: "indexed_testnet",
      leaderboards: {
        longestWinningStreak: [
          {
            wallet: "0xdddd222233334444555566667777888899990004",
            totalPnl: "250000",
            winCount: 1,
            lossCount: 0,
            closedCount: 1,
            longestWinningStreak: 1,
            longestLosingStreak: 0,
            currentStreakType: "win",
            currentStreakLength: 1,
            lastSettledAtMs: 1_779_165_600_000,
          },
          { wallet: "", totalPnl: 0 },
        ],
        longestLosingStreak: [],
        highestPnl: [],
        worstPnl: [],
      },
    });

    expect(selectWalletLeaderboardEntries(snapshot, "longestWinningStreak")).toHaveLength(1);
    expect(snapshot.leaderboards.longestWinningStreak[0]).toMatchObject({
      displayName: "0xdddd...0004",
      totalPnlLabel: "+$0.25",
      currentStreakLabel: "1 win",
      rank: 1,
    });
  });

  test("returns an empty snapshot until the endpoint is configured", async () => {
    const snapshot = await loadWalletLeaderboards({
      apiBaseUrl: "",
      nowMs: 1_779_166_200_000,
    });

    expect(snapshot.sourceLabel).toBe("Awaiting API");
    expect(snapshot.leaderboards.highestPnl).toEqual([]);
  });
});
