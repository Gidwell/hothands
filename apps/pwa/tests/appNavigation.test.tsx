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
        copyAmount={100}
        marketPriceLabel="$102,480"
        selectedInterval="15m"
        selectedSide="UP"
        onAmountSet={() => undefined}
        onIntervalChange={() => undefined}
        onSideChange={() => undefined}
        onWalletSubmit={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="trade-view"');
    expect(html).toContain("Make a BTC prediction");
    expect(html).toContain("UP");
    expect(html).toContain("DOWN");
    expect(html).toContain("15m");
    expect(html).toContain("1h");
    expect(html).toContain("1d");
    expect(html).toContain("Stake</small>$100");
    expect(html).toContain("Strike</small>$102,480");
    expect(html).toContain("Send to wallet");
  });
});
