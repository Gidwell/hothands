import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketHeatPreview } from "../src/App";
import { buildMarketHeatPreview, type MarketHeatPreviewRowInput } from "../src/marketHeatModel";

const watchingOnlyRows: MarketHeatPreviewRowInput[] = [
  {
    id: "external-watch",
    wallet: "0xaaaa222233334444555566667777888899990000",
    manager: "manager 0xaaaa...0000",
    market: "BTC-USD",
    side: "DOWN",
    strike: 6_200,
    expiryMs: 1_779_158_400_000,
    intervalLabel: "1h",
    observedAtMs: 1_779_158_000_000,
    heatScore: 84,
    status: "watching",
  },
];

const copyReadyRows: MarketHeatPreviewRowInput[] = [
  {
    id: "external-copy",
    wallet: "0xbbbb222233334444555566667777888899990000",
    manager: "manager 0xbbbb...0000",
    market: "BTC-USD",
    side: "UP",
    strike: 7_100,
    expiryMs: 1_779_165_600_000,
    intervalLabel: "2h",
    observedAtMs: 1_779_158_000_000,
    heatScore: 94,
    status: "copy_ready",
  },
];

describe("MarketHeatPreview component", () => {
  test("renders a compact inline watch panel for the selected row", () => {
    const [row] = buildMarketHeatPreview(watchingOnlyRows, 1).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={[row]}
        sourceLabel="Captured"
        sortMode="latest"
        selectedRowId={row.id}
        showExpired={false}
        canShowMore={false}
        copyAmount={25}
        showMoreLabel="Show more"
        onAmountSet={() => undefined}
        onShowExpiredChange={() => undefined}
        onShowMore={() => undefined}
        onSortModeChange={() => undefined}
        onWalletSubmit={() => undefined}
        onSelectRow={() => undefined}
        onCloseIntent={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="market-heat-intent-panel"');
    expect(html).toContain("Watch 0xaaaa...0000");
    expect(html).toContain("Next observed mint");
    expect(html).toContain('data-testid="custom-copy-amount"');
    expect(html).toContain('aria-label="Custom copy amount"');
    expect(html).toContain("We&#x27;ll watch this wallet and prepare the next mint for your signature");
    expect(html).not.toContain("Manager 0xaaaa...0000");
    expect(html).not.toContain("Hot Hands prepares the transaction");
    expect(html).toContain('data-testid="market-heat-sort-latest"');
    expect(html).toContain('data-testid="market-heat-show-expired"');
    expect(html).toContain("Show expired");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("Ready for your wallet signature");
  });

  test("requires an explicit wallet handoff after selecting copy amount", () => {
    const [row] = buildMarketHeatPreview(copyReadyRows, 1, {
      nowMs: 1_779_158_000_000,
    }).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={[row]}
        sourceLabel="Live Testnet"
        sortMode="latest"
        selectedRowId={row.id}
        showExpired={false}
        canShowMore={false}
        copyAmount={375}
        showMoreLabel="Show more"
        onAmountSet={() => undefined}
        onShowExpiredChange={() => undefined}
        onShowMore={() => undefined}
        onSortModeChange={() => undefined}
        onWalletSubmit={() => undefined}
        onSelectRow={() => undefined}
        onCloseIntent={() => undefined}
      />,
    );

    expect(html).toContain("Stake</small>$375");
    expect(html).toContain('data-testid="market-heat-wallet-submit"');
    expect(html).toContain("Send to wallet");
    expect(html).not.toContain("Manager 0xbbbb...0000");
    expect(html).not.toContain("No wallet request until you tap Send to wallet");
  });

  test("renders a bottom show-more control when more feed rows are available", () => {
    const rows = buildMarketHeatPreview(
      Array.from({ length: 10 }, (_, index) => ({
        ...watchingOnlyRows[0],
        id: `external-watch-${index}`,
        observedAtMs: 1_779_158_000_000 - index * 60_000,
      })),
      10,
    ).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={rows.slice(0, 8)}
        sourceLabel="Live Testnet"
        sortMode="latest"
        selectedRowId={null}
        showExpired={false}
        canShowMore={true}
        copyAmount={25}
        showMoreLabel="Show 2 more"
        onAmountSet={() => undefined}
        onShowExpiredChange={() => undefined}
        onShowMore={() => undefined}
        onSortModeChange={() => undefined}
        onWalletSubmit={() => undefined}
        onSelectRow={() => undefined}
        onCloseIntent={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="market-heat-show-more"');
    expect(html).toContain("Show 2 more");
  });
});
