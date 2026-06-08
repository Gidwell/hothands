import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AccountSummary,
  BottomNav,
  MarketHeader,
  PortfolioPanel,
  TradeTicket,
  WalletHeaderControl,
  WalletStatusBar,
  buildTradeQuoteKey,
  shouldShowAccountSummary,
} from "../src/App";

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

  const props = node.props as { children?: ReactNode; "data-testid"?: string };
  if (props["data-testid"] === testId) {
    return node;
  }

  return findElementByTestId(props.children, testId);
}

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
            readOnly={false}
            walletCount={1}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
          />
        }
      />,
    );

    expect(html).toContain('data-testid="wallet-address"');
    expect(html).toContain("0x0000...00aa");
    expect(html).toContain("Connected");
  });

  test("shows account summary only on trade and portfolio views", () => {
    expect(shouldShowAccountSummary("feed")).toBe(false);
    expect(shouldShowAccountSummary("leaderboards")).toBe(false);
    expect(shouldShowAccountSummary("trade")).toBe(true);
    expect(shouldShowAccountSummary("portfolio")).toBe(true);
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

  test("renders available wallet balance separately from Predict bankroll with a deposit action", () => {
    let depositClicked = false;
    const html = renderToStaticMarkup(
      <AccountSummary
        availableLabel="$42"
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
        onDepositAmountChange={() => undefined}
      />,
    );

    expect(depositClicked).toBe(false);
    expect(html).toContain('aria-label="Account summary"');
    expect(html).toContain("All-time PNL");
    expect(html).toContain("Available");
    expect(html).toContain('data-testid="available-wallet-balance"');
    expect(html).toContain("$42");
    expect(html).toContain("Bankroll");
    expect(html).toContain('data-testid="predict-bankroll-balance"');
    expect(html).toContain("$12.50");
    expect(html).toContain('aria-label="Deposit amount"');
    expect(html).toContain('data-testid="deposit-bankroll-amount"');
    expect(html).toContain('value="75"');
    expect(html).toContain('data-testid="deposit-bankroll"');
    expect(html).toContain("Deposit");
  });

  test("wires the custom deposit amount input", () => {
    let changedAmount = 0;
    const tree = AccountSummary({
      depositAmount: 25,
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
      onDepositAmountChange: (amount) => {
        changedAmount = amount;
      },
    });

    const input = findElementByTestId(tree, "deposit-bankroll-amount");
    expect(input).not.toBeNull();
    const props = input?.props as {
      onChange?: (event: { currentTarget: { value: string } }) => void;
      value?: number;
    };

    expect(props.value).toBe(25);
    props.onChange?.({ currentTarget: { value: "12.34" } });
    expect(changedAmount).toBe(12.34);
  });

  test("renders bottom navigation tabs in primary product order", () => {
    const html = renderToStaticMarkup(
      <BottomNav activeView="feed" onViewChange={() => undefined} />,
    );

    expect(html).toContain('data-testid="bottom-nav"');
    expect(html).toContain('class="bottom-nav-icon"');
    expect(html).toContain("<span>Feed</span>");
    expect(html).toContain("<span>Trade</span>");
    expect(html).toContain("<span>Leaders</span>");
    expect(html).toContain("<span>Portfolio</span>");
    expect(html.indexOf("<span>Feed</span>")).toBeLessThan(html.indexOf("<span>Leaders</span>"));
    expect(html.indexOf("<span>Leaders</span>")).toBeLessThan(html.indexOf("<span>Trade</span>"));
    expect(html.indexOf("<span>Trade</span>")).toBeLessThan(html.indexOf("<span>Portfolio</span>"));
    expect(html).toContain('aria-pressed="true"');
  });

  test("renders portfolio positions with redeem and claim actions", () => {
    const html = renderToStaticMarkup(
      <PortfolioPanel
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
            timeLabel: "1d left",
          },
          {
            actionLabel: "Claim",
            claimValueLabel: "$0",
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
    expect(html).toContain("Est. close");
    expect(html).toContain("Quoted now");
    expect(html).toContain("$2.41");
    expect(html).toContain("$4");
    expect(html).toContain("No payout");
    expect(html).toContain("$65,100.00");
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

    expect(html).toContain("No payout");
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
    expect(html).toContain("Trade history");
    expect(html).toContain("BTC/USD");
    expect(html).toContain("$65,000.00");
    expect(html).toContain("Redeemed");
    expect(html).toContain("Cost</span>");
    expect(html).toContain("$2");
    expect(html).toContain("Payout</span>");
    expect(html).toContain("$3.25");
    expect(html).toContain("PNL</small><strong>+$1.25");
    expect(html).not.toContain("$123.45");
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

    expect(html).toContain("Open · 2m left");
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

    expect(html).toContain("<small>Expired</small>");
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

    expect(html).toContain("Est. close");
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
        durationOptions={[
          { count: 1, label: "15m", value: "15m" },
          { count: 1, label: "1h", value: "1h" },
          { count: 1, label: "1d", value: "1d" },
        ]}
        expiryOptions={[
          {
            count: 2,
            expiryMs: 1_779_165_900_000,
            label: "May 18",
            sublabel: "15m, 2h",
            value: "2026-05-18",
          },
          {
            count: 1,
            expiryMs: 1_779_179_400_000,
            label: "May 19",
            sublabel: "Tomorrow · 4h",
            value: "2026-05-19",
          },
        ]}
        selectedMarketId="btc-2h-72000"
        selectedDuration="1h"
        selectedExpiryDate="2026-05-18"
        selectedSide="UP"
        onAmountSet={() => undefined}
        onDurationChange={() => undefined}
        onExpiryChange={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="trade-view"');
    expect(html).toContain('aria-label="Trade market duration"');
    expect(html).toContain('data-testid="trade-duration-all"');
    expect(html).toContain('data-testid="trade-duration-15m"');
    expect(html).toContain('data-testid="trade-duration-1h"');
    expect(html).toContain('data-testid="trade-duration-1d"');
    expect(html).not.toContain('data-testid="trade-duration-4d"');
    expect(html).toContain('aria-label="Trade expiration dates"');
    expect(html).toContain('data-testid="trade-expiry-2026-05-18"');
    expect(html).toContain('data-testid="trade-expiry-2026-05-19"');
    expect(html).toContain("May 18");
    expect(html).toContain("May 19");
    expect(html.indexOf('aria-label="Trade market duration"')).toBeLessThan(
      html.indexOf('aria-label="Trade expiration dates"'),
    );
    expect(html).toContain("Up/Down");
    expect(html).not.toContain("Range");
    expect(html).not.toContain('aria-label="Trade product type"');
    expect(html).toContain("BTC strike ladder");
    expect(html).toContain('aria-label="Up Down strike ladder"');
    expect(html).toContain("UP");
    expect(html).toContain("DOWN");
    expect(html).toContain("15m left");
    expect(html).toContain('aria-label="Trade UP $72,000"');
    expect(html).toContain('aria-label="Trade DOWN $72,000"');
    expect(html).toContain("1d");
    expect(html).toContain("Selected");
    expect(html).toContain("UP $72,000");
    expect(html).toContain("Wins if BTC settles above $72,000");
    expect(html).toContain("Spend</small>$100");
    expect(html).toContain("Est. payout</small>$250");
    expect(html).toContain("Max profit</small>+$150");
    expect(html).toContain("May 18, 23:30 PDT");
    expect(html).not.toContain("Trade this market");
    expect(html).not.toContain('data-testid="trade-row-ticket"');
    expect(html).not.toContain('data-testid="trade-strike-select"');
    expect(html).toContain("Connect wallet first");
    expect(html).not.toContain("Predict account");
    expect(html).not.toContain('data-testid="predict-manager-object-id"');
  });

  test("renders available strike options as ladder rows", () => {
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
                strike: 71_000,
                strikeRaw: 71_000_000_000,
                strikeLabel: "$71,000",
              },
              {
                strike: 71_050,
                strikeRaw: 71_050_000_000,
                strikeLabel: "$71,050",
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

    expect(html).toContain('aria-label="Trade UP $71,000"');
    expect(html).toContain('aria-label="Trade DOWN $71,000"');
    expect(html).toContain('aria-label="Trade UP $71,050"');
    expect(html).toContain('aria-label="Trade DOWN $71,050"');
    expect(html).toContain("UP $71,050");
    expect(html).toContain("Wins if BTC settles above $71,050");
    expect(html).toContain("$0.40");
    expect(html).not.toContain("Pays $250");
    expect(html).toContain("Est. payout</small>Quote needed");
    expect(html).not.toContain("Est. payout</small>$250");
    expect(html).not.toContain('data-testid="trade-strike-select"');
    expect(html).not.toContain('data-testid="trade-custom-strike"');
  });

  test("limits the trade ladder to four prices around the active strike", () => {
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

    expect(html).not.toContain('aria-label="Trade UP $70,000"');
    expect(html).toContain('aria-label="Trade UP $71,000"');
    expect(html).toContain('aria-label="Trade UP $72,000"');
    expect(html).toContain('aria-label="Trade UP $73,000"');
    expect(html).toContain('aria-label="Trade UP $74,000"');
    expect(html).not.toContain('aria-label="Trade UP $75,000"');
  });

  test("keeps the oracle price marker visible when spot is above the ladder slice", () => {
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

    expect(html).toContain("Oracle price $76,000");
    expect(html.indexOf('aria-label="Trade DOWN $74,000"')).toBeLessThan(
      html.indexOf("Oracle price $76,000"),
    );
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

    expect(html).toContain('aria-label="Trade UP $71,050"');
    expect(html).toContain('aria-label="Trade UP $71,100"');
    expect(html).toContain("UP $71,050");
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
        selectedMarketId="btc-2h-72000"
        selectedSide="UP"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Spend</small>$25");
    expect(html).toContain("Est. payout</small>Quote needed");
    expect(html).toContain("Max profit</small>Quote needed");
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

    expect(html).toContain("Spend</small>$25");
    expect(html).toContain("$0.50");
    expect(html).not.toContain("Pays $49.96");
    expect(html).toContain("Est. payout</small>$49.96");
    expect(html).toContain("Max profit</small>+$24.98");
  });

  test("enables wallet submit only after wallet, manager, and quote are ready", () => {
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
