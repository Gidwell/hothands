import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketHeatPreview, resolveMarketHeatSwipeAction } from "../src/App";
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
    quantity: 1_000_000,
    cost: 400_000,
    observedAtMs: 1_779_158_000_000,
    heatScore: 94,
    status: "copy_ready",
    walletStats: {
      totalPnl: 22_230_000,
      currentStreakType: "win",
      currentStreakLength: 12,
      lastSeenMs: 1_779_158_000_000,
    },
  },
];

describe("MarketHeatPreview component", () => {
  test("resolves compact row right swipes into safe actions", () => {
    expect(resolveMarketHeatSwipeAction(92, 6, "copy_ready")).toBe("submit");
    expect(resolveMarketHeatSwipeAction(92, 6, "watching")).toBe("select");
    expect(resolveMarketHeatSwipeAction(42, 6, "copy_ready")).toBe("none");
    expect(resolveMarketHeatSwipeAction(92, 44, "copy_ready")).toBe("none");
  });

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
      />,
    );

    expect(html).toContain('data-testid="market-heat-intent-panel"');
    expect(html).toContain('title="Captured BTC markets"');
    expect(html).toContain('aria-label="Alpha Feed, Captured BTC markets"');
    expect(html).not.toContain("<span>Captured BTC markets</span>");
    expect(html).toContain("Target</small>");
    expect(html).toContain("Below $6,200");
    expect(html).toContain("Next observed mint");
    expect(html).toContain("Stake amount");
    expect(html).toContain('data-testid="custom-copy-amount"');
    expect(html).toContain('aria-label="Custom copy amount"');
    expect(html).not.toContain("Copy now</strong>");
    expect(html).not.toContain("We&#x27;ll watch this wallet and prepare the next mint for your signature");
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
      />,
    );

    expect(html).toContain("Target</small>");
    expect(html).toContain("Above $7,100");
    expect(html).toContain("Cost</small><strong>$375");
    expect(html).toContain("Heat</small><strong>94");
    expect(html).not.toContain("Strike</small>");
    expect(html).toContain("Est. payout</small><strong>$937.50");
    expect(html).toContain("Max profit</small><strong>+$562.50");
    expect(html).toContain('data-testid="market-heat-wallet-submit"');
    expect(html).toContain("Confirm transaction");
    expect(html).not.toContain("Manager 0xbbbb...0000");
    expect(html).not.toContain("No wallet request until you tap Confirm transaction");
  });

  test("estimates copy payout for dust rows whose display cost rounds to zero", () => {
    const nowMs = 1_779_158_000_000;
    const [row] = buildMarketHeatPreview(
      [
        {
          id: "external-dust-copy",
          wallet: "0xa9f24640b32f33fcfa8582791e84a542251398acfc3b696f382a08a768b6ddbf",
          manager: "manager-dust",
          market: "BTC-USD",
          side: "UP",
          strike: 61_882,
          expiryMs: nowMs + 24 * 60 * 60_000,
          intervalLabel: "23d",
          quantity: 2,
          cost: 1,
          costUsd: 0.000001,
          observedAtMs: nowMs - 60_000,
          heatScore: 16,
          status: "copy_ready",
        },
      ],
      1,
      { nowMs },
    ).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={[row]}
        sourceLabel="Indexed Testnet"
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
      />,
    );

    expect(html).toContain("Est. payout</small><strong>$50");
    expect(html).toContain("Max profit</small><strong>+$25");
    expect(html).not.toContain("Quote needed");
  });

  test("keeps feed wallet notifications in the toast layer", () => {
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
        copyAmount={25}
        showMoreLabel="Show more"
        onAmountSet={() => undefined}
        onShowExpiredChange={() => undefined}
        onShowMore={() => undefined}
        onSortModeChange={() => undefined}
        onWalletSubmit={() => undefined}
        onSelectRow={() => undefined}
      />,
    );

    expect(html).not.toContain("Copy transaction sent.");
    expect(html).not.toContain("Wallet request started");
  });

  test("explains an empty live feed without hiding the expired-position toggle", () => {
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={[]}
        sourceLabel="Indexed Testnet"
        sortMode="latest"
        selectedRowId={null}
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
      />,
    );

    expect(html).toContain('data-testid="market-heat-empty"');
    expect(html).toContain("No live positions right now");
    expect(html).toContain("Show expired to review recent testnet activity.");
    expect(html).toContain('data-testid="market-heat-show-expired"');
  });

  test("keeps show-more available in the compact feed", () => {
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
      />,
    );

    expect(html).toContain('data-testid="market-heat-show-more"');
    expect(html).toContain("Show 2 more");
  });

  test("renders market duration toggle buttons", () => {
    const rows = buildMarketHeatPreview(watchingOnlyRows, 1).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={rows}
        sourceLabel="Live Testnet"
        sortMode="latest"
        selectedDuration="1h"
        durationOptions={[
          { count: rows.length, label: "1h", value: "1h" },
          { count: 2, label: "1d", value: "1d" },
        ]}
        showExpired={false}
        canShowMore={false}
        copyAmount={25}
        showMoreLabel="Show more"
        selectedRowId={null}
        onAmountSet={() => undefined}
        onDurationChange={() => undefined}
        onShowExpiredChange={() => undefined}
        onShowMore={() => undefined}
        onSortModeChange={() => undefined}
        onWalletSubmit={() => undefined}
        onSelectRow={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="market-duration-all"');
    expect(html).toContain('data-testid="market-duration-1h"');
    expect(html).toContain('data-testid="market-duration-1d"');
    expect(html).toContain("All");
    expect(html).toContain("1h");
    expect(html).toContain("1d");
    expect(html).toContain('aria-pressed="true"');
  });

  test("renders compact feed rows for faster scanning", () => {
    const [row] = buildMarketHeatPreview(copyReadyRows, 1, {
      nowMs: 1_779_158_000_000,
    }).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={[row]}
        sourceLabel="Live Testnet"
        sortMode="latest"
        selectedRowId={null}
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
      />,
    );

    expect(html).toContain("market-heat-list-compact");
    expect(html).toContain("market-heat-row-compact");
    expect(html).not.toContain("market-heat-density-toggle");
    expect(html).not.toContain("Expanded");
    expect(html).toContain("Wallet");
    expect(html).toContain("Direction");
    expect(html).toContain("Expiration");
    expect(html).toContain("0xbbbb...0000");
    expect(html).toContain("+$22.23 · 12 wins · just now");
    expect(html).toContain("UP");
    expect(html).toContain("$7,100");
    expect(html).toContain("3h left");
    expect(html).toContain("Heat");
    expect(html).toContain("94");
    expect(html).not.toContain("Cost</small>");
    expect(html).not.toContain("Expiry</small>");
  });
});
