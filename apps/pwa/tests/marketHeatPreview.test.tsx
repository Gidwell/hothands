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

describe("MarketHeatPreview component", () => {
  test("renders a compact inline watch panel for the selected row", () => {
    const [row] = buildMarketHeatPreview(watchingOnlyRows, 1).rows;
    const html = renderToStaticMarkup(
      <MarketHeatPreview
        rows={[row]}
        sourceLabel="Captured"
        sortMode="latest"
        selectedRowId={row.id}
        copyAmount={25}
        onAmountSet={() => undefined}
        onSortModeChange={() => undefined}
        onSelectRow={() => undefined}
        onCloseIntent={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="market-heat-intent-panel"');
    expect(html).toContain("Watch 0xaaaa...0000");
    expect(html).toContain("Next observed mint");
    expect(html).toContain("We&#x27;ll watch this wallet and prepare the next mint for your signature");
    expect(html).toContain("Hot Hands prepares the transaction");
    expect(html).toContain('data-testid="market-heat-sort-latest"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("Ready for your wallet signature");
  });
});
