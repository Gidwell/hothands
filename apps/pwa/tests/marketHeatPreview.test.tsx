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
    observedMint: 6_200,
    heatScore: 84,
    preparedCopies: 0,
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
        selectedRowId={row.id}
        onSelectRow={() => undefined}
        onCloseIntent={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="market-heat-intent-panel"');
    expect(html).toContain("Watch 0xaaaa...0000");
    expect(html).toContain("No copy prepared");
    expect(html).toContain("Copy waits for a ready mint");
    expect(html).not.toContain("Ready for user signature");
  });
});
