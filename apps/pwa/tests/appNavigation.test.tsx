import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BottomNav, TradeTicket } from "../src/App";

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
        availableMarkets={[
          {
            id: "btc-15m-71000",
            oracleId: "0xoracle15",
            pairLabel: "BTC/USD",
            intervalLabel: "15m",
            expiryMs: 1_779_165_900_000,
            expiryTimeLabel: "May 18, 21:45 PDT",
            strike: 71_000,
            strikeLabel: "$71,000",
            status: "active",
          },
          {
            id: "btc-2h-72000",
            oracleId: "0xoracle2h",
            pairLabel: "BTC/USD",
            intervalLabel: "2h",
            expiryMs: 1_779_172_200_000,
            expiryTimeLabel: "May 18, 23:30 PDT",
            strike: 72_000,
            strikeLabel: "$72,000",
            status: "active",
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
    expect(html).toContain("UP");
    expect(html).toContain("DOWN");
    expect(html).toContain("15m");
    expect(html).toContain("2h");
    expect(html).not.toContain("1d");
    expect(html).toContain("Stake</small>$100");
    expect(html).toContain("Strike</small>$72,000");
    expect(html).toContain("Expiry</small>May 18, 23:30 PDT");
    expect(html).toContain("Send to wallet");
  });
});
