import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav, TradeTicket, WalletStatusBar } from "../src/App";

describe("mobile app navigation", () => {
  test("renders feed and trade as bottom navigation tabs", () => {
    const html = renderToStaticMarkup(
      <BottomNav activeView="feed" onViewChange={() => undefined} />,
    );

    expect(html).toContain('data-testid="bottom-nav"');
    expect(html).toContain("🔥 Feed");
    expect(html).toContain("↔ Trade");
    expect(html).toContain('aria-pressed="true"');
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
        selectedMarketId="btc-2h-72000"
        selectedSide="UP"
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="trade-view"');
    expect(html).toContain("Make a BTC prediction");
    expect(html).toContain("Pick a market");
    expect(html).toContain("UP");
    expect(html).toContain("DOWN");
    expect(html).toContain("15m left");
    expect(html).toContain("15m round");
    expect(html).toContain("3 wallets · 5 trades · $42.25");
    expect(html).toContain("UP 2 wallets");
    expect(html).toContain("DOWN 1 wallet");
    expect(html).not.toContain("1d");
    expect(html).toContain("Spend</small>$100");
    expect(html).toContain("Est. payout</small>$250");
    expect(html).toContain("Max profit</small>+$150");
    expect(html).toContain("Strike</small>$72,000");
    expect(html).toContain("Expiry</small>May 18, 23:30 PDT");
    expect(html).toContain("Trade this market");
    expect(html.indexOf("2h left")).toBeLessThan(html.indexOf("Trade this market"));
    expect(html.indexOf("Trade this market")).toBeLessThan(html.indexOf("4h left"));
    expect(html).toContain("Connect wallet first");
    expect(html).not.toContain("Predict account");
    expect(html).not.toContain('data-testid="predict-manager-object-id"');
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

  test("shows a discovered Predict account in the connected wallet bar", () => {
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

    expect(html).toContain("Predict account 0x0000...bbbb");
    expect(html).not.toContain('data-testid="create-predict-manager"');
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
    expect(html).toContain("Est. payout</small>$49.96");
    expect(html).toContain("Max profit</small>+$24.98");
    expect(html).not.toContain("Quote needed");
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
        walletStatusLabel="Trade transaction sent."
        walletSubmitted={true}
        onAmountSet={() => undefined}
        onMarketChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain(">Send to wallet</button>");
    expect(html).not.toContain("disabled");
    expect(html).toContain("Trade transaction sent.");
  });
});
