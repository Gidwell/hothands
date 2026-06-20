import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AccountSummary,
  BottomNav,
  MarketHeader,
  PortfolioPanel,
  ProfilePanel,
  ShareCardModal,
  TradeTicket,
  WalletHeaderControl,
  WalletStatusBar,
  buildAppViewSearch,
  buildProfileHeatStat,
  buildPortfolioPnlFromWalletPerformance,
  buildTradeExpiryOptions,
  buildTradeQuoteKey,
  filterMarketHeatRowsByFollowedWallets,
  getAccountSummaryVariant,
  getBankrollFundingUnavailableReason,
  getInitialAppView,
  isDemoModeEnabled,
  getMarketHeatRowsRefreshMs,
  getPredictPortfolioRefreshMs,
  parseStoredStakeAmount,
  pruneTradeSelectionsForView,
  resolveSelectedProfileWalletForNav,
  resolveSelectedTradeMarketForSelection,
  selectActiveFeedExpiryDate,
  shouldToggleTradeMarketSelectionClosed,
  shouldAutoRefreshMarketHeatRows,
  shouldAutoRefreshPredictPortfolio,
  shouldAutoRefreshWalletLeaderboards,
  shouldShowAccountSummary,
  type ShareCardState,
} from "../src/App";
import {
  buildMarketHeatPreview,
  type MarketHeatPreviewRowInput,
  type TradeMarketLadderRow,
} from "../src/marketHeatModel";
import type { OraclePriceChart } from "../src/oraclePriceChartModel";
import type { WalletLeaderboardEntry } from "../src/walletLeaderboards";

function findElementByTestId(node: ReactNode, testId: string): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByTestId(child, testId);
      if (match) {
        return match;
      }
    }
    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  const props = node.props as {
    children?: ReactNode;
    "data-testid"?: string;
    testId?: string;
  };
  if (props["data-testid"] === testId || props.testId === testId) {
    return node;
  }

  return findElementByTestId(props.children, testId);
}

function tradeMarketRowFixture(
  overrides: Partial<TradeMarketLadderRow> = {},
): TradeMarketLadderRow {
  const expiryMs = overrides.expiryMs ?? new Date(2026, 5, 12, 1).getTime();
  const strike = overrides.strike ?? 62_000;
  const strikeRaw = overrides.strikeRaw ?? strike * 1_000_000;

  return {
    id: overrides.id ?? `market-${expiryMs}-${strikeRaw}`,
    oracleId: overrides.oracleId ?? `0xoracle${expiryMs}`,
    pairLabel: overrides.pairLabel ?? "BTC/USD",
    intervalLabel: overrides.intervalLabel ?? "23d",
    roundLabel: overrides.roundLabel ?? "23d round",
    expiry: overrides.expiry ?? expiryMs,
    expiryMs,
    expiryTimeLabel: overrides.expiryTimeLabel ?? "Jun 12, 2026, 1:00 AM",
    timeRemainingLabel: overrides.timeRemainingLabel ?? "3d left",
    strike,
    strikeRaw,
    strikeLabel: overrides.strikeLabel ?? "$62,000",
    moneynessLabel: overrides.moneynessLabel ?? "+$200 vs spot",
    activityLabel: overrides.activityLabel ?? "1 wallet · 1 trade · $1",
    uniqueWalletCount: overrides.uniqueWalletCount ?? 1,
    tradeCount: overrides.tradeCount ?? 1,
    distinctStrikeCount: overrides.distinctStrikeCount ?? 1,
    volumeUsd: overrides.volumeUsd ?? 1,
    volumeLabel: overrides.volumeLabel ?? "$1",
    ...(overrides.strikeOptions === undefined ? {} : { strikeOptions: overrides.strikeOptions }),
    ...(overrides.pricingModel === undefined ? {} : { pricingModel: overrides.pricingModel }),
    up: overrides.up ?? {
      walletCount: 1,
      tradeCount: 1,
      volumeUsd: 1,
      volumeLabel: "$1",
      estimatedPrice: 0.5,
    },
    down: overrides.down ?? {
      walletCount: 0,
      tradeCount: 0,
      volumeUsd: 0,
      volumeLabel: "$0",
    },
  };
}

function portfolioHistoryItemFixture(index: number) {
  return {
    closeLabel: "Redeemed",
    costLabel: "$1",
    direction: index % 2 === 0 ? ("UP" as const) : ("DOWN" as const),
    expiryTimeLabel: `Jun ${index}, 2026, 5:00 PM`,
    id: `history-${index}`,
    managerId: "0xmanager",
    openedAtLabel: `Jun ${index}, 2026`,
    oracleId: `0xoracle-${index}`,
    payoutLabel: "$2",
    pnlAtomic: "1000000",
    pnlLabel: "+$1",
    pnlTone: "positive" as const,
    quantityLabel: "$2",
    remainingLabel: "$0",
    statusLabel: "Redeemed",
    strikeLabel: `$60,00${index}`,
    updatedAtLabel: `Jun ${index}, 2026`,
  };
}

const readyOracleChartFixture: OraclePriceChart = {
  detail: "DeepBook Predict oracle price used for BTC market settlement.",
  latestPriceLabel: "$66,978",
  marketLabel: "BTC/USD",
  oracleId: "0xoracle2h",
  points: [
    {
      price: 66_900,
      timestampMs: 1_779_158_000_000,
    },
    {
      price: 66_978,
      timestampMs: 1_779_158_060_000,
    },
  ],
  sourceLabel: "Indexed Testnet",
  status: "ready",
  title: "DeepBook BTC oracle price",
};

describe("mobile app navigation", () => {
  test("places wallet connection in the market header action slot", () => {
    const html = renderToStaticMarkup(
      <MarketHeader
        walletControl={
          <WalletHeaderControl
            accountAddress={null}
            connectionStatus="disconnected"
            readOnly={false}
            walletCount={1}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
          />
        }
      />,
    );

    expect(html).toContain('data-testid="market-header-wallet"');
    expect(html).toContain('class="market-logo"');
    expect(html).toContain('src="/favicon.svg"');
    expect(html).toContain('data-testid="wallet-connect"');
    expect(html).toContain("Connect wallet");
    expect(html).not.toContain("BTC/USD");
  });

  test("renders the theme toggle in the market header action slot", () => {
    const html = renderToStaticMarkup(
      <MarketHeader
        themeControl={
          <button
            type="button"
            className="theme-toggle"
            data-testid="theme-toggle"
            aria-label="Switch to dark mode"
          >
            <svg aria-hidden="true" />
          </button>
        }
        walletControl={
          <WalletHeaderControl
            accountAddress={null}
            connectionStatus="disconnected"
            readOnly={false}
            walletCount={1}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
          />
        }
      />,
    );

    expect(html).toContain('data-testid="market-header-actions"');
    expect(html).toContain('data-testid="theme-toggle"');
    expect(html).toContain('data-testid="market-header-wallet"');
    expect(html).toContain("Switch to dark mode");
    expect(html).not.toContain(">Dark<");
    expect(html).not.toContain(">Light<");
    expect(html).not.toContain("theme-stage-toggle");
  });

  test("asks users to choose when multiple wallets are eligible", () => {
    const html = renderToStaticMarkup(
      <MarketHeader
        walletControl={
          <WalletHeaderControl
            accountAddress={null}
            connectionStatus="disconnected"
            readOnly={false}
            walletChoices={[{ name: "Phantom" }, { name: "Slush" }]}
            walletChooserOpen={true}
            walletCount={2}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
            onWalletSelect={() => undefined}
          />
        }
      />,
    );

    expect(html).toContain('data-testid="wallet-connect"');
    expect(html).toContain("Choose wallet");
    expect(html).toContain('data-testid="wallet-picker"');
    expect(html).toContain("Connect Phantom");
    expect(html).toContain("Connect Slush");
  });

  test("shows connected wallet address in the market header action slot", () => {
    const html = renderToStaticMarkup(
      <MarketHeader
        walletControl={
          <WalletHeaderControl
            accountAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
            connectionStatus="connected"
            displayName="darius"
            heatScore={71}
            heatScoreLabel="71"
            readOnly={false}
            walletCount={1}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
          />
        }
      />,
    );

    expect(html).toContain('data-testid="wallet-address"');
    expect(html).toContain("darius");
    expect(html).toContain("market-heat-score-badge-hot");
    expect(html).toContain("Heat 71 out of 100");
    expect(html).toContain("Connected");
  });

  test("shows account summary only on portfolio views", () => {
    expect(shouldShowAccountSummary("feed")).toBe(false);
    expect(shouldShowAccountSummary("leaderboards")).toBe(false);
    expect(shouldShowAccountSummary("profile")).toBe(false);
    expect(shouldShowAccountSummary("trade")).toBe(false);
    expect(shouldShowAccountSummary("portfolio")).toBe(true);
  });

  test("uses the portfolio account strip only on portfolio views", () => {
    expect(getAccountSummaryVariant("portfolio")).toBe("portfolio");
    expect(getAccountSummaryVariant("feed")).toBe("default");
    expect(getAccountSummaryVariant("trade")).toBe("default");
  });

  test("auto-refreshes market heat rows on feed and profile views", () => {
    expect(shouldAutoRefreshMarketHeatRows("feed")).toBe(true);
    expect(shouldAutoRefreshMarketHeatRows("profile")).toBe(true);
    expect(shouldAutoRefreshMarketHeatRows("trade")).toBe(false);
    expect(shouldAutoRefreshMarketHeatRows("portfolio")).toBe(false);
    expect(shouldAutoRefreshMarketHeatRows("leaderboards")).toBe(false);
    expect(getMarketHeatRowsRefreshMs("feed")).toBe(15000);
    expect(getMarketHeatRowsRefreshMs("profile")).toBe(15000);
    expect(getMarketHeatRowsRefreshMs("trade")).toBeNull();
  });

  test("auto-refreshes wallet leaderboards on leaders and profile views", () => {
    expect(shouldAutoRefreshWalletLeaderboards("leaderboards")).toBe(true);
    expect(shouldAutoRefreshWalletLeaderboards("profile")).toBe(true);
    expect(shouldAutoRefreshWalletLeaderboards("feed")).toBe(false);
    expect(shouldAutoRefreshWalletLeaderboards("trade")).toBe(false);
    expect(shouldAutoRefreshWalletLeaderboards("portfolio")).toBe(false);
  });

  test("auto-refreshes portfolio data faster while expired rows are pending settlement", () => {
    expect(shouldAutoRefreshPredictPortfolio("portfolio")).toBe(true);
    expect(shouldAutoRefreshPredictPortfolio("feed")).toBe(false);
    expect(shouldAutoRefreshPredictPortfolio("trade")).toBe(false);
    expect(shouldAutoRefreshPredictPortfolio("leaderboards")).toBe(false);
    expect(shouldAutoRefreshPredictPortfolio("profile")).toBe(false);

    expect(getPredictPortfolioRefreshMs("portfolio")).toBe(5000);
    expect(
      getPredictPortfolioRefreshMs("portfolio", {
        hasPendingExpiredPosition: true,
      }),
    ).toBe(2000);
    expect(getPredictPortfolioRefreshMs("feed")).toBeNull();
  });

  test("builds three canonical market bucket pills", () => {
    const nowMs = new Date("2026-06-10T12:45:00-07:00").getTime();
    const fifteenMinuteMs = new Date("2026-06-10T12:55:00-07:00").getTime();
    const hourlyMs = new Date("2026-06-10T13:00:00-07:00").getTime();
    const dailyMs = new Date("2026-06-11T01:00:00-07:00").getTime();

    expect(
      buildTradeExpiryOptions(
        [
          tradeMarketRowFixture({
            id: "market-15m",
            oracleId: "oracle-15m",
            expiryMs: fifteenMinuteMs,
            expiryTimeLabel: "Jun 10, 12:55 PDT",
          }),
          tradeMarketRowFixture({
            id: "market-hourly",
            oracleId: "oracle-hourly",
            expiryMs: hourlyMs,
            expiryTimeLabel: "Jun 10, 13:00 PDT",
          }),
          tradeMarketRowFixture({
            id: "market-daily",
            oracleId: "oracle-daily",
            expiryMs: dailyMs,
            expiryTimeLabel: "Jun 11, 01:00 PDT",
          }),
        ],
        nowMs,
      ),
    ).toEqual([
      expect.objectContaining({
        label: "15m",
        marketId: "market-15m",
        oracleId: "oracle-15m",
        sublabel: "10:00",
        value: "15m",
      }),
      expect.objectContaining({
        label: "1h",
        marketId: "market-hourly",
        oracleId: "oracle-hourly",
        sublabel: "15:00",
        value: "1h",
      }),
      expect.objectContaining({
        label: "1d",
        marketId: "market-daily",
        oracleId: "oracle-daily",
        sublabel: "12:15:00",
        value: "1d",
      }),
    ]);
  });

  test("marks canonical market countdowns as danger under two minutes", () => {
    const nowMs = new Date("2026-06-10T12:28:01-07:00").getTime();
    const expiryMs = new Date("2026-06-10T12:30:00-07:00").getTime();

    expect(
      buildTradeExpiryOptions(
        [
          tradeMarketRowFixture({
            id: "market-final-seconds",
            oracleId: "oracle-final-seconds",
            expiryMs,
            expiryTimeLabel: "Jun 10, 12:30 PDT",
          }),
        ],
        nowMs,
      )[0],
    ).toEqual(
      expect.objectContaining({
        isCountdownDanger: true,
        sublabel: "1:59",
      }),
    );
  });

  test("lets canonical bucket pills point to the same market when expiries line up", () => {
    const nowMs = new Date("2026-06-10T00:50:00-07:00").getTime();
    const dailyAndHourlyMs = new Date("2026-06-10T01:00:00-07:00").getTime();
    const options = buildTradeExpiryOptions(
      [
        tradeMarketRowFixture({
          id: "market-all-buckets",
          oracleId: "oracle-all-buckets",
          expiryMs: dailyAndHourlyMs,
          expiryTimeLabel: "Jun 10, 01:00 PDT",
        }),
      ],
      nowMs,
    );

    expect(options.map((option) => option.value)).toEqual(["15m", "1h", "1d"]);
    expect(options.map((option) => option.marketId)).toEqual([
      "market-all-buckets",
      "market-all-buckets",
      "market-all-buckets",
    ]);
  });

  test("defaults feed expiration filters to the first bucket with a market", () => {
    const expiryOptions = [
      {
        count: 0,
        expiryMs: 0,
        label: "15m",
        sublabel: "No market",
        value: "15m",
      },
      {
        count: 1,
        expiryMs: new Date(2026, 5, 10, 13).getTime(),
        label: "1h",
        marketId: "hourly-market",
        oracleId: "hourly-oracle",
        sublabel: "13:00 PDT",
        value: "1h",
      },
    ];

    expect(selectActiveFeedExpiryDate(null, expiryOptions)).toBe("1h");
    expect(selectActiveFeedExpiryDate("15m", expiryOptions)).toBe("15m");
    expect(selectActiveFeedExpiryDate("1d", expiryOptions)).toBe("1h");
    expect(selectActiveFeedExpiryDate(null, [])).toBeNull();
  });

  test("parses the persisted stake amount safely", () => {
    expect(parseStoredStakeAmount("12.34")).toBe(12.34);
    expect(parseStoredStakeAmount("0")).toBe(0.01);
    expect(parseStoredStakeAmount("5000")).toBe(1000);
    expect(parseStoredStakeAmount(null)).toBe(25);
    expect(parseStoredStakeAmount("not-money")).toBe(25);
  });

  test("resets external wallet selection when opening the profile tab directly", () => {
    const selectedWallet = {
      displayName: "0x195b...756c",
      wallet: "0x195b00000000000000000000000000000000000000000000000000000000756c",
    };

    expect(resolveSelectedProfileWalletForNav("profile", selectedWallet)).toBeNull();
    expect(resolveSelectedProfileWalletForNav("leaderboards", selectedWallet)).toBe(
      selectedWallet,
    );
  });

  test("restores active app views from the URL while preserving wallet params", () => {
    expect(getInitialAppView("?view=trade", null)).toBe("trade");
    expect(getInitialAppView("?view=leaderboards", null)).toBe("leaderboards");
    expect(getInitialAppView("?view=not-a-tab", null)).toBe("feed");
    expect(getInitialAppView("", "0x29b8")).toBe("portfolio");
    expect(isDemoModeEnabled("?demo=true&view=feed")).toBe(true);
    expect(isDemoModeEnabled("?demo=1")).toBe(true);
    expect(isDemoModeEnabled("?demo=false")).toBe(false);
    expect(buildAppViewSearch("?devWallet=0xabc", "profile")).toBe(
      "?devWallet=0xabc&view=profile",
    );
  });

  test("keeps the trade quote key stable across live estimated price refreshes", () => {
    const baseMarket = {
      id: "btc-2h-72000",
      oracleId: "0xoracle2h",
      pairLabel: "BTC/USD",
      intervalLabel: "2h",
      roundLabel: "2h round",
      expiry: 1_779_172_200_000,
      expiryMs: 1_779_172_200_000,
      expiryTimeLabel: "May 18, 23:30 PDT",
      timeRemainingLabel: "2h left",
      strike: 72_000,
      strikeRaw: 72_000_000_000,
      strikeLabel: "$72,000",
      moneynessLabel: "+$950 vs spot",
      activityLabel: "2 wallets",
      uniqueWalletCount: 2,
      tradeCount: 3,
      distinctStrikeCount: 1,
      volumeUsd: 12,
      volumeLabel: "$12",
      up: {
        walletCount: 1,
        tradeCount: 1,
        volumeUsd: 5,
        volumeLabel: "$5",
        estimatedPrice: 0.48,
      },
      down: {
        walletCount: 1,
        tradeCount: 2,
        volumeUsd: 7,
        volumeLabel: "$7",
        estimatedPrice: 0.52,
      },
    };

    expect(buildTradeQuoteKey(baseMarket, "UP", 25)).toBe(
      buildTradeQuoteKey(
        {
          ...baseMarket,
          up: { ...baseMarket.up, estimatedPrice: 0.51 },
          down: { ...baseMarket.down, estimatedPrice: 0.49 },
        },
        "UP",
        25,
      ),
    );
  });

  test("renders bankroll funding actions without a wallet balance metric", () => {
    let depositClicked = false;
    let withdrawClicked = false;
    const html = renderToStaticMarkup(
      <AccountSummary
        bankrollLabel="$12.50"
        depositAmount={75}
        summary={{
          accountValue: "$100",
          available: "$80",
          copyValue: "$25",
          detail: "Ready to copy.",
          pnl: "+$0",
          pnlTone: "flat",
          status: "Watching",
          title: "My Session",
        }}
        onDeposit={() => {
          depositClicked = true;
        }}
        onWithdraw={() => {
          withdrawClicked = true;
        }}
        variant="portfolio"
      />,
    );

    expect(depositClicked).toBe(false);
    expect(withdrawClicked).toBe(false);
    expect(html).toContain('aria-label="Account summary"');
    expect(html).toContain("All-time PNL");
    expect(html).not.toContain(">Balance</span>");
    expect(html).not.toContain(">Wallet balance</span>");
    expect(html).not.toContain('data-testid="available-wallet-balance"');
    expect(html).toContain("Deposited");
    expect(html).toContain('data-testid="predict-bankroll-balance"');
    expect(html).toContain("$12.50");
    expect(html).not.toContain('data-testid="deposit-bankroll-amount"');
    expect(html).toContain('data-testid="portfolio-deposit-bankroll"');
    expect(html).toContain('data-testid="portfolio-withdraw-bankroll"');
    expect(html).toContain("Deposit");
    expect(html).toContain("Withdraw");
  });

  test("routes bankroll funding to wallet and Predict account setup first", () => {
    expect(
      getBankrollFundingUnavailableReason({
        predictManagerObjectId: null,
        walletConnected: false,
      }),
    ).toBe("Connect a Sui testnet wallet first.");
    expect(
      getBankrollFundingUnavailableReason({
        predictManagerObjectId: null,
        walletConnected: true,
      }),
    ).toBe("Create a Predict account first.");
    expect(
      getBankrollFundingUnavailableReason({
        predictManagerObjectId: "0xmanager",
        walletConnected: true,
      }),
    ).toBeNull();
  });

  test("wires the bankroll funding sheet amount for the selected action", () => {
    let changedAmount = 0;
    let submitMode = "";
    let closed = false;
    const tree = AccountSummary({
      depositAmount: 25,
      fundingAmount: 18.75,
      fundingMode: "deposit",
      bankrollLabel: "$12.50",
      walletDusdcBalanceLabel: "$91.25",
      summary: {
        accountValue: "$100",
        available: "$80",
        copyValue: "$25",
        detail: "Ready to copy.",
        pnl: "+$0",
        pnlTone: "flat",
        status: "Watching",
        title: "My Session",
      },
      onDeposit: () => undefined,
      onWithdraw: () => undefined,
      onFundingAmountChange: (amount) => {
        changedAmount = amount;
      },
      onFundingClose: () => {
        closed = true;
      },
      onFundingSubmit: (mode) => {
        submitMode = mode;
      },
      variant: "portfolio",
    });
    const html = renderToStaticMarkup(tree);

    expect(html).toContain('data-testid="bankroll-funding-sheet"');
    expect(html).toContain("Deposit");
    expect(html).toContain("Send to wallet");
    expect(html).toContain("Wallet DUSDC");
    expect(html).toContain("$91.25");
    expect(html).toContain("Deposited");
    expect(html).toContain("$12.50");
    expect(html).not.toContain('data-testid="bankroll-funding-mode-deposit"');
    expect(html).not.toContain('data-testid="bankroll-funding-mode-withdraw"');

    const input = findElementByTestId(tree, "bankroll-funding-amount");
    expect(input).not.toBeNull();
    const props = input?.props as {
      onChange?: (amount: number) => void;
      value?: number;
    };

    expect(props.value).toBe(18.75);
    props.onChange?.(12.34);
    expect(changedAmount).toBe(12.34);
    props.onChange?.(0);
    expect(changedAmount).toBe(0);

    const submitButton = findElementByTestId(tree, "bankroll-funding-submit");
    (submitButton?.props as { onClick?: () => void }).onClick?.();
    expect(submitMode).toBe("deposit");

    const closeButton = findElementByTestId(tree, "bankroll-funding-close");
    (closeButton?.props as { onClick?: () => void }).onClick?.();
    expect(closed).toBe(true);
  });

  test("renders portfolio stake budget and funding actions without wallet balance", () => {
    let stakeAmount = 0;
    let depositOpened = false;
    let withdrawOpened = false;
    const tree = AccountSummary({
      bankrollLabel: "$12.50",
      stakeAmount: 25,
      summary: {
        accountValue: "$100",
        available: "$80",
        copyValue: "$25",
        detail: "Ready to copy.",
        pnl: "+$0",
        pnlTone: "flat",
        status: "Flat",
        title: "My Session",
      },
      variant: "portfolio",
      onDeposit: () => {
        depositOpened = true;
      },
      onWithdraw: () => {
        withdrawOpened = true;
      },
      onStakeAmountChange: (amount) => {
        stakeAmount = amount;
      },
    });
    const html = renderToStaticMarkup(tree);
    const input = findElementByTestId(tree, "default-stake-amount");

    expect(html).toContain("Stake");
    expect(html).toContain('data-testid="portfolio-deposit-bankroll"');
    expect(html).toContain('data-testid="portfolio-withdraw-bankroll"');
    expect(html).not.toContain('data-testid="available-wallet-balance"');
    expect(html).not.toContain("Position");
    expect(input).not.toBeNull();
    (input?.props as { onChange?: (amount: number) => void }).onChange?.(50);
    expect(stakeAmount).toBe(50);

    const depositButton = findElementByTestId(tree, "portfolio-deposit-bankroll");
    (depositButton?.props as { onClick?: () => void }).onClick?.();
    expect(depositOpened).toBe(true);

    const withdrawButton = findElementByTestId(tree, "portfolio-withdraw-bankroll");
    (withdrawButton?.props as { onClick?: () => void }).onClick?.();
    expect(withdrawOpened).toBe(true);
  });

  test("uses indexed wallet performance for all-time portfolio PNL", () => {
    const entry: WalletLeaderboardEntry = {
      rank: 1,
      wallet: "0x29b8",
      displayName: "darius",
      totalCost: 360_863_276,
      totalPayout: 360_642_713,
      totalPnl: -220_563,
      totalPnlLabel: "-$0.22",
      totalPnlTone: "negative",
      openCount: 0,
      closedCount: 71,
      winCount: 44,
      lossCount: 27,
      heatScore: 90,
      longestWinningStreak: 12,
      longestWinningStreakLabel: "12 wins",
      longestLosingStreak: 4,
      longestLosingStreakLabel: "4 losses",
      currentStreakType: "win",
      currentStreakLength: 5,
      currentStreakLabel: "5 wins",
      lastSettledAtMs: 1_781_737_207_132,
      lastSettledLabel: "Jun 17, 15:00",
      lastSeenMs: 1_781_737_225_326,
    };

    expect(buildPortfolioPnlFromWalletPerformance(entry)).toEqual({
      costLabel: "$360.86",
      payoutLabel: "$360.64",
      pnlAtomic: "-220563",
      pnlLabel: "-$0.22",
      pnlTone: "negative",
    });
  });

  test("renders bottom navigation tabs in primary product order", () => {
    const html = renderToStaticMarkup(
      <BottomNav activeView="feed" onViewChange={() => undefined} />,
    );

    expect(html).toContain('data-testid="bottom-nav"');
    expect(html).toContain('class="bottom-nav-icon"');
    expect(html).toContain('class="bottom-nav-trade-action"');
    expect(html).toContain('d="M17 20V4"');
    expect(html).toContain('d="M7 4v16"');
    expect(html).not.toContain('d="M7 7h11"');
    expect(html).toContain("<span>Feed</span>");
    expect(html).toContain("<span>Trade</span>");
    expect(html).toContain("<span>Leaders</span>");
    expect(html).toContain("<span>Portfolio</span>");
    expect(html).toContain("<span>Profile</span>");
    expect(html.indexOf("<span>Feed</span>")).toBeLessThan(html.indexOf("<span>Leaders</span>"));
    expect(html.indexOf("<span>Leaders</span>")).toBeLessThan(html.indexOf("<span>Trade</span>"));
    expect(html.indexOf("<span>Trade</span>")).toBeLessThan(html.indexOf("<span>Portfolio</span>"));
    expect(html.indexOf("<span>Portfolio</span>")).toBeLessThan(html.indexOf("<span>Profile</span>"));
    expect(html).toContain('aria-pressed="true"');
  });

  test("renders profile wallet following controls", () => {
    const html = renderToStaticMarkup(
      <ProfilePanel
        currentWalletAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        followedWallets={[
          {
            displayName: "0x195b...756c",
            wallet: "0x195b00000000000000000000000000000000000000000000000000000000756c",
          },
        ]}
        profileFollowedWallets={[
          {
            displayName: "scorz",
            wallet: "0xsc0rz00000000000000000000000000000000000000000000000000000000",
          },
        ]}
        profileWallet={{
          displayName: "0x195b...756c",
          wallet: "0x195b00000000000000000000000000000000000000000000000000000000756c",
        }}
        onFollowWallet={() => undefined}
        onSelectWallet={() => undefined}
        onUnfollowWallet={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="profile-view"');
    expect(html).toContain("Profile");
    expect(html).toContain("1 following");
    expect(html).toContain('data-testid="profile-follow-toggle"');
    expect(html).toContain("Following");
    expect(html).not.toContain('data-testid="profile-follow-wallet-input"');
    expect(html).not.toContain('data-testid="profile-follow-wallet-submit"');
    expect(html).toContain("0x195b...756c");
    expect(html).toContain("scorz");
    expect(html).not.toContain("0xsc0rz00000000000000000000000000000000000000000000000000000000");
    expect(html).not.toContain("Unfollow");
  });

  test("renders the current wallet as the profile when no external wallet is selected", () => {
    const html = renderToStaticMarkup(
      <ProfilePanel
        currentWalletAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        followedWallets={[
          {
            displayName: "scorz",
            wallet: "0xsc0rz00000000000000000000000000000000000000000000000000000000",
          },
        ]}
        profileWallet={null}
        onFollowWallet={() => undefined}
        onSelectWallet={() => undefined}
        onUnfollowWallet={() => undefined}
      />,
    );

    expect(html).toContain("Your wallet");
    expect(html).toContain("0x00000000000000000000000000000000000000000000000000000000000000aa");
    expect(html).toContain("Add wallet");
    expect(html).toContain("scorz");
    expect(html).toContain("Unfollow");
    expect(html).not.toContain('data-testid="profile-follow-toggle"');
    expect(html).not.toContain("Follow wallet");
  });

  test("renders an editable custom profile name for a connected current wallet", () => {
    const html = renderToStaticMarkup(
      <ProfilePanel
        currentWalletAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        followedWallets={[]}
        ownProfileDisplayName="Signal Mom"
        profileDisplayNameDraft="Signal Mom 2"
        profileWallet={null}
        walletConnected
        onFollowWallet={() => undefined}
        onProfileDisplayNameDraftChange={() => undefined}
        onProfileDisplayNameSave={() => undefined}
        onSelectWallet={() => undefined}
        onUnfollowWallet={() => undefined}
      />,
    );

    expect(html).toContain("Signal Mom");
    expect(html).toContain('data-testid="profile-display-name-input"');
    expect(html).toContain('value="Signal Mom 2"');
    expect(html).toContain('data-testid="profile-display-name-save"');
  });

  test("builds profile heat from the wallet's hottest active row", () => {
    const rows = buildMarketHeatPreview(
      [
        {
          id: "warm-row",
          wallet: "0xaaaa222233334444555566667777888899990000111122223333444455556666",
          manager: "manager 0xaaaa...6666",
          market: "BTC-USD",
          side: "UP",
          strike: 62_500,
          expiryMs: 1_779_165_600_000,
          intervalLabel: "2h",
          observedAtMs: 1_779_158_000_000,
          heatScore: 42,
          status: "copy_ready",
        },
        {
          id: "hot-row",
          wallet: "0xaaaa222233334444555566667777888899990000111122223333444455556666",
          manager: "manager 0xaaaa...6666",
          market: "BTC-USD",
          side: "DOWN",
          strike: 63_000,
          expiryMs: 1_779_165_600_000,
          intervalLabel: "2h",
          observedAtMs: 1_779_158_500_000,
          heatScore: 83,
          status: "copy_ready",
        },
      ],
      8,
      {
        nowMs: 1_779_158_000_000,
      },
    ).rows;

    expect(buildProfileHeatStat(rows)).toEqual({
      label: "Heat",
      tone: "positive",
      value: "83",
    });
    expect(buildProfileHeatStat([])).toEqual({
      label: "Heat",
      tone: "flat",
      value: "--",
    });
    expect(buildProfileHeatStat([], { heatScore: 64 })).toEqual({
      label: "Heat",
      tone: "flat",
      value: "64",
    });
  });

  test("renders selected wallet positions on the profile page", () => {
    const profileWallet = "0xaaaa222233334444555566667777888899990000111122223333444455556666";
    const profileRows: MarketHeatPreviewRowInput[] = [
      {
        id: "profile-copy-row",
        wallet: profileWallet,
        manager: "0xmanager",
        market: "BTC-USD",
        side: "UP",
        quantity: 1_000_000,
        cost: 500_000,
        costUsd: 0.5,
        strike: 62_500,
        expiryMs: 1_779_165_600_000,
        intervalLabel: "2h",
        observedAtMs: 1_779_158_000_000,
        heatScore: 37,
        status: "copy_ready",
      },
    ];
    const rows = buildMarketHeatPreview(profileRows, 8, {
      nowMs: 1_779_158_000_000,
    }).rows;
    const html = renderToStaticMarkup(
      <ProfilePanel
        currentWalletAddress={null}
        copyAttributionLabels={{
          "profile-copy-row": "Copied by 9 · $225 copied",
        }}
        followedWallets={[]}
        profileCopyAttributionLabel="Copied by 14 · $420 copied"
        profileHistoryItems={[
          {
            closeLabel: "Redeemed",
            costLabel: "$1",
            direction: "UP",
            expiryTimeLabel: "Jun 12, 2026, 5:00 PM",
            id: "profile-history-new",
            managerId: "0xmanager",
            openedAtLabel: "Jun 12, 2026",
            oracleId: "0xoracle",
            payoutLabel: "$2.50",
            pnlAtomic: "1500000",
            pnlLabel: "+$1.50",
            pnlTone: "positive",
            quantityLabel: "$2.50",
            remainingLabel: "$0",
            statusLabel: "Redeemed",
            strikeLabel: "$62,500",
            updatedAtLabel: "Jun 12, 2026",
          },
          {
            closeLabel: "Redeemed",
            costLabel: "$1",
            direction: "DOWN",
            expiryTimeLabel: "Jun 11, 2026, 5:00 PM",
            id: "profile-history-old",
            managerId: "0xmanager",
            openedAtLabel: "Jun 11, 2026",
            oracleId: "0xoracle-old",
            payoutLabel: "$0",
            pnlAtomic: "-1000000",
            pnlLabel: "-$1",
            pnlTone: "negative",
            quantityLabel: "$2",
            remainingLabel: "$0",
            statusLabel: "Redeemed",
            strikeLabel: "$61,500",
            updatedAtLabel: "Jun 11, 2026",
          },
        ]}
        profileWallet={{
          displayName: "0xaaaa...6666",
          wallet: profileWallet,
        }}
        profilePositionRows={rows}
        selectedProfilePositionRowId="profile-copy-row"
        copyAmount={25}
        onFollowWallet={() => undefined}
        onProfilePositionSelect={() => undefined}
        onProfilePositionWalletSubmit={() => undefined}
        onShareProfile={() => undefined}
        onShareRow={() => undefined}
        onSelectWallet={() => undefined}
        onUnfollowWallet={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="profile-positions"');
    expect(html).toContain('data-testid="profile-positions-tab"');
    expect(html).toContain('data-testid="profile-history-tab"');
    expect(html).toContain('aria-pressed="true" data-testid="profile-positions-tab"');
    expect(html).toContain('aria-pressed="false" data-testid="profile-history-tab"');
    expect(html).not.toContain('data-testid="profile-trade-history"');
    expect(html).toContain("Positions");
    expect(html).toContain('data-testid="market-heat-row"');
    expect(html).toContain("0xaaaa...6666");
    expect(html).toContain("Copied by 14");
    expect(html).toContain("Copied by 9");
    expect(html).toContain('data-testid="profile-share"');
    expect(html).not.toContain('data-testid="market-heat-share"');
    expect(html).toContain("wallet-identicon");
    expect(html).toContain('data-testid="profile-pnl-sparkline"');
    expect(html).toContain("Last 10 PNL");
    expect(html).toContain("+$0.50");
    expect(html).toContain("UP");
    expect(html).toContain("$62,500");
    expect(html).toContain('data-testid="market-heat-intent-panel"');
    expect(html).toContain("Connect wallet first");
    expect(html).toContain('data-testid="market-heat-wallet-submit" disabled=""');
    expect(html).not.toContain('data-testid="market-heat-sort-latest"');
    expect(html).not.toContain('data-testid="market-heat-show-expired"');
    const positionsStart = html.indexOf('data-testid="profile-positions"');
    const profileFormStart = html.indexOf('data-testid="profile-follow-wallet-input"');
    const positionsHtml = html.slice(positionsStart, profileFormStart);
    expect(positionsHtml).toContain("Market");
    expect(positionsHtml).toContain("BTC/USD");
    expect(positionsHtml).not.toContain("Share BTC/USD UP call");
    expect(positionsHtml).not.toContain("0xaaaa...6666");
  });

  test("limits profile trade history with a show-more control", () => {
    const profileWallet = "0xaaaa222233334444555566667777888899990000111122223333444455556666";
    const html = renderToStaticMarkup(
      <ProfilePanel
        currentWalletAddress={null}
        followedWallets={[]}
        profileHistoryItems={Array.from({ length: 10 }, (_, index) =>
          portfolioHistoryItemFixture(index + 1),
        )}
        profileWallet={{
          displayName: "0xaaaa...6666",
          wallet: profileWallet,
        }}
        initialActivityTab="history"
        onFollowWallet={() => undefined}
        onSelectWallet={() => undefined}
        onUnfollowWallet={() => undefined}
      />,
    );

    expect(html).toContain('aria-pressed="false" data-testid="profile-positions-tab"');
    expect(html).toContain('aria-pressed="true" data-testid="profile-history-tab"');
    expect(html).toContain('data-testid="profile-trade-history"');
    expect(html).toContain("$60,001");
    expect(html).toContain("$60,008");
    expect(html).not.toContain("$60,009");
    expect(html).toContain('data-testid="profile-trade-history-show-more"');
    expect(html).toContain(">Show more</button>");
  });

  test("renders profile sparkline as last ten realized PNL", () => {
    const html = renderToStaticMarkup(
      <ProfilePanel
        currentWalletAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        followedWallets={[]}
        profileHistoryItems={Array.from({ length: 11 }, (_, index) => ({
          ...portfolioHistoryItemFixture(index + 1),
          pnlAtomic: index === 10 ? "-100000000" : "1000000",
          pnlLabel: index === 10 ? "-$100" : "+$1",
          pnlTone: index === 10 ? ("negative" as const) : ("positive" as const),
        }))}
        profileWallet={null}
        onFollowWallet={() => undefined}
        onSelectWallet={() => undefined}
        onUnfollowWallet={() => undefined}
      />,
    );

    expect(html).toContain("Last 10 PNL");
    expect(html).toContain("+$10.00");
    expect(html).not.toContain("-$90.00");
  });

  test("renders portfolio positions with a live countdown cue under 24h", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        nowMs={1_779_158_000_000}
        positions={[
          {
            actionLabel: "Redeem",
            closeValueLabel: "$2.41",
            closeValueAtomic: "2410000",
            closeValueStatusLabel: "Quoted now",
            costBasisAtomic: "1800000",
            costBasisLabel: "$1.80",
            direction: "UP",
            expiry: 1_779_159_800,
            expiryMs: 1_779_159_800_000,
            expiryTimeLabel: "Jun 12, 2026, 5:30 PM",
            id: "position-live-countdown",
            isExpired: false,
            managerId: "0xmanager",
            maxPayoutAtomic: "4000000",
            maxPayoutLabel: "$4",
            oracleId: "0xoracle",
            quantity: "4000000",
            statusLabel: "Open",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "30m left",
          },
        ]}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain("portfolio-countdown-live");
    expect(html).not.toContain(">Live</em>");
    expect(html).toContain("<strong>30m</strong>");
    expect(html).not.toContain("<small>Open</small>");
    expect(html).not.toContain("Quoted now");
    expect(html).not.toContain("<strong>Jun 12, 2026, 5:30 PM</strong>");
  });

  test("renders portfolio countdowns as danger under two minutes", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        nowMs={1_779_159_681_000}
        positions={[
          {
            actionLabel: "Redeem",
            closeValueLabel: "$2.41",
            closeValueAtomic: "2410000",
            closeValueStatusLabel: "Quoted now",
            costBasisAtomic: "1800000",
            costBasisLabel: "$1.80",
            direction: "UP",
            expiry: 1_779_159_800,
            expiryMs: 1_779_159_800_000,
            expiryTimeLabel: "Jun 12, 2026, 5:30 PM",
            id: "position-final-countdown",
            isExpired: false,
            managerId: "0xmanager",
            maxPayoutAtomic: "4000000",
            maxPayoutLabel: "$4",
            oracleId: "0xoracle",
            quantity: "4000000",
            statusLabel: "Open",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "30m left",
          },
        ]}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain("portfolio-countdown-live");
    expect(html).toContain("portfolio-countdown-danger");
    expect(html).toContain("<strong>2m</strong>");
  });

  test("filters market heat rows to followed wallets", () => {
    const rows = buildMarketHeatPreview(
      [
        {
          id: "followed-row",
          wallet: "0xaaaa222233334444555566667777888899990000",
          manager: "manager 0xaaaa...0000",
          market: "BTC-USD",
          side: "UP",
          strike: 62_500,
          expiryMs: 1_779_165_600_000,
          intervalLabel: "2h",
          observedAtMs: 1_779_158_000_000,
          heatScore: 37,
          status: "copy_ready",
        },
        {
          id: "other-row",
          wallet: "0xbbbb222233334444555566667777888899990000",
          manager: "manager 0xbbbb...0000",
          market: "BTC-USD",
          side: "DOWN",
          strike: 62_250,
          expiryMs: 1_779_165_600_000,
          intervalLabel: "2h",
          observedAtMs: 1_779_158_000_000,
          heatScore: 29,
          status: "copy_ready",
        },
      ],
      8,
      {
        nowMs: 1_779_158_000_000,
      },
    ).rows;

    expect(
      filterMarketHeatRowsByFollowedWallets(rows, [
        {
          displayName: "Followed",
          wallet: "0xAAAA222233334444555566667777888899990000",
        },
      ]).map((row) => row.id),
    ).toEqual(["followed-row"]);
    expect(filterMarketHeatRowsByFollowedWallets(rows, [])).toEqual([]);
  });

  test("renders portfolio positions with redeem and claim actions", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        positions={[
          {
            actionLabel: "Redeem",
            closeValueLabel: "$2.41",
            closeValueAtomic: "2410000",
            closeValueStatusLabel: "Quoted now",
            costBasisAtomic: "1800000",
            costBasisLabel: "$1.80",
            direction: "UP",
            copiedFromLabel: "Copied from 0xfeed...cafe",
            expiry: 1_779_193_600,
            expiryMs: 1_779_193_600_000,
            expiryTimeLabel: "May 18, 2026, 9:46 PM",
            id: "position-open",
            isExpired: false,
            managerId: "0xmanager",
            maxPayoutLabel: "$4",
            oracleId: "0xoracle",
            quantity: "4000000",
            statusLabel: "Open",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "1d left",
          },
          {
            actionLabel: "Claim",
            claimValueAtomic: "0",
            claimValueLabel: "$0",
            costBasisAtomic: "2500000",
            costBasisLabel: "$2.50",
            direction: "DOWN",
            expiry: 1_779_000_000,
            expiryMs: 1_779_000_000_000,
            expiryTimeLabel: "May 16, 2026, 7:00 PM",
            id: "position-expired",
            isExpired: true,
            managerId: "0xmanager",
            maxPayoutLabel: "$5",
            oracleId: "0xoracle",
            quantity: "5000000",
            outcomeLabel: "No payout",
            settlementPriceLabel: "$65,100.00",
            statusLabel: "Expired",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "Expired",
          },
        ]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="portfolio-view"');
    expect(html).toContain("Portfolio");
    expect(html).toContain("Redeem");
    expect(html).toContain("Claim");
    expect(html).toContain("$65,000.00");
    expect(html).toContain("Position</span>");
    expect(html).toContain("Now</span>");
    expect(html).toContain("Max</span>");
    expect(html).not.toContain("Est. close");
    expect(html).not.toContain("Max payout");
    expect(html).not.toContain("Quoted now");
    expect(html).toContain("Copied from 0xfeed...cafe");
    expect(html).toContain('portfolio-table-cell-positive">$2.41</span>');
    expect(html).toContain('portfolio-table-cell-negative">$0</span>');
    expect(html).toContain("$2.41");
    expect(html).toContain("$4");
    expect(html).not.toContain("No payout");
    expect(html).toContain("$65,100.00");
  });

  test("renders share card modal actions", () => {
    const card: ShareCardState = {
      blob: null,
      imageUrl: "data:image/png;base64,AAAA",
      input: {
        kind: "profile",
        title: "0x4a2c...9b9e",
        walletLabel: "0x4a2c...9b9e",
        walletAddress: "0x4a2cc121769d36c23dad6bb2b5382eb9aeb870fcf4022746b1aacb25948e9b9e",
        stats: [
          { label: "Heat", value: "82" },
          { label: "Win rate", value: "94%" },
          { label: "PnL", value: "+$24.69" },
        ],
        url: "http://127.0.0.1:5176",
      },
      text: "share text",
      xUrl: "https://twitter.com/intent/tweet?text=share",
    };
    const html = renderToStaticMarkup(
      <ShareCardModal
        card={card}
        onClose={() => undefined}
        onCopy={() => undefined}
        onShareToX={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="share-card-modal"');
    expect(html).toContain('data-testid="share-card-x"');
    expect(html).toContain('data-testid="share-card-copy"');
    expect(html).toContain("Profile ready for X");
    expect(html).toContain("Generated Hot Hands share card");
  });

  test("keeps empty portfolio copy sparse", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        positions={[]}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain("No open positions");
    expect(html).not.toContain("Live positions will appear here after you trade or copy a signal.");
  });

  test("renders zero-payout expired portfolio rows as dismissible", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        positions={[
          {
            actionLabel: "Dismiss",
            claimValueLabel: "$0",
            costBasisLabel: "$2.50",
            direction: "DOWN",
            dismissible: true,
            expiry: 1_779_000_000,
            expiryMs: 1_779_000_000_000,
            expiryTimeLabel: "May 16, 2026, 7:00 PM",
            id: "position-expired-zero",
            isExpired: true,
            managerId: "0xmanager",
            maxPayoutLabel: "$5",
            oracleId: "0xoracle",
            quantity: "5000000",
            outcomeLabel: "No payout",
            settlementPriceLabel: "$65,100.00",
            statusLabel: "Expired",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "Expired",
          },
        ]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onDismissPosition={() => undefined}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).not.toContain("No payout");
    expect(html).toContain("Dismiss</button>");
    expect(html).not.toContain("Claim</button>");
  });

  test("renders all-time portfolio history rows", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        historyItems={[
          {
            closeLabel: "Redeemed",
            costLabel: "$2",
            direction: "UP",
            expiryTimeLabel: "May 18, 2026, 9:46 PM",
            id: "history-redeemed",
            managerId: "0xmanager",
            openedAtLabel: "May 17, 2026, 7:33 AM",
            oracleId: "0xoracle",
            payoutLabel: "$3.25",
            pnlLabel: "+$1.25",
            pnlTone: "positive",
            quantityLabel: "$5",
            remainingLabel: "$123.45",
            statusLabel: "Redeemed",
            strikeLabel: "$65,000.00",
            updatedAtLabel: "May 17, 2026, 7:50 AM",
          },
        ]}
        initialTab="history"
        positions={[]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="portfolio-history-tab"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="portfolio-history"');
    expect(html).not.toContain("Trade history");
    expect(html).toContain("Position</span>");
    expect(html).toContain("$65,000.00");
    expect(html).not.toContain("Redeemed");
    expect(html).toContain("Cost</span>");
    expect(html).toContain("$2");
    expect(html).toContain("Payout</span>");
    expect(html).toContain("$3.25");
    expect(html).toContain("PNL</span>");
    expect(html).toContain('<strong>+$1.25</strong>');
    expect(html).toContain('portfolio-table-cell-positive">$3.25</span>');
    expect(html).toContain("portfolio-history-pnl-positive");
    expect(html).not.toContain("PNL</small>");
    expect(html).not.toContain("$123.45");
  });

  test("limits portfolio trade history with a show-more control", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        historyItems={Array.from({ length: 10 }, (_, index) =>
          portfolioHistoryItemFixture(index + 1),
        )}
        initialTab="history"
        positions={[]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="portfolio-history"');
    expect(html).toContain("$60,001");
    expect(html).toContain("$60,008");
    expect(html).not.toContain("$60,009");
    expect(html).toContain('data-testid="portfolio-history-show-more"');
    expect(html).toContain(">Show more</button>");
  });

  test("renders open portfolio history rows with a live countdown", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        historyItems={[
          {
            closeLabel: "Open",
            costLabel: "$4.97",
            direction: "UP",
            expiryTimeLabel: "Jun 12, 2026, 1:00 AM",
            id: "history-open",
            managerId: "0xmanager",
            openedAtLabel: "Jun 11, 2026, 1:00 PM",
            oracleId: "0xoracle",
            payoutLabel: "Pending",
            pnlLabel: "Open",
            pnlTone: "flat",
            quantityLabel: "$10.45",
            remainingLabel: "$10.45",
            statusLabel: "Open",
            strikeLabel: "$62,000.00",
            timeLabel: "8h left",
            updatedAtLabel: "Jun 11, 2026, 1:00 PM",
          },
        ]}
        initialTab="history"
        positions={[]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain("portfolio-countdown-live");
    expect(html).toContain("<strong>8h</strong>");
    expect(html).not.toContain("<small>Open</small>");
    expect(html).toContain('<span class="portfolio-table-cell portfolio-table-cell-flat">-</span>');
    expect(html).toContain('<div class="portfolio-history-pnl portfolio-history-pnl-flat"><strong>-</strong></div>');
    expect(html).not.toContain(">Pending<");
    expect(html).not.toContain("<strong>Open</strong>");
    expect(html).not.toContain("<strong>Jun 12, 2026, 1:00 AM</strong>");
  });

  test("renders portfolio time remaining from the current clock", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        nowMs={1_779_193_480_000}
        positions={[
          {
            actionLabel: "Redeem",
            closeValueLabel: "$2.41",
            costBasisLabel: "$1.80",
            direction: "UP",
            expiry: 1_779_193_600,
            expiryMs: 1_779_193_600_000,
            expiryTimeLabel: "May 18, 2026, 9:46 PM",
            id: "position-open",
            isExpired: false,
            managerId: "0xmanager",
            maxPayoutLabel: "$4",
            oracleId: "0xoracle",
            quantity: "4000000",
            statusLabel: "Open",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "1d left",
          },
        ]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain("portfolio-countdown-live");
    expect(html).toContain("<strong>2m</strong>");
    expect(html).not.toContain("<small>Open</small>");
    expect(html).not.toContain("<strong>May 18, 2026, 9:46 PM</strong>");
    expect(html).not.toContain("1d left");
  });

  test("renders just-expired portfolio rows as claimable from the current clock", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        nowMs={1_779_193_601_000}
        positions={[
          {
            actionLabel: "Redeem",
            closeValueLabel: "$2.41",
            closeValueStatusLabel: "Quoted now",
            costBasisLabel: "$1.80",
            direction: "UP",
            expiry: 1_779_193_600,
            expiryMs: 1_779_193_600_000,
            expiryTimeLabel: "May 18, 2026, 9:46 PM",
            id: "position-open",
            isExpired: false,
            managerId: "0xmanager",
            maxPayoutLabel: "$4",
            oracleId: "0xoracle",
            quantity: "4000000",
            statusLabel: "Open",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "1m left",
          },
        ]}
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).not.toContain("<small>Expired</small>");
    expect(html).not.toContain("Expired · Expired");
    expect(html).toContain("Pending");
    expect(html).toContain("Claim</button>");
    expect(html).not.toContain("Quoted now");
    expect(html).not.toContain("Redeem</button>");
  });

  test("shows unavailable instead of indefinite checking when an open close quote is missing", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        positions={[
          {
            actionLabel: "Redeem",
            costBasisLabel: "$1.80",
            direction: "UP",
            expiry: 1_779_193_600,
            expiryMs: 1_779_193_600_000,
            expiryTimeLabel: "May 18, 2026, 9:46 PM",
            id: "position-open",
            isExpired: false,
            managerId: "0xmanager",
            maxPayoutLabel: "$4",
            oracleId: "0xoracle",
            quantity: "4000000",
            statusLabel: "Open",
            strike: "65000000000",
            strikeLabel: "$65,000.00",
            timeLabel: "1d left",
          },
        ]}
        status="ready"
        walletActionPending={false}
        walletSubmittedPositionId={null}
        onPositionAction={() => undefined}
      />,
    );

    expect(html).toContain("Now");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Checking");
  });

  test("renders a standalone trade ticket for custom BTC bets", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-15m-71000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            roundLabel: "15m round",
            expiry: 1_779_165_900_000,
            expiryMs: 1_779_165_900_000,
            expiryTimeLabel: "May 18, 21:45 PDT",
            timeRemainingLabel: "15m left",
            strike: 71_000,
            strikeRaw: 71_000_000_000,
            strikeLabel: "$71,000",
            moneynessLabel: "-$50 vs spot",
            activityLabel: "3 wallets · 5 trades · $42.25",
            uniqueWalletCount: 3,
            tradeCount: 5,
            distinctStrikeCount: 2,
            volumeUsd: 42.25,
            volumeLabel: "$42.25",
            up: {
              walletCount: 2,
              tradeCount: 3,
              volumeUsd: 24,
              volumeLabel: "$24.00",
              estimatedPrice: 0.4,
            },
            down: {
              walletCount: 1,
              tradeCount: 2,
              volumeUsd: 18.25,
              volumeLabel: "$18.25",
            },
          },
          {
            id: "btc-2h-72000",
            oracleId: "0xoracle2h",
            pairLabel: "BTC/USD",
            intervalLabel: "2h",
            roundLabel: "2h round",
            expiry: 1_779_172_200_000,
            expiryMs: 1_779_172_200_000,
            expiryTimeLabel: "May 18, 23:30 PDT",
            timeRemainingLabel: "2h left",
            strike: 72_000,
            strikeRaw: 72_000_000_000,
            strikeLabel: "$72,000",
            moneynessLabel: "+$950 vs spot",
            activityLabel: "No recent trades",
            uniqueWalletCount: 0,
            tradeCount: 0,
            distinctStrikeCount: 0,
            volumeUsd: 0,
            volumeLabel: "$0",
            up: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
              estimatedPrice: 0.4,
            },
            down: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
          },
          {
            id: "btc-4h-73000",
            oracleId: "0xoracle4h",
            pairLabel: "BTC/USD",
            intervalLabel: "4h",
            roundLabel: "4h round",
            expiry: 1_779_179_400_000,
            expiryMs: 1_779_179_400_000,
            expiryTimeLabel: "May 19, 01:30 PDT",
            timeRemainingLabel: "4h left",
            strike: 73_000,
            strikeRaw: 73_000_000_000,
            strikeLabel: "$73,000",
            moneynessLabel: "+$1,950 vs spot",
            activityLabel: "1 wallet · 1 trade · $8.00",
            uniqueWalletCount: 1,
            tradeCount: 1,
            distinctStrikeCount: 1,
            volumeUsd: 8,
            volumeLabel: "$8",
            up: {
              walletCount: 1,
              tradeCount: 1,
              volumeUsd: 8,
              volumeLabel: "$8",
            },
            down: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
          },
        ]}
        copyAmount={100}
        customStrike={{
          marketId: "btc-2h-72000",
          strike: 72_000,
          strikeRaw: 72_000_000_000,
          strikeLabel: "$72,000",
        }}
        expiryOptions={[
          {
            count: 1,
            expiryMs: 1_779_165_900_000,
            label: "15m",
            marketId: "btc-15m-71000",
            oracleId: "0xoracle15",
            sublabel: "21:45 PDT",
            value: "15m",
          },
          {
            count: 1,
            expiryMs: 1_779_172_200_000,
            label: "1h",
            marketId: "btc-2h-72000",
            oracleId: "0xoracle2h",
            sublabel: "23:30 PDT",
            value: "1h",
          },
          {
            count: 0,
            expiryMs: 0,
            label: "1d",
            sublabel: "No market",
            value: "1d",
          },
        ]}
        selectedMarketId="btc-2h-72000"
        selectedExpiryDate="1h"
        selectedSide="UP"
        oracleChart={readyOracleChartFixture}
        oracleChartMarketContext={{
          expiryLabel: "May 18, 23:30 PDT",
          expiryMs: 1_779_172_200_000,
          selectedSide: "UP",
          selectedStrikeLabel: "$72,000",
          selectedStrikePrice: 72_000,
          strikes: [
            {
              id: "selected",
              label: "$72,000",
              price: 72_000,
              selected: true,
            },
          ],
          timeRemainingLabel: "2h left",
        }}
        nowMs={1_779_165_000_000}
        onAmountSet={() => undefined}
        onExpiryChange={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="trade-view"');
    expect(html).not.toContain('aria-label="Trade market duration"');
    expect(html).not.toContain('data-testid="trade-duration-all"');
    expect(html).toContain('aria-label="Trade expiration dates"');
    expect(html).toContain('data-testid="trade-expiry-15m"');
    expect(html).toContain('data-testid="trade-expiry-1h"');
    expect(html).toContain('data-testid="trade-expiry-1d"');
    expect(html).toContain("15m");
    expect(html).toContain("1h");
    expect(html).toContain("1d");
    expect(html).toContain('data-testid="trade-oracle-chart-panel"');
    expect(html.indexOf('data-testid="trade-oracle-chart-panel"')).toBeLessThan(
      html.indexOf('data-testid="trade-market-card"'),
    );
    expect(html).toContain("Choose market");
    expect(html.indexOf("Choose market")).toBeLessThan(
      html.indexOf('data-testid="trade-expiry-15m"'),
    );
    expect(html.indexOf('data-testid="trade-market-card"')).toBeLessThan(
      html.indexOf('data-testid="trade-expiry-15m"'),
    );
    expect(html).toContain("15:00");
    expect(html).toContain("2:00:00");
    expect(html).toContain('data-testid="oracle-chart-range-4H"');
    expect(html).not.toContain("Up/Down");
    expect(html).not.toContain("Range");
    expect(html).not.toContain('aria-label="Trade product type"');
    expect(html).toContain("BTC/USD");
    expect(html).not.toContain('aria-label="Trade expiration times"');
    expect(html).not.toContain("Market Ends");
    expect(html).not.toContain("23:30 PDT");
    expect(html).toContain('aria-label="Trade side"');
    expect(html).toContain('data-testid="trade-side-up"');
    expect(html).toContain('data-testid="trade-side-down"');
    expect(html).toContain('aria-label="UP payout profiles"');
    expect(html).not.toContain('aria-label="Up Down strike ladder"');
    expect(html).toContain("UP");
    expect(html).toContain("DOWN");
    expect(html).toContain('aria-label="Trade custom payout profile"');
    expect(html).not.toContain('aria-label="Trade DOWN $72,000"');
    expect(html).toContain("2h");
    expect(html).toContain("Selected");
    expect(html).toContain("UP $72,000");
    expect(html).not.toContain("Wins if BTC settles");
    expect(html).not.toContain("vs spot");
    expect(html).not.toContain("Live market");
    expect(html).toContain("Buy</small>$100");
    expect(html).toContain("To win</small>$250");
    expect(html).toContain('class="trade-ticket-metric-win"><small>To win</small>$250');
    expect(html).not.toContain("Max profit</small>+$150");
    expect(html).not.toContain("May 18, 23:30 PDT");
    expect(html).not.toContain("Trade this market");
    expect(html).not.toContain('data-testid="trade-row-ticket"');
    expect(html).not.toContain('data-testid="trade-strike-select"');
    expect(html).toContain("Connect wallet first");
    expect(html).not.toContain("Predict account");
    expect(html).not.toContain('data-testid="predict-manager-object-id"');
  });

  test("renders three payout profile choices instead of a full strike list", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-15m-71000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            roundLabel: "15m round",
            expiry: 1_779_165_900_000,
            expiryMs: 1_779_165_900_000,
            expiryTimeLabel: "May 18, 21:45 PDT",
            timeRemainingLabel: "15m left",
            strike: 71_000,
            strikeRaw: 71_000_000_000,
            strikeLabel: "$71,000",
            moneynessLabel: "-$50 vs spot",
            activityLabel: "3 wallets · 5 trades · $42.25",
            uniqueWalletCount: 3,
            tradeCount: 5,
            distinctStrikeCount: 2,
            volumeUsd: 42.25,
            volumeLabel: "$42.25",
            strikeOptions: [
              {
                profile: "standard",
                strike: 71_000,
                strikeRaw: 71_000_000_000,
                strikeLabel: "$71,000",
                targetPrice: 0.5,
                upEstimatedPrice: 0.48,
                downEstimatedPrice: 0.52,
              },
              {
                profile: "conservative",
                strike: 71_050,
                strikeRaw: 71_050_000_000,
                strikeLabel: "$71,050",
                targetPrice: 0.67,
                upEstimatedPrice: 0.62,
                downEstimatedPrice: 0.38,
              },
              {
                profile: "risky",
                strike: 71_120,
                strikeRaw: 71_120_000_000,
                strikeLabel: "$71,120",
                targetPrice: 0.25,
                upEstimatedPrice: 0.28,
                downEstimatedPrice: 0.72,
              },
            ],
            up: {
              walletCount: 2,
              tradeCount: 3,
              volumeUsd: 24,
              volumeLabel: "$24.00",
              estimatedPrice: 0.4,
            },
            down: {
              walletCount: 1,
              tradeCount: 2,
              volumeUsd: 18.25,
              volumeLabel: "$18.25",
            },
          },
        ]}
        copyAmount={100}
        selectedMarketId="btc-15m-71000"
        selectedSide="UP"
        customStrike={{
          marketId: "btc-15m-71000",
          profile: "conservative",
          strike: 71_050,
          strikeRaw: 71_050_000_000,
          strikeLabel: "$71,050",
          targetPrice: 0.67,
          payoutMultiple: 1.5,
          upEstimatedPrice: 0.62,
          downEstimatedPrice: 0.38,
        }}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Trade standard payout profile"');
    expect(html).toContain('aria-label="Trade conservative payout profile"');
    expect(html).toContain('aria-label="Trade high payout profile"');
    expect(html).toContain("Standard");
    expect(html).toContain("Conservative");
    expect(html).toContain("High payout");
    expect(html).toContain("2.1x");
    expect(html).toContain("1.6x");
    expect(html).toContain("3.6x");
    expect(html).not.toContain("2.1x payout");
    expect(html).toContain("$71,000");
    expect(html).toContain("$71,050");
    expect(html).toContain("$71,120");
    expect(html).toContain(
      'class="direction-pill direction-pill-up trade-chain-direction-pill">UP</span>',
    );
    expect(html).not.toContain("<small>Strike</small>");
    expect(html).not.toContain("Wins if BTC settles");
    expect(html).not.toContain("vs spot");
    expect(html).not.toContain("$0.40");
    expect(html).not.toContain("Pays $250");
    expect(html).toContain("To win</small>$161.29");
    expect(html).toContain('class="trade-ticket-metric-win"><small>To win</small>$161.29');
    expect(html).not.toContain("Max profit</small>+$61.29");
    expect(html).not.toContain("To win</small>$250");
    expect(html).not.toContain('data-testid="trade-strike-select"');
    expect(html).not.toContain('data-testid="trade-custom-strike"');
  });

  test("uses the DOWN pill for down payout profiles while keeping positive payout copy green", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          tradeMarketRowFixture({
            id: "btc-15m-down-profile",
            strike: 71_000,
            strikeLabel: "$71,000",
            strikeRaw: 71_000_000_000,
            strikeOptions: [
              {
                profile: "standard",
                strike: 71_000,
                strikeRaw: 71_000_000_000,
                strikeLabel: "$71,000",
                targetPrice: 0.5,
                upEstimatedPrice: 0.45,
                downEstimatedPrice: 0.55,
              },
            ],
          }),
        ]}
        copyAmount={25}
        selectedMarketId="btc-15m-down-profile"
        selectedSide="DOWN"
        customStrike={{
          marketId: "btc-15m-down-profile",
          profile: "standard",
          strike: 71_000,
          strikeRaw: 71_000_000_000,
          strikeLabel: "$71,000",
          targetPrice: 0.5,
          payoutMultiple: 2,
          upEstimatedPrice: 0.45,
          downEstimatedPrice: 0.55,
        }}
        quote={{
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "0xoracle",
          expiry: "1779165900000",
          strike: "71000000000",
          side: "DOWN",
          requestedSpendUsd: 25,
          cost: "25000000",
          costUsd: 25,
          quantity: "45454545",
          payoutUsd: 45.45,
          maxProfitUsd: 20.45,
          redeemPayout: "25000000",
          redeemPayoutUsd: 25,
          effectivePrice: 0.55,
          quoteStatus: "ready",
        }}
        quoteStatus="ready"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain(
      'class="direction-pill direction-pill-down trade-chain-direction-pill">DOWN</span>',
    );
    expect(html).not.toContain("<small>Strike</small>");
    expect(html).toContain('class="trade-ticket-metric-win"><small>To win</small>$45.45');
  });

  test("toggles an open trade row closed when the selected row is tapped again", () => {
    const selected = {
      marketId: "btc-15m-71000",
      profile: "standard" as const,
      strike: 71_000,
      strikeLabel: "$71,000",
      strikeRaw: 71_000_000_000,
    };

    expect(shouldToggleTradeMarketSelectionClosed(selected, selected)).toBe(true);
    expect(
      shouldToggleTradeMarketSelectionClosed(selected, {
        ...selected,
        strike: 70_950,
        strikeLabel: "$70,950",
        strikeRaw: 70_950_000_000,
      }),
    ).toBe(true);
    expect(
      shouldToggleTradeMarketSelectionClosed(selected, {
        ...selected,
        profile: "conservative",
        strikeRaw: 70_500_000_000,
      }),
    ).toBe(false);
    expect(shouldToggleTradeMarketSelectionClosed(null, selected)).toBe(false);
  });

  test("clears open trade row selections when leaving Trade", () => {
    const selected = {
      marketId: "btc-15m-71000",
      profile: "standard" as const,
      strike: 71_000,
      strikeLabel: "$71,000",
      strikeRaw: 71_000_000_000,
    };
    const selections = { [selected.marketId]: selected };

    expect(pruneTradeSelectionsForView("trade", selections)).toBe(selections);
    expect(pruneTradeSelectionsForView("feed", selections)).toEqual({});
  });

  test("keeps strike rows unselected until the user picks one", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          tradeMarketRowFixture({
            id: "btc-jun12-0100",
            strike: 62_000,
            strikeLabel: "$62,000",
            strikeRaw: 62_000_000_000,
            strikeOptions: [
              {
                profile: "standard",
                strike: 62_000,
                strikeLabel: "$62,000",
                strikeRaw: 62_000_000_000,
                targetPrice: 0.5,
              },
              {
                profile: "conservative",
                strike: 62_100,
                strikeLabel: "$62,100",
                strikeRaw: 62_100_000_000,
                targetPrice: 0.67,
              },
              {
                profile: "risky",
                strike: 62_200,
                strikeLabel: "$62,200",
                strikeRaw: 62_200_000_000,
                targetPrice: 0.25,
              },
            ],
          }),
        ]}
        copyAmount={25}
        selectedMarketId="btc-jun12-0100"
        selectedSide="UP"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Trade standard payout profile"');
    expect(html).toContain('aria-label="Trade conservative payout profile"');
    expect(html).toContain('aria-label="Trade high payout profile"');
    expect(html).not.toContain('aria-label="Selected position"');
    expect(html).not.toContain("Buy</small>");
    expect(html).not.toContain('data-testid="trade-wallet-submit"');
    expect(html).not.toContain("trade-chain-row-up selected");
  });

  test("renders only the selected market for a canonical bucket", () => {
    const earlyMarket = tradeMarketRowFixture({
      id: "btc-jun12-0100",
      expiryMs: new Date(2026, 5, 12, 1).getTime(),
      expiryTimeLabel: "Jun 12, 01:00 PDT",
      intervalLabel: "23d",
      timeRemainingLabel: "8h left",
      strike: 62_000,
      strikeLabel: "$62,000",
      strikeRaw: 62_000_000_000,
      strikeOptions: [
        {
          strike: 62_000,
          strikeLabel: "$62,000",
          strikeRaw: 62_000_000_000,
        },
      ],
    });
    const laterMarket = tradeMarketRowFixture({
      id: "btc-jun12-0500",
      expiryMs: new Date(2026, 5, 12, 5).getTime(),
      expiryTimeLabel: "Jun 12, 05:00 PDT",
      intervalLabel: "23d",
      timeRemainingLabel: "12h left",
      strike: 63_000,
      strikeLabel: "$63,000",
      strikeRaw: 63_000_000_000,
      strikeOptions: [
        {
          strike: 63_000,
          strikeLabel: "$63,000",
          strikeRaw: 63_000_000_000,
        },
      ],
    });
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[laterMarket, earlyMarket]}
        copyAmount={25}
        selectedMarketId={earlyMarket.id}
        selectedSide="UP"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html.match(/data-testid="trade-market-card"/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('aria-label="Trade expiration times"');
    expect(html).not.toContain("Market Ends");
    expect(html).not.toContain("01:00 PDT");
    expect(html).not.toContain("05:00 PDT");
    expect(html).toContain("$62,000");
    expect(html).not.toContain("$63,000");
  });

  test("keeps payout profile choices compact around the active market", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-15m-73000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            roundLabel: "15m round",
            expiry: 1_779_165_900_000,
            expiryMs: 1_779_165_900_000,
            expiryTimeLabel: "May 18, 21:45 PDT",
            timeRemainingLabel: "15m left",
            strike: 73_000,
            strikeRaw: 73_000_000_000,
            strikeLabel: "$73,000",
            moneynessLabel: "At spot",
            activityLabel: "6 strikes",
            uniqueWalletCount: 4,
            tradeCount: 12,
            distinctStrikeCount: 6,
            volumeUsd: 120,
            volumeLabel: "$120",
            strikeOptions: [
              {
                profile: "standard",
                strike: 73_000,
                strikeRaw: 73_000_000_000,
                strikeLabel: "$73,000",
                targetPrice: 0.5,
                payoutMultiple: 2,
              },
              {
                profile: "conservative",
                strike: 72_500,
                strikeRaw: 72_500_000_000,
                strikeLabel: "$72,500",
                targetPrice: 0.67,
                payoutMultiple: 1.5,
              },
              {
                profile: "risky",
                strike: 73_750,
                strikeRaw: 73_750_000_000,
                strikeLabel: "$73,750",
                targetPrice: 0.25,
                payoutMultiple: 4,
              },
            ],
            up: {
              walletCount: 2,
              tradeCount: 6,
              volumeUsd: 60,
              volumeLabel: "$60",
            },
            down: {
              walletCount: 2,
              tradeCount: 6,
              volumeUsd: 60,
              volumeLabel: "$60",
            },
          },
        ]}
        copyAmount={25}
        selectedMarketId="btc-15m-73000"
        selectedSide="UP"
        customStrike={{
          marketId: "btc-15m-73000",
          profile: "standard",
          strike: 73_000,
          strikeRaw: 73_000_000_000,
          strikeLabel: "$73,000",
          targetPrice: 0.5,
          payoutMultiple: 2,
        }}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Trade standard payout profile"');
    expect(html).toContain('aria-label="Trade conservative payout profile"');
    expect(html).toContain('aria-label="Trade high payout profile"');
    expect(html.match(/aria-label="Trade [^"]+ payout profile"/g) ?? []).toHaveLength(3);
    expect(html).toContain("2x");
    expect(html).toContain("1.5x");
    expect(html).toContain("4x");
    expect(html).not.toContain("2x payout");
  });

  test("keeps selected payout profiles live as pricing refreshes", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          tradeMarketRowFixture({
            id: "btc-15m-live-profile",
            strike: 72_900,
            strikeLabel: "$72,900",
            strikeRaw: 72_900_000_000,
            strikeOptions: [
              {
                profile: "standard",
                strike: 72_900,
                strikeRaw: 72_900_000_000,
                strikeLabel: "$72,900",
                targetPrice: 0.5,
                payoutMultiple: 2,
              },
              {
                profile: "conservative",
                strike: 72_700,
                strikeRaw: 72_700_000_000,
                strikeLabel: "$72,700",
                targetPrice: 2 / 3,
                payoutMultiple: 1.5,
              },
              {
                profile: "risky",
                strike: 73_250,
                strikeRaw: 73_250_000_000,
                strikeLabel: "$73,250",
                targetPrice: 0.25,
                payoutMultiple: 4,
              },
            ],
          }),
        ]}
        copyAmount={25}
        selectedMarketId="btc-15m-live-profile"
        selectedSide="UP"
        customStrike={{
          marketId: "btc-15m-live-profile",
          profile: "standard",
          strike: 73_000,
          strikeRaw: 73_000_000_000,
          strikeLabel: "$73,000",
          targetPrice: 0.5,
          payoutMultiple: 2,
        }}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('class="trade-chain-row trade-chain-row-up selected"');
    expect(html).toContain("UP Standard");
    expect(html).toContain("$72,900 · 2x");
    expect(html).not.toContain("$73,000 · 2x");
  });

  test("resolves selected payout profiles before building chart context", () => {
    const market = tradeMarketRowFixture({
      id: "btc-15m-live-chart-profile",
      strike: 72_900,
      strikeLabel: "$72,900",
      strikeRaw: 72_900_000_000,
      strikeOptions: [
        {
          profile: "standard",
          strike: 72_900,
          strikeRaw: 72_900_000_000,
          strikeLabel: "$72,900",
          targetPrice: 0.5,
          payoutMultiple: 2,
        },
        {
          profile: "conservative",
          strike: 72_700,
          strikeRaw: 72_700_000_000,
          strikeLabel: "$72,700",
          targetPrice: 2 / 3,
          payoutMultiple: 1.5,
        },
      ],
    });

    const { selectedCustomStrike, selectedMarket } = resolveSelectedTradeMarketForSelection({
      customStrike: {
        marketId: "btc-15m-live-chart-profile",
        profile: "standard",
        strike: 73_000,
        strikeRaw: 73_000_000_000,
        strikeLabel: "$73,000",
        targetPrice: 0.5,
        payoutMultiple: 2,
      },
      market,
      side: "UP",
      spotPriceLabel: "$72,850",
    });

    expect(selectedCustomStrike?.strikeLabel).toBe("$72,900");
    expect(selectedMarket?.strikeLabel).toBe("$72,900");
    expect(selectedMarket?.strikeRaw).toBe(72_900_000_000);
  });

  test("keeps the payout profile picker free of oracle price divider rows", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketPriceLabel="$76,000"
        marketRows={[
          {
            id: "btc-15m-73000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            roundLabel: "15m round",
            expiry: 1_779_165_900_000,
            expiryMs: 1_779_165_900_000,
            expiryTimeLabel: "May 18, 21:45 PDT",
            timeRemainingLabel: "15m left",
            strike: 73_000,
            strikeRaw: 73_000_000_000,
            strikeLabel: "$73,000",
            moneynessLabel: "At spot",
            activityLabel: "6 strikes",
            uniqueWalletCount: 4,
            tradeCount: 12,
            distinctStrikeCount: 6,
            volumeUsd: 120,
            volumeLabel: "$120",
            strikeOptions: [70_000, 71_000, 72_000, 73_000, 74_000, 75_000].map(
              (strike) => ({
                strike,
                strikeRaw: strike * 1_000_000,
                strikeLabel: `$${strike.toLocaleString("en-US")}`,
              }),
            ),
            up: {
              walletCount: 2,
              tradeCount: 6,
              volumeUsd: 60,
              volumeLabel: "$60",
            },
            down: {
              walletCount: 2,
              tradeCount: 6,
              volumeUsd: 60,
              volumeLabel: "$60",
            },
          },
        ]}
        copyAmount={25}
        selectedMarketId="btc-15m-73000"
        selectedSide="UP"
        customStrike={{
          marketId: "btc-15m-73000",
          strike: 73_000,
          strikeRaw: 73_000_000_000,
          strikeLabel: "$73,000",
        }}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Pick your strike");
    expect(html).toContain("Selected strike");
    expect(html).toContain("$73,000");
    expect(html).not.toContain("Oracle price $76,000");
    expect(html).not.toContain("trade-spot-line");
  });

  test("keeps the selected strike option visible when live strike options refresh", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-15m-71000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            roundLabel: "15m round",
            expiry: 1_779_165_900_000,
            expiryMs: 1_779_165_900_000,
            expiryTimeLabel: "May 18, 21:45 PDT",
            timeRemainingLabel: "15m left",
            strike: 71_100,
            strikeRaw: 71_100_000_000,
            strikeLabel: "$71,100",
            moneynessLabel: "+$50 vs spot",
            activityLabel: "No recent trades",
            uniqueWalletCount: 0,
            tradeCount: 0,
            distinctStrikeCount: 1,
            volumeUsd: 0,
            volumeLabel: "$0",
            strikeOptions: [
              {
                strike: 71_100,
                strikeRaw: 71_100_000_000,
                strikeLabel: "$71,100",
              },
            ],
            up: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
            down: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
          },
        ]}
        copyAmount={25}
        selectedMarketId="btc-15m-71000"
        selectedSide="UP"
        customStrike={{
          marketId: "btc-15m-71000",
          strike: 71_050,
          strikeRaw: 71_050_000_000,
          strikeLabel: "$71,050",
        }}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Trade custom payout profile"');
    expect(html).toContain("$71,050");
    expect(html).toContain("$71,100");
    expect(html).not.toContain("<option");
  });

  test("prompts connected users to create a Predict account from the wallet bar", () => {
    const html = renderToStaticMarkup(
      <WalletStatusBar
        accountAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        connectionStatus="connected"
        networkLabel="testnet"
        predictManagerObjectId={null}
        predictManagerStatus="missing"
        txState={{ status: "idle", label: "Wallet ready", digest: null }}
        walletCount={1}
        walletName="Sui Wallet"
        onConnect={() => undefined}
        onCreatePredictManager={() => undefined}
        onDisconnect={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="predict-manager-status"');
    expect(html).toContain("No Predict account yet");
    expect(html).toContain('data-testid="create-predict-manager"');
    expect(html).toContain("Create Predict account");
  });

  test("hides a discovered Predict account from the connected wallet bar", () => {
    const html = renderToStaticMarkup(
      <WalletStatusBar
        accountAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        connectionStatus="connected"
        networkLabel="testnet"
        predictManagerObjectId="0x000000000000000000000000000000000000000000000000000000000000bbbb"
        predictManagerStatus="ready"
        txState={{ status: "idle", label: "Wallet ready", digest: null }}
        walletCount={1}
        walletName="Sui Wallet"
        onConnect={() => undefined}
        onCreatePredictManager={() => undefined}
        onDisconnect={() => undefined}
      />,
    );

    expect(html).toBe("");
  });

  test("labels dev wallet override as read-only and hides account creation", () => {
    const headerHtml = renderToStaticMarkup(
      <WalletHeaderControl
        accountAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        connectionStatus="readonly"
        readOnly={true}
        walletCount={1}
        onConnect={() => undefined}
        onDisconnect={() => undefined}
      />,
    );
    const statusHtml = renderToStaticMarkup(
      <WalletStatusBar
        accountAddress="0x00000000000000000000000000000000000000000000000000000000000000aa"
        connectionStatus="readonly"
        networkLabel="testnet"
        predictManagerObjectId="0x000000000000000000000000000000000000000000000000000000000000bbbb"
        predictManagerStatus="ready"
        readOnly={true}
        txState={{ status: "idle", label: "Wallet ready", digest: null }}
        walletCount={1}
        walletName="Read-only wallet"
        onConnect={() => undefined}
        onCreatePredictManager={() => undefined}
        onDisconnect={() => undefined}
      />,
    );

    expect(headerHtml).toContain("Read-only");
    expect(headerHtml).toContain('data-testid="wallet-readonly"');
    expect(statusHtml).toBe("");
  });

  test("keeps return fields visible when a trade market still needs a quote", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-2h-72000",
            oracleId: "0xoracle2h",
            pairLabel: "BTC/USD",
            intervalLabel: "2h",
            roundLabel: "2h round",
            expiry: 1_779_172_200_000,
            expiryMs: 1_779_172_200_000,
            expiryTimeLabel: "May 18, 23:30 PDT",
            timeRemainingLabel: "2h left",
            strike: 72_000,
            strikeRaw: 72_000_000_000,
            strikeLabel: "$72,000",
            moneynessLabel: "+$950 vs spot",
            activityLabel: "No recent trades",
            uniqueWalletCount: 0,
            tradeCount: 0,
            distinctStrikeCount: 0,
            volumeUsd: 0,
            volumeLabel: "$0",
            up: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
            down: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
          },
        ]}
        copyAmount={25}
        customStrike={{
          marketId: "btc-2h-72000",
          strike: 72_000,
          strikeRaw: 72_000_000_000,
          strikeLabel: "$72,000",
        }}
        selectedMarketId="btc-2h-72000"
        selectedSide="UP"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Buy</small>$25");
    expect(html).toContain("To win</small>Quote needed");
    expect(html).not.toContain("Max profit</small>Quote needed");
    expect(html).toContain("Connect wallet first");
  });

  test("renders a live quote result in the trade ticket", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-2h-72000",
            oracleId: "0xoracle2h",
            pairLabel: "BTC/USD",
            intervalLabel: "2h",
            roundLabel: "2h round",
            expiry: 1_779_172_200_000,
            expiryMs: 1_779_172_200_000,
            expiryTimeLabel: "May 18, 23:30 PDT",
            timeRemainingLabel: "2h left",
            strike: 72_000,
            strikeRaw: 72_000_000_000,
            strikeLabel: "$72,000",
            moneynessLabel: "+$950 vs spot",
            activityLabel: "No recent trades",
            uniqueWalletCount: 0,
            tradeCount: 0,
            distinctStrikeCount: 0,
            volumeUsd: 0,
            volumeLabel: "$0",
            up: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
            down: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
          },
        ]}
        copyAmount={25}
        customStrike={{
          marketId: "btc-2h-72000",
          strike: 72_000,
          strikeRaw: 72_000_000_000,
          strikeLabel: "$72,000",
        }}
        selectedMarketId="btc-2h-72000"
        selectedSide="UP"
        quote={{
          source: "live_testnet",
          market: "BTC-USD",
          oracleId: "0xoracle2h",
          expiry: "1779172200000",
          strike: "72000000000",
          side: "UP",
          requestedSpendUsd: 25,
          cost: "24980000",
          costUsd: 24.98,
          quantity: "49960000",
          payoutUsd: 49.96,
          maxProfitUsd: 24.98,
          redeemPayout: "24100000",
          redeemPayoutUsd: 24.1,
          effectivePrice: 0.5,
          quoteStatus: "ready",
        }}
        quoteStatus="ready"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Buy</small>$24.98");
    expect(html).not.toContain("$0.50");
    expect(html).not.toContain("Pays $49.96");
    expect(html).toContain("To win</small>$49.96");
    expect(html).toContain('class="trade-ticket-metric-win"><small>To win</small>$49.96');
    expect(html).not.toContain("Max profit</small>+$24.98");
  });

  test("keeps wallet submit enabled while a fresh quote is loading", () => {
    const html = renderToStaticMarkup(
      <TradeTicket
        marketRows={[
          {
            id: "btc-2h-72000",
            oracleId: "0xoracle2h",
            pairLabel: "BTC/USD",
            intervalLabel: "2h",
            roundLabel: "2h round",
            expiry: 1_779_172_200_000,
            expiryMs: 1_779_172_200_000,
            expiryTimeLabel: "May 18, 23:30 PDT",
            timeRemainingLabel: "2h left",
            strike: 72_000,
            strikeRaw: 72_000_000_000,
            strikeLabel: "$72,000",
            moneynessLabel: "+$950 vs spot",
            activityLabel: "No recent trades",
            uniqueWalletCount: 0,
            tradeCount: 0,
            distinctStrikeCount: 0,
            volumeUsd: 0,
            volumeLabel: "$0",
            up: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
            down: {
              walletCount: 0,
              tradeCount: 0,
              volumeUsd: 0,
              volumeLabel: "$0",
            },
          },
        ]}
        copyAmount={25}
        customStrike={{
          marketId: "btc-2h-72000",
          strike: 72_000,
          strikeRaw: 72_000_000_000,
          strikeLabel: "$72,000",
        }}
        selectedMarketId="btc-2h-72000"
        selectedSide="UP"
        quote={null}
        quoteStatus="loading"
        predictManagerObjectId="0x1111"
        walletConnected={true}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain(">Confirm transaction</button>");
    expect(html).not.toContain("Send to wallet");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("Wait for quote");
    expect(html).not.toContain("Trade transaction sent.");
    expect(html).not.toContain("Wallet request started");
  });

  test("keeps portfolio wallet notifications in the toast layer", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
        positions={[
          {
            id: "portfolio-open-1",
            direction: "UP",
            oracleId: "0xoracle",
            expiry: "1779158400000",
            expiryMs: 1_779_158_400_000,
            strike: "71000000000",
            strikeLabel: "$71,000",
            quantity: "1000000",
            costBasisAtomic: 1_000_000n,
            costBasisLabel: "$1",
            maxPayoutAtomic: 2_000_000n,
            maxPayoutLabel: "$2",
            timeLabel: "8m left",
            statusLabel: "Open",
            isExpired: false,
            actionLabel: "Redeem",
          },
        ]}
        nowMs={1_779_157_900_000}
        walletActionPending={false}
        walletSubmittedPositionId="portfolio-open-1"
        onPositionAction={() => undefined}
      />,
    );

    expect(html).not.toContain("Wallet request started");
  });
});
